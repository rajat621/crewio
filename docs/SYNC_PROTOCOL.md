# Sync Protocol: Custom Offline-First Implementation

## Overview

This document describes how CrewIO implements offline-first data synchronization for mobile/PWA clients. The system uses **operation-based sync** with **idempotency** and **server-authoritative conflict resolution**.

---

## Architecture

```
┌─────────────────────┐
│   Mobile Client     │
│  (Flutter + Isar)   │
└──────────┬──────────┘
           │ (ops queue)
           ▼
┌─────────────────────┐
│  Local Isar DB      │
│  • Outbox (ops)     │
│  • Messages         │
│  • Attendance       │
└──────────┬──────────┘
           │ (sync when online)
           ▼
┌─────────────────────┐
│   Connectivity      │
│   Layer             │
│ (socket.io + REST)  │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────┐
│  Backend (NestJS)        │
│ • Auth, Sync Endpoints   │
│ • Operations Collection  │
│ • Change Stream          │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  MongoDB                 │
│ • Operations (audit)     │
│ • Messages, Attendance   │
│ • Users                  │
└──────────────────────────┘
```

---

## Operation Model

### What is an Operation?

An operation (op) is a **client-issued action** that modifies server state. Each op has:

```typescript
interface Operation {
  opId: string;           // UUID - unique across all clients
  clientId: string;       // Which client issued this
  userId: string;         // Which user owns it
  type: "attendance" | "message" | "profile_update";
  payload: object;        // Type-specific data
  timestamp: DateTime;    // Client time (for ordering)
  status: "applied" | "failed";
  appliedAt: DateTime;    // Server time when applied
}
```

### Why opId?

**Idempotency**: If the same op is received twice, applying it twice = same result as once.

```
Client sends:  { opId: "abc-123", type: "checkin", ... }
Server applies (attempt 1):  ✅ Inserted
Network fails... Client retries
Server receives again:  { opId: "abc-123", ... }
Server checks unique index on opId:  ✅ Duplicate! Return existing result
```

---

## Sync Flow: Step-by-Step

### 1. User Takes Action (Online or Offline)

```
Client (Flutter)
  → User clicks "Check In"
  → Generate opId = uuid()
  → Queue locally: { opId, type: "attendance", payload: {...} }
  → Store in Isar.outbox with status="queued"
  → Show optimistic UI update
```

### 2. Detect Connectivity

```
Connectivity.onChanged → { online: true }
  → Trigger SyncService.startPeriodicSync()
  → Run every 30 seconds: syncPendingOps()
```

### 3. Batch & Send Pending Ops

```
SyncService.syncPendingOps()
  → Query Isar.outbox where status="queued"
  → Group into batches (max 100 per request)
  → POST /api/sync/ops
    {
      ops: [
        { opId: "uuid1", type: "attendance", payload: {...} },
        { opId: "uuid2", type: "message", payload: {...} }
      ]
    }
  → Update Isar.outbox[i].status = "syncing"
```

### 4. Server Receives & Applies

```
POST /api/sync/ops
  → Validate JWT token
  → For each op in batch:
    ├─ Check if opId already in db (duplicate?)
    │  ├─ YES: Return existing result (idempotent)
    │  └─ NO: Apply operation
    ├─ Call appropriate handler (checkin / sendMessage / etc)
    └─ Store in `operations` collection with status="applied"
  → Return: { applied: 2, ops: [...results] }
```

### 5. Client Confirms Sync

```
Receive response
  → For each op in response:
    ├─ Update Isar.outbox[opId].status = "done"
    ├─ Remove from outbox (optional - keep for audit)
    └─ UI changes from "pending" → "sent"
```

### 6. Pull Server Changes (Polling or WebSocket)

```
Option A: Polling (simple)
  → GET /api/sync/changes?since=2026-05-02T12:00:00Z&limit=100
  → Response: { changes: [ {...}, {...} ], count: 2 }
  → Apply to local DB: Isar.messages.put(change)

Option B: WebSocket (real-time)
  → Listen on socket 'sync:changes'
  → Server emits as ops are applied
  → Immediately update local DB
```

---

## Conflict Resolution Rules

### Attendance (Per User + Date)

**Rule**: Last-write-wins using **server timestamp** (not client time).

