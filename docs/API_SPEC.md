# API Specification

## Base URL

- **Development**: `http://localhost:3000`
- **Production**: `https://api.crewio.com`

All endpoints require Bearer token in Authorization header (except auth endpoints).

```
Authorization: Bearer <jwt_token>
```

---

## Auth Module

### Register

```
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe",
  "phone": "+1234567890"  // optional
}

Response (201):
{
  "user": {
    "id": "645f...",
    "email": "user@example.com",
    "name": "John Doe",
    "status": "active",
    "createdAt": "2026-05-02T12:00:00Z"
  },
  "accessToken": "eyJhbG...",
  "refreshToken": "eyJhbG..."  // For web only
}

Error (400):
{
  "statusCode": 400,
  "message": "Email already exists"
}
```

### Login

```
POST /api/auth/login
Content-Type: application/json
Authorization: (none)

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

Response (200):
{
  "user": { ... },
  "accessToken": "eyJhbG..."
}

Error (401):
{
  "statusCode": 401,
  "message": "Invalid credentials"
}
```

### Refresh Token

```
POST /api/auth/refresh
Authorization: Bearer <access_token>

Response (200):
{
  "accessToken": "eyJhbG..."
}

Error (401):
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### Logout

```
POST /api/auth/logout
Authorization: Bearer <access_token>

Response (200):
{
  "message": "Logged out successfully"
}
```

---

## Users Module

### Get Current User

```
GET /api/users/me
Authorization: Bearer <access_token>

Response (200):
{
  "_id": "645f...",
  "email": "user@example.com",
  "name": "John Doe",
  "phone": "+1234567890",
  "status": "active",
  "lastSeen": "2026-05-02T14:30:00Z",
  "lastLocation": {
    "type": "Point",
    "coordinates": [-74.0060, 40.7128]  // [lng, lat]
  }
}
```

### Get User by ID

```
GET /api/users/:id
Authorization: Bearer <access_token>

Response (200): { user object }

Error (404):
{
  "statusCode": 404,
  "message": "User not found"
}
```

---

## Messages Module

### Create Conversation

```
POST /api/conversations
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "participantIds": ["645f...", "645g..."],
  "name": "Project Alpha"  // optional, for groups
}

Response (201):
{
  "_id": "conv_123",
  "participants": ["645f...", "645g..."],
  "type": "direct",
  "lastMessage": null,
  "lastMessageAt": null,
  "createdAt": "2026-05-02T12:00:00Z"
}
```

### List Conversations

```
GET /api/conversations
Authorization: Bearer <access_token>

Response (200):
{
  "conversations": [
    {
      "_id": "conv_123",
      "participants": [...],
      "lastMessage": "Thanks!",
      "lastMessageAt": "2026-05-02T14:30:00Z"
    }
  ]
}
```

### Send Message

```
POST /api/conversations/:conversationId/messages
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "content": "Hello, team!",
  "opId": "abc-123-def-456"  // Required for sync (UUID)
}

Response (201):
{
  "_id": "msg_789",
  "opId": "abc-123-def-456",
  "conversationId": "conv_123",
  "senderId": "645f...",
  "content": "Hello, team!",
  "status": "sent",
  "createdAt": "2026-05-02T14:35:00Z"
}

Error (409):
{
  "statusCode": 409,
  "message": "Duplicate operation ID"
}
```

### Get Messages

```
GET /api/conversations/:conversationId/messages?since=2026-05-02T12:00:00Z&limit=50
Authorization: Bearer <access_token>

Response (200):
{
  "messages": [
    {
      "_id": "msg_123",
      "opId": "xyz-789",
      "conversationId": "conv_123",
      "senderId": "645f...",
      "content": "Hi there",
      "status": "read",
      "readBy": ["645g..."],
      "createdAt": "2026-05-02T14:30:00Z"
    }
  ]
}
```

### Mark Messages as Read

```
POST /api/conversations/:conversationId/mark-read
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "messageIds": ["msg_123", "msg_124", "msg_125"]
}

Response (200):
{
  "success": true
}
```

---

## Attendance Module

### Check-In

```
POST /api/attendance/check-in
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "location": {
    "lat": 40.7128,
    "lng": -74.0060
  },
  "deviceId": "device_uuid_12345"
}

Response (201):
{
  "_id": "att_123",
  "userId": "645f...",
  "date": "2026-05-02",
  "checkInTime": "2026-05-02T09:30:00Z",
  "checkInLocation": { "lat": 40.7128, "lng": -74.0060 },
  "status": "present"
}

