import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

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

const buildAllowedOrigins = () => {
  const localOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'https://crewio-rust.vercel.app',
  ];
  return Array.from(new Set([process.env.FRONTEND_URL, ...localOrigins].filter(Boolean)));
};

export const initSocket = (httpServer) => {
  if (io) return io;

  const allowedOrigins = buildAllowedOrigins();

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
    // Mobile clients on flaky networks benefit from allowing polling as a
    // fallback rather than requiring an immediate websocket upgrade.
    transports: ['websocket', 'polling'],
  });

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization || '').split(' ')[1];

      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, env.JWT_SECRET);
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
      // Dashboard/admin user
      const ownerId = decoded.ownerId || decoded.userId;
      if (ownerId) socket.join(`owner:${ownerId}`);
    }

    // Dashboard asking a specific employee's app to push its current
    // location immediately (on-demand location request).
    socket.on('location:request', (payload = {}) => {
      const targetEmployeeId = payload.employeeId;
      if (!targetEmployeeId) return;
      // Only dashboard/admin sockets (not employees) may request this.
      if (decoded.role === 'employee') return;
      io.to(`employee:${targetEmployeeId}`).emit('location:requested', {
        requestedAt: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      // No server-side state to clean up - room membership is per-connection.
    });
  });

  return io;
};

export const getIO = () => io;

/** Emit an event to every dashboard/admin client for a given owner/tenant. */
export const emitToOwner = (ownerId, event, payload) => {
  if (!io || !ownerId) return;
  io.to(`owner:${String(ownerId)}`).emit(event, payload);
};

/** Emit an event directly to a specific employee's connected device(s). */
export const emitToEmployee = (employeeId, event, payload) => {
  if (!io || !employeeId) return;
  io.to(`employee:${String(employeeId)}`).emit(event, payload);
};

export default { initSocket, getIO, emitToOwner, emitToEmployee };
