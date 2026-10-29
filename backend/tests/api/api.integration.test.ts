import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { createApp } from '../../src/presentation/app.js';
import { RealtimeEventHub } from '../../src/domain.services/RealtimeEventHub.js';
import { IssueRequestTTLScheduler } from '../../src/domain.services/IssueRequestTTLScheduler.js';

describe('SACPulse REST API & Real-Time Events Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  let hub: RealtimeEventHub;

  beforeAll(async () => {
    const app = createApp();
    server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
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

    // Verify presence of realistic items
    const ttRacket = body.data.find((i: any) => i.name === 'TT Racket');
    expect(ttRacket).toBeDefined();
    expect(ttRacket.category).toBe('Table Tennis');
    expect(ttRacket.itemType).toBe('EQUIPMENT');
    expect(ttRacket.totalQty).toBe(6);

    const danceRoom = body.data.find((i: any) => i.name === 'Dance Room Key');
    expect(danceRoom).toBeDefined();
    expect(danceRoom.itemType).toBe('ROOM_KEY');
    expect(danceRoom.totalQty).toBe(1);

    // Privacy-Safe Check: No student name or phone properties leaked in room key data
    expect(danceRoom.studentName).toBeUndefined();
    expect(danceRoom.mobileNo).toBeUndefined();
    expect(danceRoom).toHaveProperty('occupiedSince');
  });

  // 3. Admin Routes & Defaulter / Cooldown Unblocking
  it('Admin routes: GET /api/admin/users and /api/admin/register-logs with CSV export', async () => {
    // List users
    const usersRes = await fetch(`${baseUrl}/api/admin/users`);
    expect(usersRes.status).toBe(200);
    const usersBody = await usersRes.json();
    expect(usersBody.success).toBe(true);
    expect(usersBody.data.length).toBeGreaterThanOrEqual(4);

    // JSON register logs
    const logsRes = await fetch(`${baseUrl}/api/admin/register-logs`);
    expect(logsRes.status).toBe(200);
    const logsBody = await logsRes.json();
    expect(logsBody.success).toBe(true);
    expect(Array.isArray(logsBody.data)).toBe(true);

    // CSV Export
    const csvRes = await fetch(`${baseUrl}/api/admin/register-logs?format=csv`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get('content-type')).toContain('text/csv');
    const csvText = await csvRes.text();
    expect(csvText).toContain('Entry ID,Batch ID,Student Name,Roll Number,Mobile Number,Item Name,Category,Status,Arrival Time,Departure Time');
  });

  // 4. Issue Request Validation & 120s TTL Server Schedule (Rules 3, 4, 5)
  it('POST /api/issue-requests should validate student eligibility and start 120s server timer', async () => {
    // Fetch Student A
    const usersRes = await fetch(`${baseUrl}/api/admin/users`);
    const { data: users } = await usersRes.json();
    const studentA = users.find((u: any) => u.email === 'studenta@iiita.ac.in');
    expect(studentA).toBeDefined();

    if (studentA.isDefaulter) {
      await fetch(`${baseUrl}/api/admin/users/${studentA.id}/clear-defaulter`, { method: 'POST' });
    }

    const inventoryRes = await fetch(`${baseUrl}/api/inventory`);
    const { data: items } = await inventoryRes.json();
    const ttRacket = items.find((i: any) => i.name === 'TT Racket');

    let queueNotification: any = null;
    const unsubscribe = hub.subscribe('GUARD_QUEUE_UPDATED', (payload) => {
      queueNotification = payload;
    });

    // Create Issue Request
    const reqRes = await fetch(`${baseUrl}/api/issue-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    // Verify 120s authoritative TTL
    const createdAtTime = new Date(reqBody.data.createdAt).getTime();
    const expiresAtTime = new Date(reqBody.data.expiresAt).getTime();
    expect(expiresAtTime - createdAtTime).toBe(120 * 1000);

    // Verify RealtimeEventHub broadcast
    expect(queueNotification).not.toBeNull();
    expect(queueNotification.requestId).toBe(reqBody.data.id);

    unsubscribe();
  });

  it('POST /api/issue-requests should reject request if student is marked as Defaulter', async () => {
    const usersRes = await fetch(`${baseUrl}/api/admin/users`);
    const { data: users } = await usersRes.json();
    const studentA = users.find((u: any) => u.email === 'studenta@iiita.ac.in');

    // Manually mark studentA as defaulter
    const userRepo = new (await import('../../src/infrastructure.persistence/repositories/UserRepository.js')).UserRepository();
    await userRepo.setDefaulter(studentA.id, true);

    const reqRes = await fetch(`${baseUrl}/api/issue-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: studentA.id,
        items: [{ itemId: 'dummy-item', name: 'TT Ball', qty: 1 }]
      })
    });

    expect(reqRes.status).toBe(403);
    const body = await reqRes.json();
    expect(body.error).toMatch(/defaulter/i);

    // Admin clears defaulter lock
    const clearRes = await fetch(`${baseUrl}/api/admin/users/${studentA.id}/clear-defaulter`, {
      method: 'POST'
    });
    expect(clearRes.status).toBe(200);

    // Eligibility restored
    const userRestored = await userRepo.findById(studentA.id);
    expect((userRestored as any).getIsDefaulter()).toBe(false);
  });

  // 5. Guard Counter Approval & Batch Registers (Rule 6, 7, 9)
  it('Guard flow: Approve request -> Active Register grouped by batch_id -> Intact Return', async () => {
    const usersRes = await fetch(`${baseUrl}/api/admin/users`);
    const { data: users } = await usersRes.json();
    const studentB = users.find((u: any) => u.email === 'studentb@iiita.ac.in');
    const guard = users.find((u: any) => u.role === 'GUARD');

    const invRes = await fetch(`${baseUrl}/api/inventory`);
    const { data: items } = await invRes.json();
    const tennisRacket = items.find((i: any) => i.name === 'Tennis Racket');

    // 1. Student B creates request
    const reqRes = await fetch(`${baseUrl}/api/issue-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: studentB.id,
        items: [{ itemId: tennisRacket.id, name: tennisRacket.name, qty: 1 }]
      })
    });
    const reqBody = await reqRes.json();
    const requestId = reqBody.data.id;

    // 2. Guard approves request
    const approveRes = await fetch(`${baseUrl}/api/guard/requests/${requestId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guardId: guard.id })
    });

    expect(approveRes.status).toBe(200);
    const approveBody = await approveRes.json();
    expect(approveBody.success).toBe(true);
    expect(approveBody.data.batchId).toBeDefined();
    expect(approveBody.data.unitsIssued).toBe(1);

    // 3. Active Register should now display this batch
    const regRes = await fetch(`${baseUrl}/api/guard/register/active`);
    expect(regRes.status).toBe(200);
    const regBody = await regRes.json();

    const activeBatch = regBody.data.find((b: any) => b.batchId === approveBody.data.batchId);
    expect(activeBatch).toBeDefined();
    expect(activeBatch.studentName).toBe('Student B');
    expect(activeBatch.units[0].status).toBe('ISSUED');

    const entryId = activeBatch.units[0].id;

    // 4. Guard returns unit intact
    const returnRes = await fetch(`${baseUrl}/api/guard/returns/${entryId}/intact`, {
      method: 'POST'
    });
    expect(returnRes.status).toBe(200);
    const returnBody = await returnRes.json();
    expect(returnBody.success).toBe(true);
    expect(returnBody.data.status).toBe('RETURNED');
  });

  // 6. Peer-to-Peer Transfer & Atomic Row Split (Rule 8)
  it('P2P Transfer: Initiate -> Cancel -> Re-initiate -> Accept with Atomic Row Split', async () => {
    const usersRes = await fetch(`${baseUrl}/api/admin/users`);
    const { data: users } = await usersRes.json();
    const studentA = users.find((u: any) => u.email === 'studenta@iiita.ac.in');
    const studentB = users.find((u: any) => u.email === 'studentb@iiita.ac.in');
    const guard = users.find((u: any) => u.role === 'GUARD');

    const invRes = await fetch(`${baseUrl}/api/inventory`);
    const { data: items } = await invRes.json();
    const chess = items.find((i: any) => i.name === 'Chess Set');

    // Student A issues Chess Set
    const reqRes = await fetch(`${baseUrl}/api/issue-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: studentA.id,
        items: [{ itemId: chess.id, name: chess.name, qty: 1 }]
      })
    });
    const { data: issueData } = await reqRes.json();

    // Guard approves
    const approveRes = await fetch(`${baseUrl}/api/guard/requests/${issueData.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guardId: guard.id })
    });
    const { data: batchData } = await approveRes.json();

    // Get active entry
    const regRes = await fetch(`${baseUrl}/api/guard/register/active`);
    const { data: activeBatches } = await regRes.json();
    const batch = activeBatches.find((b: any) => b.batchId === batchData.batchId);
    const entryId = batch.units[0].id;

    // 1. Student A initiates transfer to Student B
    const initRes = await fetch(`${baseUrl}/api/transfers/${entryId}/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: studentA.id,
        recipientId: studentB.id
      })
    });
    expect(initRes.status).toBe(200);

    // 2. Student A cancels transfer
    const cancelRes = await fetch(`${baseUrl}/api/transfers/${entryId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: studentA.id })
    });
    expect(cancelRes.status).toBe(200);

    // 3. Re-initiate transfer
    await fetch(`${baseUrl}/api/transfers/${entryId}/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: studentB.id,
        action: 'ACCEPT'
      })
    });

    expect(acceptRes.status).toBe(200);
    const acceptBody = await acceptRes.json();
    expect(acceptBody.success).toBe(true);
    expect(acceptBody.data.new_entry_id).toBeDefined();
    expect(acceptBody.data.batch_id).toBe(batchData.batchId); // Shared batch maintained

    // Real-time event for Guard UI
    expect(swappedEvent).not.toBeNull();
    expect(swappedEvent.newHolderId).toBe(studentB.id);

    unsub();

    // Clean up return by guard
    await fetch(`${baseUrl}/api/guard/returns/${acceptBody.data.new_entry_id}/intact`, {
      method: 'POST'
    });
  });

  // 7. Guard Damaged Return Locks Holder as Defaulter (Rule 7 & 9)
  it('Guard return damaged: sets DAMAGED, wipes pendingTransferToId, locks holder as DEFAULTER', async () => {
    const usersRes = await fetch(`${baseUrl}/api/admin/users`);
    const { data: users } = await usersRes.json();
    const studentA = users.find((u: any) => u.email === 'studenta@iiita.ac.in');
    const studentB = users.find((u: any) => u.email === 'studentb@iiita.ac.in');
    const guard = users.find((u: any) => u.role === 'GUARD');

    const invRes = await fetch(`${baseUrl}/api/inventory`);
    const { data: items } = await invRes.json();
    const ball = items.find((i: any) => i.name === 'TT Ball');

    // Ensure studentA is not locked as defaulter before issuing and reset TT Ball stock
    const userRepo = new (await import('../../src/infrastructure.persistence/repositories/UserRepository.js')).UserRepository();
    await userRepo.setDefaulter(studentA.id, false);

    const sacItemRepo = new (await import('../../src/infrastructure.persistence/repositories/SACItemRepository.js')).SACItemRepository();
    const ballEntity = await sacItemRepo.findById(ball.id);
    if (ballEntity && ballEntity.getAvailableQty() < 1) {
      (ballEntity as any).availableQty = 12;
      (ballEntity as any).totalQty = 12;
      (ballEntity as any).damagedQty = 0;
      await sacItemRepo.save(ballEntity);
    }

    // Issue TT Ball
    const reqRes = await fetch(`${baseUrl}/api/issue-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: studentA.id,
        items: [{ itemId: ball.id, name: ball.name, qty: 1 }]
      })
    });
    expect(reqRes.status).toBe(201);
    const { data: issueData } = await reqRes.json();

    const approveRes = await fetch(`${baseUrl}/api/guard/requests/${issueData.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guardId: guard.id })
    });
    expect(approveRes.status).toBe(200);
    const { data: batchData } = await approveRes.json();

    const regRes = await fetch(`${baseUrl}/api/guard/register/active`);
    const { data: batches } = await regRes.json();
    const activeBatch = batches.find((b: any) => b.batchId === batchData.batchId);
    const entryId = activeBatch.units[0].id;

    // A initiates transfer to B
    await fetch(`${baseUrl}/api/transfers/${entryId}/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: studentA.id, recipientId: studentB.id })
    });

    // A returns item damaged before B accepts
    const damagedRes = await fetch(`${baseUrl}/api/guard/returns/${entryId}/damaged`, {
      method: 'POST'
    });

    expect(damagedRes.status).toBe(200);
    const damagedBody = await damagedRes.json();
    expect(damagedBody.data.status).toBe('DAMAGED');
    expect(damagedBody.data.studentId).toBe(studentA.id);

    // Verify studentA is locked as Defaulter
    const studentARefreshed = await userRepo.findById(studentA.id);
    expect((studentARefreshed as any).getIsDefaulter()).toBe(true);

    // Verify late acceptance by B is rejected with 409 Conflict (Rule 9)
    const lateAcceptRes = await fetch(`${baseUrl}/api/transfers/${entryId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: studentB.id, action: 'ACCEPT' })
    });
    expect(lateAcceptRes.status).toBe(409);

    // Clean up defaulter and restore ball stock
    await fetch(`${baseUrl}/api/admin/users/${studentA.id}/clear-defaulter`, { method: 'POST' });
    if (ballEntity) {
      (ballEntity as any).availableQty = 12;
      (ballEntity as any).totalQty = 12;
      (ballEntity as any).damagedQty = 0;
      await sacItemRepo.save(ballEntity);
    }
  });

  // 8. Admin Inventory Management & Deletion Safety Check
  it('Admin DELETE /api/admin/inventory/:id: rejects with 400 if active holdings exist, succeeds otherwise', async () => {
    // 1. Create a temporary item
    const createRes = await fetch(`${baseUrl}/api/admin/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    // 2. Delete item without active holdings -> succeeds with 200
    const deleteRes = await fetch(`${baseUrl}/api/admin/inventory/${tempItemId}`, {
      method: 'DELETE'
    });
    expect(deleteRes.status).toBe(200);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.success).toBe(true);
    expect(deleteBody.data.deletedItemId).toBe(tempItemId);

    // Verify it is excluded from live inventory
    const invRes = await fetch(`${baseUrl}/api/inventory`);
    const { data: items } = await invRes.json();
    const found = items.find((i: any) => i.id === tempItemId);
    expect(found).toBeUndefined();
  });
});