Error (400):
{
  "statusCode": 400,
  "message": "Invalid location data"
}
```

### Check-Out

```
POST /api/attendance/check-out
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "location": {
    "lat": 40.7128,
    "lng": -74.0060
  },
  "deviceId": "device_uuid_12345"
}

Response (201):
{
  "_id": "att_123",
  "userId": "645f...",
  "date": "2026-05-02",
  "checkInTime": "2026-05-02T09:30:00Z",
  "checkOutTime": "2026-05-02T18:00:00Z",
  "checkInLocation": { ... },
  "checkOutLocation": { "lat": 40.7128, "lng": -74.0060 },
  "status": "present"
}
```

### Get Today's Attendance

```
GET /api/attendance/today
Authorization: Bearer <access_token>

Response (200):
{
  "_id": "att_123",
  "userId": "645f...",
  "date": "2026-05-02",
  "checkInTime": "2026-05-02T09:30:00Z",
  "checkOutTime": "2026-05-02T18:00:00Z",
  "status": "present"
}

Error (404):
{
  "statusCode": 404,
  "message": "No attendance record for today"
}
```

### Get Attendance Range

```
GET /api/attendance?from=2026-05-01&to=2026-05-31
Authorization: Bearer <access_token>

Response (200):
{
  "records": [
    {
      "_id": "att_123",
      "date": "2026-05-01",
      "checkInTime": "2026-05-01T09:30:00Z",
      "checkOutTime": "2026-05-01T18:00:00Z",
      "status": "present"
    },
    {
      "_id": "att_124",
      "date": "2026-05-02",
      "checkInTime": "2026-05-02T09:30:00Z",
      "checkOutTime": null,
      "status": "present"
    }
  ],
  "count": 2
}
```

---

## Sync Module

### Apply Operations (Batch)

```
POST /api/sync/ops
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "ops": [
    {
      "opId": "uuid-1",
      "type": "attendance",
      "payload": {
        "action": "checkin",
        "location": { "lat": 40.7128, "lng": -74.0060 },
        "deviceId": "device_123"
      }
    },
    {
      "opId": "uuid-2",
      "type": "message",
      "payload": {
        "conversationId": "conv_123",
        "content": "Hi!",
        "timestamp": "2026-05-02T09:00:00Z"
      }
    }
  ]
}

Response (200):
{
  "applied": 2,
  "ops": [
    {
      "opId": "uuid-1",
      "status": "applied",
      "createdAt": "2026-05-02T09:00:00Z",
      "appliedAt": "2026-05-02T09:05:00Z"
    },
    {
      "opId": "uuid-2",
      "status": "applied",
      ...
    }
  ]
}

Error (400):
{
  "statusCode": 400,
  "message": "Invalid operation type"
}
```

### Get Changes (Polling)

```
GET /api/sync/changes?since=2026-05-02T12:00:00Z&limit=100
Authorization: Bearer <access_token>

Response (200):
{
  "changes": [
    {
      "opId": "uuid-1",
      "userId": "645f...",
      "type": "attendance",
      "payload": { ... },
      "appliedAt": "2026-05-02T12:05:00Z"
    },
    {
      "opId": "uuid-2",
      "userId": "645f...",
      "type": "message",
      "payload": { ... },
      "appliedAt": "2026-05-02T12:06:00Z"
    }
  ],
  "count": 2
}
```

### Get Operation Status

```
GET /api/sync/ops/:opId
Authorization: Bearer <access_token>

Response (200):
{
  "opId": "uuid-1",
  "status": "applied",
  "type": "attendance",
  "createdAt": "2026-05-02T09:00:00Z",
  "appliedAt": "2026-05-02T09:05:00Z"
}

Error (404):
{
  "statusCode": 404,
  "message": "Operation not found"
}
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (invalid/missing token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 409 | Conflict (duplicate opId, stale version) |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |

---

## Rate Limiting

- **Auth endpoints**: 5 requests per minute per IP
- **Message endpoints**: 100 requests per minute per user
- **Attendance endpoints**: 50 requests per minute per user
- **Sync endpoints**: 200 requests per minute per user

---

## WebSocket Events

See [SYNC_PROTOCOL.md](./SYNC_PROTOCOL.md#websocket-events-for-real-time-sync) for detailed WebSocket event documentation.

---

**Last Updated**: May 2, 2026  
**Version**: 1.0
