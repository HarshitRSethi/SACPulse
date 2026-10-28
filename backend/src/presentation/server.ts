import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { RealtimeEventHub } from '../domain.services/RealtimeEventHub.js';

dotenv.config();

const port = process.env.PORT || 5001;
const app = createApp();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH'],
    credentials: true
  }
});

// Bridge RealtimeEventHub observer events to Socket.io WebSockets
const hub = RealtimeEventHub.getInstance();

// 1. Live Inventory stock changes
hub.subscribe('INVENTORY_UPDATED', (payload) => {
  io.emit('inventory:updated', payload);
});

// 2. Guard live counter incoming queue
hub.subscribe('GUARD_QUEUE_UPDATED', (payload) => {
  io.emit('guard:queue_updated', payload);
});

// 3. Peer-to-Peer Transfer state changes
hub.subscribe('TRANSFER_STATE_CHANGED', (payload) => {
  io.emit('transfer:state_changed', payload);
});

// 4. Guard register holder swap
hub.subscribe('GUARD_REGISTER_SWAPPED', (payload) => {
  io.emit('guard:register_swapped', payload);
});

// 5. Authoritative 2-minute request timeout
hub.subscribe('REQUEST_TIMED_OUT', (payload) => {
  io.emit('request:timed_out', payload);
});

io.on('connection', (socket) => {
  console.log(`🔌 Client connected to SACPulse WebSocket: ${socket.id}`);

  // Students join their personal room for direct notifications
  socket.on('join:student', (studentId: string) => {
    socket.join(`student:${studentId}`);
  });

  // Guards join the counter room
  socket.on('join:guard', () => {
    socket.join('guard:counter');
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(port, () => {
    console.log(`🚀 SACPulse Backend running on http://localhost:${port}`);
    console.log(`⚡ WebSocket server active and listening on port ${port}`);
  });
}

export { server, app, io };