**Example**:
```
Client A checks in at 9:00 AM (offline, op timestamped locally as 9:00)
Client A checks in again at 9:05 AM (now online, op sent immediately)
Server receives:
  - Op 1: opId="x", action="checkin", client_time=09:00, applied_at=10:30 (server)
  - Op 2: opId="y", action="checkin", client_time=09:05, applied_at=10:32 (server)

Result: Op 2 wins (later server timestamp)
```

**Why server time?** Prevents clock-skewed devices from overwriting real check-ins.

### Messages (Append-Only)

**Rule**: No conflicts — each message is unique.

- Every message gets unique `opId`
- Server enforces `opId` uniqueness → deduplicates retries
- Order by `createdAt` (client) + `appliedAt` (server tiebreaker)

**Edits/Deletes**: Separate ops referencing original message ID.

### Profile Updates (Version-Based)

**Rule**: Optimistic locking with version numbers.

```
Client reads: { version: 5, name: "John", ... }
Client modifies: { version: 5, name: "John Doe", ... }
PUT /api/users/:id
  {
    data: { name: "John Doe" },
    version: 5
  }

Server check:
  - Current DB version = 5? ✅ YES → Apply, increment to 6
  - Current DB version ≠ 5? ❌ NO → Return conflict 409
    Client retries with new version
```

---

## Data Model: Operation Schema

```javascript
// MongoDB collection: operations
db.createCollection("operations");

db.operations.insertOne({
  _id: ObjectId(),
  
  // Idempotency
  opId: "550e8400-e29b-41d4-a716-446655440000",  // UNIQUE
  clientId: "client_abc_123",
  
  // Ownership
  userId: ObjectId("645f..."),
  
  // Operation details
  type: "attendance",  // "attendance" | "message" | "profile_update"
  payload: {
    action: "checkin",
    location: { lat: 40.7128, lng: -74.0060 },
    deviceId: "device_uuid",
  },
  
  // Status
  status: "applied",  // "applied" | "failed"
  error: null,        // Error message if failed
  
  // Timestamps
  createdAt: ISODate("2026-05-02T09:00:00Z"),   // Client time
  appliedAt: ISODate("2026-05-02T09:05:00Z"),   // Server time
  
  // Audit
  attempts: 1,
  source: "mobile_app",  // mobile | web | admin_api
  ipAddress: "192.168.1.1",
});

// Indexes for performance
db.operations.createIndex({ opId: 1 }, { unique: true });
db.operations.createIndex({ userId: 1, appliedAt: -1 });
db.operations.createIndex({ status: 1, appliedAt: -1 });
```

---

## Network Scenarios & Handling

### Scenario 1: Complete Offline

```
User goes offline
  → SyncService detects: Connectivity.none
  → Stop periodic sync
  → User actions queued locally: Isar.outbox
  → UI shows "offline" indicator
  
User comes online
  → SyncService detects: Connectivity.mobile / .wifi
  → Start periodic sync immediately
  → Retry all queued ops
  → UI refreshes with latest data
```

### Scenario 2: Flaky Connection

```
Sync attempt 1: POST /api/sync/ops → TIMEOUT
  → Mark in outbox: attempts++
  → Retry in 30s

Sync attempt 2: POST /api/sync/ops → 200 OK (but response lost)
  → Server already stored op
  → Client retries in 30s
  → Server returns duplicate detection (idempotent) → ✅ OK

Sync attempt 3: POST /api/sync/ops → 200 OK (response received)
  → Mark as "done"
  → Remove from outbox
```

### Scenario 3: Server Error

```
POST /api/sync/ops → 500 Internal Server Error
  → Store error in Isar.outbox[op].error = "500 Internal Server Error"
  → Retry in next sync cycle
  → After 3 failed attempts, move to manual review queue
  → Admin dashboard shows failed ops for retry
```

---

## WebSocket Events for Real-Time Sync

### Client → Server

```typescript
// Send message (also works offline)
socket.emit('message', {
  conversationId: '...',
  content: 'Hello',
  opId: '...',  // For idempotency
});

// Pull changes since timestamp
socket.emit('sync:pull', {
  since: '2026-05-02T12:00:00Z',
  limit: 100,
});

// Presence
socket.emit('presence', {
  status: 'typing',  // or 'online', 'away'
});
```

### Server → Client

