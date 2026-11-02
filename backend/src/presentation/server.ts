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
import { createApp } from './app.js';

dotenv.config();

const port = process.env.PORT || 5001;
const app = createApp();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true
  }
});

// Bridge RealtimeEventHub Observer events to Socket.io WebSocket rooms
const hub = RealtimeEventHub.getInstance();

// 1. Live Inventory stock & occupancy changes
hub.subscribe('INVENTORY_UPDATED', (payload) => {
  io.emit('inventory:updated', payload);
});

// 2. Guard live counter incoming queue
hub.subscribe('GUARD_QUEUE_UPDATED', (payload) => {
  io.emit('guard:queue_updated', payload);
});

// 3. Peer-to-Peer Transfer state transitions
hub.subscribe('TRANSFER_STATE_CHANGED', (payload) => {
  io.emit('transfer:state_changed', payload);
});

// 4. Guard register atomic holder swap
hub.subscribe('GUARD_REGISTER_SWAPPED', (payload) => {
  io.emit('guard:register_swapped', payload);
});

// 5. Authoritative 2-minute request timeout
hub.subscribe('REQUEST_TIMED_OUT', (payload) => {
  io.emit('request:timed_out', payload);
});

// 6. Targeted per-student notifications bridged directly to room `student:${studentId}`
hub.subscribe('STUDENT_NOTIFICATION', (payload: StudentNotificationPayload) => {
  if (payload && payload.studentId) {
    io.to(`student:${payload.studentId}`).emit('student:notification', payload);
  }
});

io.on('connection', (socket) => {
  socket.on('join:student', (studentId: string) => {
    if (studentId && typeof studentId === 'string') {
      socket.join(`student:${studentId}`);
    }
  });

  socket.on('join:guard', () => {
    socket.join('guard:counter');
  });
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
