import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { getAllowedOrigins, isAllowedOrigin } from '../config/corsOrigins.js';
import Employee from '../models/Employee.js';
import redisConnection from '../queue/redis.connection.js';

/**
 * Real-time layer for CrewControl.
 *
 * Two logical audiences share one Socket.IO server:
 *  - Dashboard clients (MERN admin/office users) join room `owner:<ownerId>`
 *    and receive every employee lifecycle/location event for that tenant.
 *  - Employee mobile clients join room `employee:<employeeId>` so the
 *    dashboard can push on-demand actions to a specific device (e.g.
 *    "send me your current location right now").
 *
 * Auth reuses the exact same JWTs issued by the existing REST auth flows
 * (admin tokens from auth.controller.js, employee tokens from
 * mobileAuth.controller.js) - no separate socket-only credential to manage.
 */

let io = null;

export const initSocket = (httpServer) => {
  if (io) return io;

  const allowedOrigins = getAllowedOrigins();

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin, allowedOrigins)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
    // Mobile clients on flaky networks benefit from allowing polling as a
    // fallback rather than requiring an immediate websocket upgrade.
    transports: ['websocket', 'polling'],
  });

  // Without this, io.to(room).emit(...) (used by every emitTo* helper
  // below) only reaches sockets connected to THIS process - horizontally
  // scaling the API to more than one Railway replica would silently break
  // realtime delivery for any client connected to a different replica
  // than the one handling the emit. Reuses the same shared Redis
  // connection as everything else (BullMQ, cache) via .duplicate() - the
  // adapter needs its own dedicated pub/sub connections, it can't share
  // the primary connection's command queue.
  if (redisConnection) {
    const pubClient = redisConnection.duplicate();
    const subClient = redisConnection.duplicate();
    // redis.connection.js only attaches an 'error' listener to the
    // ORIGINAL connection - .duplicate() returns brand-new ioredis
    // instances that don't inherit it.
    pubClient.on('error', (err) => console.error('[socket] redis pub client error:', err.message));
    subClient.on('error', (err) => console.error('[socket] redis sub client error:', err.message));

    // createAdapter()'s constructor immediately calls subClient.subscribe(...)
    // with no .catch() of its own. When Redis can't actually serve commands
    // right now (down, or - as happened in production - the Upstash plan's
    // monthly command quota fully exhausted), that SUBSCRIBE rejects with
    // nothing to catch it: an unhandled promise rejection that server.js's
    // safety net treats as a fatal, corrupted-state crash, taking the whole
    // API down in a loop on every restart. Ping first and only wire the
    // adapter up if Redis actually answers, so a Redis outage degrades
    // realtime delivery to single-instance-only instead of crash-looping
    // the entire backend - the same fail-open philosophy already used for
    // caching (cache.util.js) and rate limiting (rateLimiters.js).
    Promise.all([pubClient.ping(), subClient.ping()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log('[socket] Redis adapter attached for cross-replica realtime delivery.');
      })
      .catch((err) => {
        console.error('[socket] Redis unavailable, running single-instance only (no cross-replica realtime delivery):', err.message);
        pubClient.disconnect();
        subClient.disconnect();
      });
  } else {
    console.warn('[socket] Redis disabled - Socket.IO adapter running single-instance only. Realtime events will NOT reach clients on other replicas if this API is horizontally scaled.');
  }

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization || '').split(' ')[1];

      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
      if (decoded.tokenType === 'refresh') return next(new Error('Refresh token cannot be used for sockets'));

      socket.decoded = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const decoded = socket.decoded || {};

    if (decoded.role === 'employee') {
      socket.join(`employee:${decoded.employeeId}`);
      if (decoded.ownerId) socket.join(`owner:${decoded.ownerId}`);
    } else {
      // Dashboard/admin user. `owner:<ownerId>` is shared with every
      // employee of this tenant (see above - intentional for company-wide
      // lifecycle/location broadcasts), so anything scoped to ONLY the
      // office/admin side (e.g. one employee's private chat reaching the
      // dashboard) must use `dashboard:<ownerId>` instead, which employees
      // never join.
      const ownerId = decoded.ownerId || decoded.userId;
      if (ownerId) {
        socket.join(`owner:${ownerId}`);
        socket.join(`dashboard:${ownerId}`);
      }
    }

    // Dashboard asking a specific employee's app to push its current
    // location immediately (on-demand location request).
    //
    // D19.7 finding (real, exploitable DoS): Socket.IO events never pass
    // through `express-mongo-sanitize` - that's Express HTTP middleware
    // only, so it does nothing for socket payloads. This handler queried
    // `Employee.findOne({_id: targetEmployeeId, ...})` with
    // `targetEmployeeId` taken directly from the client payload, unvalidated:
    //   1. A NoSQL operator object (e.g. `{employeeId: {$ne: null}}`) is
    //      valid MongoDB query syntax for any field, not just this one -
    //      Mongoose passes it through as a real query rather than casting
    //      it, letting an authenticated owner target "any employee of my
    //      tenant" without knowing a real ID. Contained to the requester's
    //      own tenant (ownerId is still server-derived), so this alone is
    //      low-impact, but it's the same operator-injection class
    //      `mongoSanitize()` exists to block on every HTTP route - sockets
    //      just weren't covered.
    //   2. Far more serious: a malformed non-ObjectId value (a plain
    //      invalid string, a number, etc.) makes Mongoose's query-cast
    //      layer throw a CastError when the query executes. This handler
    //      had no try/catch, so that CastError became an unhandled promise
    //      rejection - and server.js's `process.on('unhandledRejection', ...)`
    //      deliberately calls `server.close()` + `process.exit(1)` on any
    //      unhandled rejection anywhere in the app. Net effect: any single
    //      authenticated non-employee socket sending one malformed
    //      `location:request` payload could crash the entire backend
    //      process for every tenant, not just their own.
    // Fixed by validating `targetEmployeeId` is an actual, plausible
    // ObjectId string before it ever reaches a query (closes both the
    // operator-injection path and the CastError/crash path), and wrapping
    // the handler body in try/catch as defense-in-depth so no future error
    // in this handler can reach the process-level crash-and-restart logic.
    socket.on('location:request', async (payload = {}) => {
      try {
        const targetEmployeeId = payload.employeeId;
        if (!targetEmployeeId || typeof targetEmployeeId !== 'string' || !mongoose.Types.ObjectId.isValid(targetEmployeeId)) {
          return;
        }
        // Only dashboard/admin sockets (not employees) may request this.
        if (decoded.role === 'employee') return;
        // The target employee must actually belong to the requesting owner's
        // own tenant - without this, any authenticated owner could push a
        // location:requested event to any employee's device platform-wide.
        const employee = await Employee.findOne({ _id: targetEmployeeId, ownerId: decoded.ownerId }).select('_id').lean();
        if (!employee) return;
        io.to(`employee:${targetEmployeeId}`).emit('location:requested', {
          requestedAt: new Date().toISOString(),
        });
      } catch (err) {
        // Never let an error here become an unhandled rejection - see
        // finding above.
        console.error('[socket] location:request handler error:', err.message);
      }
    });

    socket.on('disconnect', () => {
      // No server-side state to clean up - room membership is per-connection.
    });
  });

  return io;
};

export const getIO = () => io;

/**
 * Emit an event to every dashboard/admin client AND every employee client
 * for a given owner/tenant. Use this only for genuinely company-wide
 * broadcasts (lifecycle/location events) - never for anything scoped to a
 * single employee's private thread, since every one of that owner's
 * employees is also in this room. See emitToDashboard() for that case.
 */
export const emitToOwner = (ownerId, event, payload) => {
  if (!io || !ownerId) return;
  io.to(`owner:${String(ownerId)}`).emit(event, payload);
};

/**
 * Emit an event to the office/admin dashboard ONLY (never to any
 * employee's device). Use this for anything scoped to a single employee's
 * private conversation, e.g. their chat message reaching the office.
 */
export const emitToDashboard = (ownerId, event, payload) => {
  if (!io || !ownerId) return;
  io.to(`dashboard:${String(ownerId)}`).emit(event, payload);
};

/** Emit an event directly to a specific employee's connected device(s). */
export const emitToEmployee = (employeeId, event, payload) => {
  if (!io || !employeeId) return;
  io.to(`employee:${String(employeeId)}`).emit(event, payload);
};

export default { initSocket, getIO, emitToOwner, emitToDashboard, emitToEmployee };
