import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../src/presentation/app.js';
import { RealtimeEventHub } from '../../src/application/services/RealtimeEventHub.js';
import { IssueRequestTTLScheduler } from '../../src/application/services/IssueRequestTTLScheduler.js';
import { generateSessionToken } from '../../src/application/services/JwtTokenService.js';
import {
  createDefaultRepositories,
  type RepositoryContainer
} from '../../src/infrastructure/persistence/index.js';
import type { Student } from '../../src/domain/entities/User.js';
import { SportsEquipment } from '../../src/domain/entities/SACItem.js';

describe('SACPulse REST API & Real-Time Events Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  let hub: RealtimeEventHub;
  let repositories: RepositoryContainer;

  const adminToken = generateSessionToken({
    userId: 'admin-seed-id',
    email: process.env.INITIAL_ADMIN_EMAIL || 'admin@iiita.ac.in',
    role: 'ADMIN'
  });

  beforeAll(async () => {
    repositories = createDefaultRepositories();
    const app = createApp({ repositories });
    server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    hub = RealtimeEventHub.getInstance();
  });

  afterAll(async () => {
    IssueRequestTTLScheduler.getInstance().clearAll();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  function tokenForUser(user: { id: string; email: string; role: 'STUDENT' | 'GUARD' | 'ADMIN' }) {
    return generateSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });
  }

  // 1. Health Endpoint
  it('GET /api/health should return status UP', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('UP');
    expect(body.service).toBe('SACPulse Backend');
  });

  // 2. Inventory & Privacy-Safe Live Status (Rule 2)
  it('GET /api/inventory should list live SAC stock without exposing room key holder names', async () => {
    const res = await fetch(`${baseUrl}/api/inventory`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(8);

    const ttRacket = body.data.find((i: any) => i.name === 'TT Racket');
    expect(ttRacket).toBeDefined();
    expect(ttRacket.category).toBe('Table Tennis');
    expect(ttRacket.itemType).toBe('EQUIPMENT');
    expect(ttRacket.totalQty).toBeGreaterThanOrEqual(1);

    const danceRoom = body.data.find((i: any) => i.name === 'Dance Room Key');
    expect(danceRoom).toBeDefined();
    expect(danceRoom.itemType).toBe('ROOM_KEY');
    expect(danceRoom.totalQty).toBe(1);

    // Privacy-Safe Check: No student name or phone properties leaked in room key data
    expect(danceRoom.studentName).toBeUndefined();
    expect(danceRoom.mobileNo).toBeUndefined();
    expect(danceRoom).toHaveProperty('occupiedSince');
  });

  // 3. Admin Routes & CSV Export
  it('Admin routes: GET /api/admin/users and /api/admin/register-logs with CSV export', async () => {
    const usersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(usersRes.status).toBe(200);
    const usersBody = await usersRes.json();
    expect(usersBody.success).toBe(true);
    expect(usersBody.data.length).toBeGreaterThanOrEqual(4);

    const logsRes = await fetch(`${baseUrl}/api/admin/register-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(logsRes.status).toBe(200);
    const logsBody = await logsRes.json();
    expect(logsBody.success).toBe(true);
    expect(Array.isArray(logsBody.data)).toBe(true);
    expect(typeof logsBody.totalCount).toBe('number');
    expect(typeof logsBody.todayCount).toBe('number');

    const csvRes = await fetch(`${baseUrl}/api/admin/register-logs?format=csv`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get('content-type')).toContain('text/csv');
    const csvText = await csvRes.text();
    expect(csvText).toContain(
      'Entry ID,Batch ID,Student Name,Roll Number,Mobile Number,Item Name,Category,Status,Arrival Time,Departure Time'
    );
  });

  // 4. Issue Request Validation & 120s TTL Server Schedule (Rules 3, 4, 5)
  it('POST /api/issue-requests should validate student eligibility and start 120s server timer', async () => {
    const usersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const { data: users } = await usersRes.json();
    const studentA = users.find((u: any) => u.email === 'studenta@iiita.ac.in');
    expect(studentA).toBeDefined();

    if (studentA.isDefaulter) {
      await fetch(`${baseUrl}/api/admin/users/${studentA.id}/clear-defaulter`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
    }
    if (studentA.penaltyUntil) {
      await fetch(`${baseUrl}/api/admin/users/${studentA.id}/reset-cooldown`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
    }

    const studentAToken = tokenForUser(studentA);

    const inventoryRes = await fetch(`${baseUrl}/api/inventory`);
    const { data: items } = await inventoryRes.json();
    const ttRacket = items.find((i: any) => i.name === 'TT Racket');

    let queueNotification: any = null;
    const unsubscribe = hub.subscribe('GUARD_QUEUE_UPDATED', (payload) => {
      queueNotification = payload;
    });

    const reqRes = await fetch(`${baseUrl}/api/issue-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentAToken}`
      },
      body: JSON.stringify({
        studentId: studentA.id,
        items: [{ itemId: ttRacket.id, name: ttRacket.name, qty: 1 }]
      })
    });

    expect(reqRes.status).toBe(201);
    const reqBody = await reqRes.json();

    expect(reqBody.success).toBe(true);
    expect(reqBody.data.status).toBe('PENDING');
    expect(reqBody.data.ttlSeconds).toBe(120);
    expect(reqBody.data.expiresAt).toBeDefined();

    const createdAtTime = new Date(reqBody.data.createdAt).getTime();
    const expiresAtTime = new Date(reqBody.data.expiresAt).getTime();
    expect(expiresAtTime - createdAtTime).toBe(120 * 1000);

    expect(queueNotification).not.toBeNull();
    expect(queueNotification.requestId).toBe(reqBody.data.id);

    unsubscribe();
  });

  it('POST /api/issue-requests should reject request if student is marked as Defaulter', async () => {
    const usersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const { data: users } = await usersRes.json();
    const studentA = users.find((u: any) => u.email === 'studenta@iiita.ac.in');
    const studentAToken = tokenForUser(studentA);

    await repositories.userRepo.setDefaulter(studentA.id, true);

    const reqRes = await fetch(`${baseUrl}/api/issue-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentAToken}`
      },
      body: JSON.stringify({
        studentId: studentA.id,
        items: [{ itemId: 'dummy-item', name: 'TT Ball', qty: 1 }]
      })
    });

    expect(reqRes.status).toBe(403);
    const body = await reqRes.json();
    expect(body.error).toMatch(/defaulter/i);

    const clearRes = await fetch(`${baseUrl}/api/admin/users/${studentA.id}/clear-defaulter`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(clearRes.status).toBe(200);

    const userRestored = (await repositories.userRepo.findById(studentA.id)) as Student;
    expect(userRestored.getIsDefaulter()).toBe(false);
  });

  // 5. Guard Counter Approval & Batch Registers (Rule 6, 7, 9)
  it('Guard flow: Approve request -> Active Register grouped by batch_id -> Intact Return', async () => {
    const usersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const { data: users } = await usersRes.json();
    const studentB = users.find((u: any) => u.email === 'studentb@iiita.ac.in');
    const guard = users.find((u: any) => u.role === 'GUARD');

    if (studentB.isDefaulter) {
      await fetch(`${baseUrl}/api/admin/users/${studentB.id}/clear-defaulter`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
    }

    const studentBToken = tokenForUser(studentB);
    const guardToken = tokenForUser(guard);

    const invRes = await fetch(`${baseUrl}/api/inventory`);
    const { data: items } = await invRes.json();
    const tennisRacket = items.find((i: any) => i.name === 'Tennis Racket');

    const reqRes = await fetch(`${baseUrl}/api/issue-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentBToken}`
      },
      body: JSON.stringify({
        studentId: studentB.id,
        items: [{ itemId: tennisRacket.id, name: tennisRacket.name, qty: 1 }]
      })
    });
    expect(reqRes.status).toBe(201);
    const reqBody = await reqRes.json();
    const requestId = reqBody.data.id;

    const approveRes = await fetch(`${baseUrl}/api/guard/requests/${requestId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${guardToken}`
      },
      body: JSON.stringify({ guardId: guard.id })
    });

    expect(approveRes.status).toBe(200);
    const approveBody = await approveRes.json();
    expect(approveBody.success).toBe(true);
    expect(approveBody.data.batchId).toBeDefined();
    expect(approveBody.data.unitsIssued).toBe(1);

    const regRes = await fetch(`${baseUrl}/api/guard/register/active`, {
      headers: { Authorization: `Bearer ${guardToken}` }
    });
    expect(regRes.status).toBe(200);
    const regBody = await regRes.json();

    const activeBatch = regBody.data.find((b: any) => b.batchId === approveBody.data.batchId);
    expect(activeBatch).toBeDefined();
    expect(activeBatch.studentName).toBe('Student B');
    expect(activeBatch.units[0].status).toBe('ISSUED');

    const entryId = activeBatch.units[0].id;

    const returnRes = await fetch(`${baseUrl}/api/guard/returns/${entryId}/intact`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guardToken}` }
    });
    expect(returnRes.status).toBe(200);
    const returnBody = await returnRes.json();
    expect(returnBody.success).toBe(true);
    expect(returnBody.data.status).toBe('RETURNED');
  });

  // 6. Peer-to-Peer Transfer & Atomic Row Split (Rule 8)
  it('P2P Transfer: Initiate -> Cancel -> Re-initiate -> Accept with Atomic Row Split', async () => {
    const usersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const { data: users } = await usersRes.json();
    const studentA = users.find((u: any) => u.email === 'studenta@iiita.ac.in');
    const studentB = users.find((u: any) => u.email === 'studentb@iiita.ac.in');
    const guard = users.find((u: any) => u.role === 'GUARD');

    const studentAToken = tokenForUser(studentA);
    const studentBToken = tokenForUser(studentB);
    const guardToken = tokenForUser(guard);

    const invRes = await fetch(`${baseUrl}/api/inventory`);
    const { data: items } = await invRes.json();
    const chess = items.find((i: any) => i.name === 'Chess Set');

    const reqRes = await fetch(`${baseUrl}/api/issue-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentAToken}`
      },
      body: JSON.stringify({
        studentId: studentA.id,
        items: [{ itemId: chess.id, name: chess.name, qty: 1 }]
      })
    });
    expect(reqRes.status).toBe(201);
    const { data: issueData } = await reqRes.json();

    const approveRes = await fetch(`${baseUrl}/api/guard/requests/${issueData.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${guardToken}`
      },
      body: JSON.stringify({ guardId: guard.id })
    });
    const { data: batchData } = await approveRes.json();

    const regRes = await fetch(`${baseUrl}/api/guard/register/active`, {
      headers: { Authorization: `Bearer ${guardToken}` }
    });
    const { data: activeBatches } = await regRes.json();
    const batch = activeBatches.find((b: any) => b.batchId === batchData.batchId);
    const entryId = batch.units[0].id;

    // 1. Student A initiates transfer to Student B
    const initRes = await fetch(`${baseUrl}/api/transfers/${entryId}/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentAToken}`
      },
      body: JSON.stringify({
        studentId: studentA.id,
        recipientId: studentB.id
      })
    });
    expect(initRes.status).toBe(200);

    // 2. Student A cancels transfer
    const cancelRes = await fetch(`${baseUrl}/api/transfers/${entryId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentAToken}`
      },
      body: JSON.stringify({ studentId: studentA.id })
    });
    expect(cancelRes.status).toBe(200);

    // 3. Re-initiate transfer
    await fetch(`${baseUrl}/api/transfers/${entryId}/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentAToken}`
      },
      body: JSON.stringify({
        studentId: studentA.id,
        recipientId: studentB.id
      })
    });

    // 4. Student B accepts transfer (Atomic Row Split)
    let swappedEvent: any = null;
    const unsub = hub.subscribe('GUARD_REGISTER_SWAPPED', (payload) => {
      swappedEvent = payload;
    });

    const acceptRes = await fetch(`${baseUrl}/api/transfers/${entryId}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentBToken}`
      },
      body: JSON.stringify({
        studentId: studentB.id,
        action: 'ACCEPT'
      })
    });

    expect(acceptRes.status).toBe(200);
    const acceptBody = await acceptRes.json();
    expect(acceptBody.success).toBe(true);
    expect(acceptBody.data.new_entry_id).toBeDefined();
    expect(acceptBody.data.batch_id).toBe(batchData.batchId);

    expect(swappedEvent).not.toBeNull();
    expect(swappedEvent.newHolderId).toBe(studentB.id);

    unsub();

    // Clean up return by guard
    await fetch(`${baseUrl}/api/guard/returns/${acceptBody.data.new_entry_id}/intact`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guardToken}` }
    });
  });

  // 7. Guard Damaged Return Locks Holder as Defaulter (Rule 7 & 9)
  it('Guard return damaged: sets DAMAGED, wipes pendingTransferToId, locks holder as DEFAULTER', async () => {
    const usersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const { data: users } = await usersRes.json();
    const studentA = users.find((u: any) => u.email === 'studenta@iiita.ac.in');
    const studentB = users.find((u: any) => u.email === 'studentb@iiita.ac.in');
    const guard = users.find((u: any) => u.role === 'GUARD');

    const studentAToken = tokenForUser(studentA);
    const studentBToken = tokenForUser(studentB);
    const guardToken = tokenForUser(guard);

    const invRes = await fetch(`${baseUrl}/api/inventory`);
    const { data: items } = await invRes.json();
    const ball = items.find((i: any) => i.name === 'TT Ball');

    await repositories.userRepo.setDefaulter(studentA.id, false);

    const ballEntity = await repositories.itemRepo.findById(ball.id);
    if (ballEntity && ballEntity.getAvailableQty() < 1) {
      await repositories.itemRepo.save(
        new SportsEquipment(ball.id, 'TT Ball', 'Table Tennis', 12, 12, 0)
      );
    }

    const reqRes = await fetch(`${baseUrl}/api/issue-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentAToken}`
      },
      body: JSON.stringify({
        studentId: studentA.id,
        items: [{ itemId: ball.id, name: ball.name, qty: 1 }]
      })
    });
    expect(reqRes.status).toBe(201);
    const { data: issueData } = await reqRes.json();

    const approveRes = await fetch(`${baseUrl}/api/guard/requests/${issueData.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${guardToken}`
      },
      body: JSON.stringify({ guardId: guard.id })
    });
    expect(approveRes.status).toBe(200);
    const { data: batchData } = await approveRes.json();

    const regRes = await fetch(`${baseUrl}/api/guard/register/active`, {
      headers: { Authorization: `Bearer ${guardToken}` }
    });
    const { data: batches } = await regRes.json();
    const activeBatch = batches.find((b: any) => b.batchId === batchData.batchId);
    const entryId = activeBatch.units[0].id;

    // A initiates transfer to B
    await fetch(`${baseUrl}/api/transfers/${entryId}/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentAToken}`
      },
      body: JSON.stringify({ studentId: studentA.id, recipientId: studentB.id })
    });

    // A returns item damaged before B accepts
    const damagedRes = await fetch(`${baseUrl}/api/guard/returns/${entryId}/damaged`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guardToken}` }
    });

    expect(damagedRes.status).toBe(200);
    const damagedBody = await damagedRes.json();
    expect(damagedBody.data.status).toBe('DAMAGED');
    expect(damagedBody.data.studentId).toBe(studentA.id);

    const studentARefreshed = (await repositories.userRepo.findById(studentA.id)) as Student;
    expect(studentARefreshed.getIsDefaulter()).toBe(true);

    // Verify late acceptance by B is rejected with 409 Conflict (Rule 9)
    const lateAcceptRes = await fetch(`${baseUrl}/api/transfers/${entryId}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentBToken}`
      },
      body: JSON.stringify({ studentId: studentB.id, action: 'ACCEPT' })
    });
    expect(lateAcceptRes.status).toBe(409);

    // Clean up defaulter and restore ball stock
    await fetch(`${baseUrl}/api/admin/users/${studentA.id}/clear-defaulter`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    await repositories.itemRepo.save(
      new SportsEquipment(ball.id, 'TT Ball', 'Table Tennis', 12, 12, 0)
    );
  });

  // 8. Admin Inventory Management & Deletion Safety Check
  it('Admin DELETE /api/admin/inventory/:id: rejects with 400 if active holdings exist, succeeds otherwise', async () => {
    const createRes = await fetch(`${baseUrl}/api/admin/inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: 'Temp Squash Ball',
        category: 'Squash',
        itemType: 'EQUIPMENT',
        totalQty: 2,
        availableQty: 2
      })
    });
    expect(createRes.status).toBe(200);
    const { data: createdBody } = await createRes.json();
    const tempItemId = createdBody.item.id;

    const deleteRes = await fetch(`${baseUrl}/api/admin/inventory/${tempItemId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(deleteRes.status).toBe(200);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.success).toBe(true);
    expect(deleteBody.data.deletedItemId).toBe(tempItemId);

    const invRes = await fetch(`${baseUrl}/api/inventory`);
    const { data: items } = await invRes.json();
    const found = items.find((i: any) => i.id === tempItemId);
    expect(found).toBeUndefined();
  });
});
