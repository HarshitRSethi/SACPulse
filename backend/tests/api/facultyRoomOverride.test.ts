import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../src/presentation/app.js';
import { RealtimeEventHub } from '../../src/application/services/RealtimeEventHub.js';
import { generateSessionToken } from '../../src/application/services/JwtTokenService.js';

describe('Guard Desk Faculty Room Override & Real-Time Push Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  let hub: RealtimeEventHub;
  let danceRoomId: string;
  let ttRacketId: string;

  const guardToken = generateSessionToken({
    userId: 'guard-test-id',
    email: 'guard.sac.iiita@gmail.com',
    role: 'GUARD'
  });

  const guardHeaders = {
    Authorization: `Bearer ${guardToken}`
  };

  beforeAll(async () => {
    const app = createApp();
    server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    hub = RealtimeEventHub.getInstance();

    const invRes = await fetch(`${baseUrl}/api/inventory`);
    const invBody = await invRes.json();
    const danceRoom = invBody.data.find((i: { id: string; name: string }) => i.name === 'Dance Room Key');
    const ttRacket = invBody.data.find((i: { id: string; name: string }) => i.name === 'TT Racket');

    expect(danceRoom).toBeDefined();
    expect(ttRacket).toBeDefined();
    danceRoomId = danceRoom.id;
    ttRacketId = ttRacket.id;

    await fetch(`${baseUrl}/api/guard/rooms/${danceRoomId}/release`, {
      method: 'POST',
      headers: guardHeaders
    });
  });

  afterAll(async () => {
    if (danceRoomId) {
      await fetch(`${baseUrl}/api/guard/rooms/${danceRoomId}/release`, {
        method: 'POST',
        headers: guardHeaders
      });
    }

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  describe('Validation & Edge Cases', () => {
    it('POST /api/guard/rooms/:id/faculty-occupy should return 404 for non-existent item id', async () => {
      const res = await fetch(
        `${baseUrl}/api/guard/rooms/00000000-0000-0000-0000-000000000000/faculty-occupy`,
        {
          method: 'POST',
          headers: guardHeaders
        }
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('not found');
    });

    it('POST /api/guard/rooms/:id/release should return 404 for non-existent item id', async () => {
      const res = await fetch(
        `${baseUrl}/api/guard/rooms/00000000-0000-0000-0000-000000000000/release`,
        {
          method: 'POST',
          headers: guardHeaders
        }
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('not found');
    });

    it('POST /api/guard/rooms/:id/faculty-occupy should reject non-ROOM_KEY items with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/api/guard/rooms/${ttRacketId}/faculty-occupy`, {
        method: 'POST',
        headers: guardHeaders
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('not an activity room key');
    });

    it('POST /api/guard/rooms/:id/release should reject non-ROOM_KEY items with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/api/guard/rooms/${ttRacketId}/release`, {
        method: 'POST',
        headers: guardHeaders
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('not an activity room key');
    });
  });

  describe('Faculty Occupy & WebSocket Emission', () => {
    it('POST /api/guard/rooms/:id/faculty-occupy should occupy room, set available_qty=0 and emit inventory:updated', async () => {
      let broadcastPayload: any = null;
      const unsubscribe = hub.subscribe('inventory:updated', (payload) => {
        if (payload.itemId === danceRoomId) {
          broadcastPayload = payload;
        }
      });

      const res = await fetch(`${baseUrl}/api/guard/rooms/${danceRoomId}/faculty-occupy`, {
        method: 'POST',
        headers: guardHeaders
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.item.availableQty).toBe(0);
      expect(body.data.item.occupiedSince).toBeDefined();

      expect(broadcastPayload).not.toBeNull();
      expect(broadcastPayload.itemId).toBe(danceRoomId);
      expect(broadcastPayload.availableQty).toBe(0);
      expect(broadcastPayload.occupiedSince).toBeDefined();

      unsubscribe();
    });

    it('POST /api/guard/rooms/:id/faculty-occupy should return 409 Conflict if room is already occupied', async () => {
      const res = await fetch(`${baseUrl}/api/guard/rooms/${danceRoomId}/faculty-occupy`, {
        method: 'POST',
        headers: guardHeaders
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('already occupied');
    });

    it('GET /api/inventory should flag room as isFacultySession=true when occupied without active student checkout', async () => {
      const res = await fetch(`${baseUrl}/api/inventory`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const danceRoom = body.data.find((i: { id: string }) => i.id === danceRoomId);
      expect(danceRoom).toBeDefined();
      expect(danceRoom.availableQty).toBe(0);
      expect(danceRoom.isAvailable).toBe(false);
      expect(danceRoom.occupiedSince).not.toBeNull();
      expect(danceRoom.isFacultySession).toBe(true);
      expect(danceRoom.hasActiveStudentCheckout).toBe(false);
    });
  });

  describe('Room Release & WebSocket Emission', () => {
    it('POST /api/guard/rooms/:id/release should reset occupied_since=NULL, available_qty=1 and emit inventory:updated', async () => {
      let broadcastPayload: any = null;
      const unsubscribe = hub.subscribe('inventory:updated', (payload) => {
        if (payload.itemId === danceRoomId) {
          broadcastPayload = payload;
        }
      });

      const res = await fetch(`${baseUrl}/api/guard/rooms/${danceRoomId}/release`, {
        method: 'POST',
        headers: guardHeaders
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.item.availableQty).toBe(1);
      expect(body.data.item.occupiedSince).toBeNull();

      expect(broadcastPayload).not.toBeNull();
      expect(broadcastPayload.itemId).toBe(danceRoomId);
      expect(broadcastPayload.availableQty).toBe(1);
      expect(broadcastPayload.occupiedSince).toBeNull();

      unsubscribe();
    });

    it('GET /api/inventory should reflect room as available with isFacultySession=false', async () => {
      const res = await fetch(`${baseUrl}/api/inventory`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const danceRoom = body.data.find((i: { id: string }) => i.id === danceRoomId);
      expect(danceRoom).toBeDefined();
      expect(danceRoom.availableQty).toBe(1);
      expect(danceRoom.isAvailable).toBe(true);
      expect(danceRoom.occupiedSince).toBeNull();
      expect(danceRoom.isFacultySession).toBe(false);
    });
  });
});
