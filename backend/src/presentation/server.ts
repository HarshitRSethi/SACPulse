import dns from 'dns';
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

import dotenv from 'dotenv';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { IssueRequestTTLScheduler } from '../application/services/IssueRequestTTLScheduler.js';
import {
  RealtimeEventHub,
  type StudentNotificationPayload
} from '../application/services/RealtimeEventHub.js';
import { createApp, resolveCorsOrigins } from './app.js';
import { verifySessionToken } from '../application/services/JwtTokenService.js';

dotenv.config();

const port = process.env.PORT || 5001;
const app = createApp();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: resolveCorsOrigins(process.env.CORS_ORIGIN),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true
  }
});

// Bridge RealtimeEventHub Observer events to Socket.io WebSocket rooms
const hub = RealtimeEventHub.getInstance();

// 1. Live Inventory stock & occupancy changes (Privacy-safe public campus feed)
hub.subscribe('INVENTORY_UPDATED', (payload) => {
  io.emit('inventory:updated', payload);
});

// 2. Guard live counter incoming queue (Targeted to Guard Counter + requesting student)
hub.subscribe('GUARD_QUEUE_UPDATED', (payload) => {
  io.to('guard:counter').emit('guard:queue_updated', payload);
  if (payload && typeof payload.studentId === 'string') {
    io.to(`student:${payload.studentId}`).emit('guard:queue_updated', {
      requestId: payload.requestId,
      studentId: payload.studentId,
      status: payload.status,
      timestamp: payload.timestamp
    });
  }
});

// 3. Peer-to-Peer Transfer & Return state transitions (Targeted to Guard Counter + involved students)
hub.subscribe('TRANSFER_STATE_CHANGED', (payload) => {
  io.to('guard:counter').emit('transfer:state_changed', payload);
  if (payload && typeof payload.fromStudentId === 'string') {
    io.to(`student:${payload.fromStudentId}`).emit('transfer:state_changed', payload);
  }
  if (payload && typeof payload.toStudentId === 'string') {
    io.to(`student:${payload.toStudentId}`).emit('transfer:state_changed', payload);
  }
  if (payload && Array.isArray(payload.studentIds)) {
    for (const studentId of payload.studentIds) {
      if (typeof studentId === 'string') {
        io.to(`student:${studentId}`).emit('transfer:state_changed', payload);
      }
    }
  }
});

// 4. Guard register atomic holder swap (Targeted to Guard Counter + involved students)
hub.subscribe('GUARD_REGISTER_SWAPPED', (payload) => {
  io.to('guard:counter').emit('guard:register_swapped', payload);
  if (payload && typeof payload.oldHolderId === 'string') {
    io.to(`student:${payload.oldHolderId}`).emit('guard:register_swapped', payload);
  }
  if (payload && typeof payload.newHolderId === 'string') {
    io.to(`student:${payload.newHolderId}`).emit('guard:register_swapped', payload);
  }
});

// 5. Authoritative 2-minute request timeout (Targeted to Guard Counter + timed-out student)
hub.subscribe('REQUEST_TIMED_OUT', (payload) => {
  io.to('guard:counter').emit('request:timed_out', payload);
  if (payload && typeof payload.studentId === 'string') {
    io.to(`student:${payload.studentId}`).emit('request:timed_out', payload);
  }
});

// 6. Targeted per-student notifications bridged directly to room `student:${studentId}`
hub.subscribe('STUDENT_NOTIFICATION', (payload: StudentNotificationPayload) => {
  if (payload && payload.studentId) {
    io.to(`student:${payload.studentId}`).emit('student:notification', payload);
  }
});

io.on('connection', (socket) => {
  const token = socket.handshake.auth?.token;
  const user = typeof token === 'string' ? verifySessionToken(token) : null;
  if (user) {
    if (user.role === 'STUDENT') {
      socket.join(`student:${user.userId}`);
    } else if (user.role === 'GUARD') {
      socket.join('guard:counter');         // Guard Desk counter channel
      socket.join(`guard:${user.userId}`);  // Personal guard channel
    } else if (user.role === 'ADMIN') {
      socket.join('admin');                 // Admin governance channel
      socket.join('guard:counter');         // Supervisor oversight of the counter
    }
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(port, () => {
    console.log(`SACPulse Backend listening on http://localhost:${port}`);
    IssueRequestTTLScheduler.getInstance()
      .recoverPendingRequests()
      .then(({ expiredImmediately, rescheduled }) => {
        if (expiredImmediately > 0 || rescheduled > 0) {
          console.log(
            `Recovered pending issue requests: ${expiredImmediately} expired, ${rescheduled} rescheduled.`
          );
        }
      })
      .catch((err) => {
        console.warn('Pending request TTL recovery sweep warning:', err?.message || err);
      });
  });
}

export { app, io, server };