```typescript
// Acknowledgment
socket.on('message:sent', {
  opId: '...',
  messageId: 'msg_abc',
  status: 'sent',
});

// New message from others
socket.on('message:new', {
  messageId: 'msg_xyz',
  conversationId: '...',
  senderId: '...',
  content: '...',
  createdAt: '2026-05-02T12:30:00Z',
});

// Real-time changes
socket.on('sync:changes', {
  changes: [
    { opId: 'x', type: 'attendance', ... },
    { opId: 'y', type: 'message', ... },
  ],
  count: 2,
});

// Presence
socket.on('presence', {
  userId: '...',
  status: 'typing',
  timestamp: '2026-05-02T12:31:00Z',
});
```

---

## Implementation Checklist

### Client (Flutter)

- [x] Isar outbox table with `opId`, `type`, `payload`, `status`
- [x] Generate UUIDs for each op
- [x] Queue ops locally on every user action
- [x] Detect connectivity changes
- [x] Periodic sync timer (30s)
- [x] Batch pending ops → POST /api/sync/ops
- [x] Update outbox status after response
- [x] WebSocket listener for real-time changes
- [x] Conflict handling (show merge UI if needed)
- [ ] Retry logic with exponential backoff
- [ ] Push notifications on new messages
- [ ] Background sync (workmanager / Background Sync API)

### Server (Backend)

- [x] Operation schema with unique opId index
- [x] POST /api/sync/ops endpoint
- [x] Duplicate detection (catch `E11000` MongoDB error)
- [x] Type-specific handlers (checkin, sendMessage, etc)
- [x] Timestamp application (appliedAt)
- [x] GET /api/sync/changes for polling
- [x] WebSocket gateway for real-time
- [x] Change stream to detect new ops
- [ ] Monitoring & alerting for failed ops
- [ ] Automatic retry for transient failures
- [ ] Admin UI for manual retry

---

## Performance & Scaling

### Local DB (Isar)

- Embedded → No network latency
- Fast queries on indexed fields
- Handles 100K+ records on mobile
- Automatic cleanup of "done" ops

### Batching

- Send max 100 ops per request
- Reduces network requests
- Keeps latency under 5s

### Indexing (MongoDB)

```javascript
// Required indexes
db.operations.createIndex({ opId: 1 }, { unique: true });
db.operations.createIndex({ userId: 1, appliedAt: -1 });
db.operations.createIndex({ status: 1, createdAt: -1 });

// Optional for faster queries
db.messages.createIndex({ conversationId: 1, createdAt: -1 });
db.attendance.createIndex({ userId: 1, date: 1 }, { unique: true });
```

### Monitoring

- Track sync latency (P50, P95, P99)
- Failed ops rate
- Offline duration distribution
- Duplicate detection frequency

---

## Testing

### Unit Tests

```typescript
describe('SyncService', () => {
  it('should queue ops locally', async () => {
    const op = { opId: '...', type: 'attendance', ... };
    await syncService.queueOperation(op);
    const pending = await localDb.getPendingOps();
    expect(pending).toContain(op);
  });

  it('should deduplicate ops by opId', async () => {
    const op1 = { opId: 'abc', ... };
    await api.applyOps([op1]);
    const response1 = await api.applyOps([op1]);  // Retry
    expect(response1.applied).toBe(1);  // Idempotent
  });
});
```

### E2E Tests

```typescript
describe('Offline Sync E2E', () => {
  it('should sync when reconnecting', async () => {
    // User offline: queue op
    connectivity.emit('none');
    await sendMessage(...);

    // User online: sync
    connectivity.emit('wifi');
    await sleep(2000);  // Wait for sync cycle
    const msg = await api.getMessage(...);
    expect(msg.status).toBe('sent');
  });

  it('should handle conflicts on profile update', async () => {
    // Client A updates name
    // Client B updates phone
    // Both apply without conflict
    const user = await api.getUser(...);
    expect(user.name).toBe('...');
    expect(user.phone).toBe('...');
  });
});
```

---

## References & Further Reading

1. **Operational Transformation**: CRDTs as alternative to OT
2. **Event Sourcing**: Store ops as immutable events
3. **MongoDB Change Streams**: Real-time data sync
4. **Hybrid Logical Clocks**: Better ordering without server time

---

**Last Updated**: May 2, 2026  
**Status**: ✅ Design Complete | Ready for Implementation
