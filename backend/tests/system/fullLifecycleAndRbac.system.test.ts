import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../src/presentation/app.js';
import {
  createInMemoryRepositories,
  type RepositoryContainer
} from '../../src/infrastructure/persistence/index.js';
import { JwtTokenService } from '../../src/application/services/JwtTokenService.js';
import { IssueRequestTTLScheduler } from '../../src/application/services/IssueRequestTTLScheduler.js';
import { RealtimeEventHub } from '../../src/application/services/RealtimeEventHub.js';

describe('Deterministic In-Memory System Lifecycle & RBAC Security Matrix Suite', () => {
  let server: http.Server;
  let baseUrl: string;
  let repositories: RepositoryContainer;
  const jwtService = new JwtTokenService('system-test-hmac-secret-key-2026');

  let adminToken: string;
  let guardToken: string;
  let studentAToken: string;
  let studentBToken: string;

  let guardId: string;
  let studentAId: string;
  let studentBId: string;

  beforeAll(async () => {
    repositories = createInMemoryRepositories(true);
    const app = createApp({
      repositories,
      jwtService
    });
    server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    const allUsers = await repositories.userRepo.findAll();
    const admin = allUsers.find((u) => u.getRole() === 'ADMIN')!;
    const guard = allUsers.find((u) => u.getRole() === 'GUARD')!;
    const studentA = allUsers.find((u) => u.getEmail() === 'studenta@iiita.ac.in')!;
    const studentB = allUsers.find((u) => u.getEmail() === 'studentb@iiita.ac.in')!;

    guardId = guard.getId();
    studentAId = studentA.getId();
    studentBId = studentB.getId();

    adminToken = jwtService.sign({
      userId: admin.getId(),
      email: admin.getEmail(),
      role: 'ADMIN'
    });
    guardToken = jwtService.sign({
      userId: guard.getId(),
      email: guard.getEmail(),
      role: 'GUARD'
    });
    studentAToken = jwtService.sign({
      userId: studentA.getId(),
      email: studentA.getEmail(),
      role: 'STUDENT'
    });
    studentBToken = jwtService.sign({
      userId: studentB.getId(),
      email: studentB.getEmail(),
      role: 'STUDENT'
    });
  });

  afterAll(async () => {
    IssueRequestTTLScheduler.getInstance().clearAll();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  describe('1. Zero-Trust RBAC & Horizontal IDOR Enforcement Matrix', () => {
    it('rejects unauthenticated access to protected student, guard, and admin endpoints with 401', async () => {
      const protectedCalls = [
        fetch(`${baseUrl}/api/issue-requests`, { method: 'POST' }),
        fetch(`${baseUrl}/api/guard/register/active`),
        fetch(`${baseUrl}/api/admin/users`),
        fetch(`${baseUrl}/api/admin/register-logs`)
      ];

      const responses = await Promise.all(protectedCalls);
      for (const res of responses) {
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.code).toBe('AUTHENTICATION_ERROR');
      }
    });

    it('enforces vertical role boundaries (STUDENT cannot access GUARD/ADMIN; GUARD cannot access ADMIN/STUDENT checkout)', async () => {
      // Student trying Guard & Admin routes -> 403
      const studentToGuard = await fetch(`${baseUrl}/api/guard/register/active`, {
        headers: { Authorization: `Bearer ${studentAToken}` }
      });
      expect(studentToGuard.status).toBe(403);

      const studentToAdmin = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${studentAToken}` }
      });
      expect(studentToAdmin.status).toBe(403);

      // Guard trying Admin & Student issue-request routes -> 403
      const guardToAdmin = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${guardToken}` }
      });
      expect(guardToAdmin.status).toBe(403);

      const guardToCheckout = await fetch(`${baseUrl}/api/issue-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${guardToken}`
        },
        body: JSON.stringify({
          studentId: studentAId,
          items: [{ itemId: 'any', name: 'TT Racket', qty: 1 }]
        })
      });
      expect(guardToCheckout.status).toBe(403);
    });

    it('prevents horizontal IDOR: Student A cannot submit requests or inspect holdings/transfers on behalf of Student B', async () => {
      const spoofedCheckout = await fetch(`${baseUrl}/api/issue-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentAToken}`
        },
        body: JSON.stringify({
          studentId: studentBId,
          items: [{ itemId: 'any', name: 'TT Racket', qty: 1 }]
        })
      });
      expect(spoofedCheckout.status).toBe(403);

      const spoofedHoldings = await fetch(`${baseUrl}/api/register/student/${studentBId}`, {
        headers: { Authorization: `Bearer ${studentAToken}` }
      });
      expect(spoofedHoldings.status).toBe(403);

      const spoofedIncoming = await fetch(`${baseUrl}/api/transfers/incoming/${studentBId}`, {
        headers: { Authorization: `Bearer ${studentAToken}` }
      });
      expect(spoofedIncoming.status).toBe(403);
    });
  });

  describe('2. Full Multi-Actor Lifecycle: Multi-Unit Checkout -> P2P Split -> Guard Desk Split Grouping -> Damage Defaulter -> Admin Clear -> Batch Return', () => {
    it('executes the complete end-to-end SAC operational workflow with ACID consistency and real-time notifications', async () => {
      const hub = RealtimeEventHub.getInstance();
      const studentNotifications: Array<{ studentId: string; event: string }> = [];
      const unsubNotif = hub.subscribe('STUDENT_NOTIFICATION', (payload) => {
        studentNotifications.push({ studentId: payload.studentId, event: payload.event });
      });

      // Step 1: Fetch live inventory and pick TT Racket (6 available)
      const invRes = await fetch(`${baseUrl}/api/inventory`);
      const { data: catalog } = await invRes.json();
      const ttRacket = catalog.find((i: any) => i.name === 'TT Racket');
      expect(ttRacket.availableQty).toBe(6);

      // Step 2: Student A requests 2 TT Rackets
      const createReqRes = await fetch(`${baseUrl}/api/issue-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentAToken}`
        },
        body: JSON.stringify({
          studentId: studentAId,
          items: [{ itemId: ttRacket.id, name: ttRacket.name, qty: 2 }]
        })
      });
      expect(createReqRes.status).toBe(201);
      const { data: issueReq } = await createReqRes.json();

      // Verify Student A's own pending tracker endpoint returns the request
      const myPendingRes = await fetch(`${baseUrl}/api/issue-requests/my-pending`, {
        headers: { Authorization: `Bearer ${studentAToken}` }
      });
      expect(myPendingRes.status).toBe(200);
      const { data: myPending } = await myPendingRes.json();
      expect(myPending.some((r: any) => r.id === issueReq.id)).toBe(true);

      // Step 3: Guard approves the 2-racket bundle -> 2 RegisterEntry rows under 1 shared batchId
      const approveRes = await fetch(`${baseUrl}/api/guard/requests/${issueReq.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${guardToken}`
        },
        body: JSON.stringify({ guardId })
      });
      expect(approveRes.status).toBe(200);
      const { data: approvedBatch } = await approveRes.json();
      expect(approvedBatch.unitsIssued).toBe(2);

      // Available stock decremented by 2 -> 4
      const invAfterApprove = await (await fetch(`${baseUrl}/api/inventory`)).json();
      expect(
        invAfterApprove.data.find((i: any) => i.id === ttRacket.id).availableQty
      ).toBe(4);

      // Step 4: Student A transfers 1 of the 2 rackets to Student B
      const holdingsARes = await fetch(`${baseUrl}/api/register/student/${studentAId}`, {
        headers: { Authorization: `Bearer ${studentAToken}` }
      });
      const { data: holdingsA } = await holdingsARes.json();
      expect(holdingsA).toHaveLength(2);
      const racketToTransferId = holdingsA[0].id;

      const initTransferRes = await fetch(
        `${baseUrl}/api/transfers/${racketToTransferId}/initiate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentAToken}`
          },
          body: JSON.stringify({
            studentId: studentAId,
            recipientRollNo: 'IIT2023002' // Student B roll number lookup!
          })
        }
      );
      expect(initTransferRes.status).toBe(200);

      // Student B sees incoming transfer offer
      const incomingBRes = await fetch(`${baseUrl}/api/transfers/incoming/${studentBId}`, {
        headers: { Authorization: `Bearer ${studentBToken}` }
      });
      const { data: incomingB } = await incomingBRes.json();
      expect(incomingB).toHaveLength(1);
      expect(incomingB[0].entryId).toBe(racketToTransferId);

      // Student B accepts -> Atomic Row Split!
      const acceptRes = await fetch(
        `${baseUrl}/api/transfers/${racketToTransferId}/respond`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentBToken}`
          },
          body: JSON.stringify({
            studentId: studentBId,
            action: 'ACCEPT'
          })
        }
      );
      expect(acceptRes.status).toBe(200);
      const { data: splitResult } = await acceptRes.json();

      // Step 5: Guard Desk Active Register shows BOTH Student A (1 racket) AND Student B (1 racket) under shared batchId
      const activeRegRes = await fetch(`${baseUrl}/api/guard/register/active`, {
        headers: { Authorization: `Bearer ${guardToken}` }
      });
      const { data: activeBatches } = await activeRegRes.json();
      const splitBatches = activeBatches.filter(
        (b: any) => b.batchId === approvedBatch.batchId
      );
      expect(splitBatches).toHaveLength(2);
      expect(splitBatches.map((b: any) => b.studentName).sort()).toEqual([
        'Student A',
        'Student B'
      ]);

      // Step 6: Guard marks Student B's transferred racket DAMAGED -> locks Student B as Defaulter!
      const damageRes = await fetch(
        `${baseUrl}/api/guard/returns/${splitResult.new_entry_id}/damaged`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${guardToken}` }
        }
      );
      expect(damageRes.status).toBe(200);

      // Student B is now blocked from borrowing (403 INELIGIBLE_BORROWER)
      const blockedCheckout = await fetch(`${baseUrl}/api/issue-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentBToken}`
        },
        body: JSON.stringify({
          studentId: studentBId,
          items: [{ itemId: ttRacket.id, name: ttRacket.name, qty: 1 }]
        })
      });
      expect(blockedCheckout.status).toBe(403);
      const blockedBody = await blockedCheckout.json();
      expect(blockedBody.code).toBe('INELIGIBLE_BORROWER');

      // Step 7: Admin clears Student B's defaulter lock
      const clearRes = await fetch(`${baseUrl}/api/admin/users/${studentBId}/clear-defaulter`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(clearRes.status).toBe(200);

      // Step 8: Guard closes Student A's remaining batch intact via batch return endpoint
      const batchReturnRes = await fetch(
        `${baseUrl}/api/guard/returns/batch/${approvedBatch.batchId}/intact`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${guardToken}` }
        }
      );
      expect(batchReturnRes.status).toBe(200);
      const batchReturnBody = await batchReturnRes.json();
      expect(batchReturnBody.data.returnedCount).toBe(1);

      // Final stock invariant: 6 total - 1 damaged = 5 available, 1 damaged
      const invFinal = await (await fetch(`${baseUrl}/api/inventory`)).json();
      const finalRacket = invFinal.data.find((i: any) => i.id === ttRacket.id);
      expect(finalRacket.availableQty).toBe(5);
      expect(finalRacket.damagedQty).toBe(1);

      // Verify unified STUDENT_NOTIFICATION events fired for approval, incoming transfer, acceptance, damage, and clearance
      expect(studentNotifications.length).toBeGreaterThanOrEqual(5);

      unsubNotif();
    });
  });
});
