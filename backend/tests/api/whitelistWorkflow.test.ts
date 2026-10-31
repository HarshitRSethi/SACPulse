import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../src/presentation/app.js';
import { DatabaseConnection } from '../../src/infrastructure.persistence/DatabaseConnection.js';
import { generateSessionToken } from '../../src/controllers/AuthController.js';

describe('Whitelist Request, Approval & Revocation Workflow Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  const testEmail1 = `guest.scholar.${Date.now()}@gmail.com`;
  const testEmail2 = `temp.guard.${Date.now()}@gmail.com`;
  const testDirectEmail = `direct.admin.${Date.now()}@gmail.com`;

  const rootAdminEmail = process.env.INITIAL_ADMIN_EMAIL || 'harshitrsethi@gmail.com';
  const rootAdminToken = generateSessionToken({
    userId: 'root-admin-uuid',
    email: rootAdminEmail,
    role: 'ADMIN'
  });

  const delegatedAdminEmail = `delegated.admin.${Date.now()}@gmail.com`;
  const delegatedAdminToken = generateSessionToken({
    userId: 'delegated-admin-uuid',
    email: delegatedAdminEmail,
    role: 'ADMIN'
  });

  let requestId1: string;
  let requestId2: string;
  let directStaffId: string;
  let approvedStaffId: string;

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
  });

  afterAll(async () => {
    // Cleanup generated test data
    const db = DatabaseConnection.getInstance();
    const supabase = db.getSupabase();
    if (supabase) {
      await supabase.from('whitelist_requests').delete().in('email', [testEmail1, testEmail2]);
      await supabase.from('whitelisted_staff').delete().in('email', [testEmail1, testEmail2, testDirectEmail]);
      await supabase.from('users').delete().in('email', [testEmail1, testEmail2, testDirectEmail]);
    }

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // 1. Validation & Submitting Whitelist Request
  describe('POST /api/auth/request-whitelist', () => {
    it('should reject invalid 10-digit Indian mobile numbers with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/api/auth/request-whitelist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail1,
          name: 'Visiting Scholar Dr. Rao',
          mobileNo: '1234567890', // starts with 1
          reason: 'Conducting guest seminars'
        })
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Invalid mobile number');
    });

    it('should submit a valid whitelist request and store as PENDING', async () => {
      const res = await fetch(`${baseUrl}/api/auth/request-whitelist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail1,
          name: 'Visiting Scholar Dr. Rao',
          mobileNo: '9876543210',
          reason: 'Conducting sports biomechanics research'
        })
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();
      expect(json.data.email).toBe(testEmail1.toLowerCase());
      expect(json.data.status).toBe('PENDING');

      requestId1 = json.data.id;
    });

    it('should submit a second request for guard role', async () => {
      const res = await fetch(`${baseUrl}/api/auth/request-whitelist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail2,
          name: 'Night Shift Guard Vijay',
          mobileNo: '9876543211',
          reason: 'Temporary night shift guard duty'
        })
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      requestId2 = json.data.id;
    });
  });

  // 2. Querying Whitelist Status
  describe('GET /api/auth/whitelist-status', () => {
    it('should return PENDING status for requested email', async () => {
      const res = await fetch(`${baseUrl}/api/auth/whitelist-status?email=${encodeURIComponent(testEmail1)}`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('PENDING');
      expect(json.data.email).toBe(testEmail1.toLowerCase());
    });

    it('should return NOT_FOUND for unknown email', async () => {
      const res = await fetch(`${baseUrl}/api/auth/whitelist-status?email=random.unknown@gmail.com`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('NOT_FOUND');
    });
  });

  // 3. Admin Listing Whitelist
  describe('GET /api/admin/whitelist', () => {
    it('should return pending requests and active users', async () => {
      const res = await fetch(`${baseUrl}/api/admin/whitelist`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data.pendingRequests)).toBe(true);
      expect(Array.isArray(json.data.activeUsers)).toBe(true);

      const foundReq1 = json.data.pendingRequests.find((r: any) => r.id === requestId1);
      expect(foundReq1).toBeDefined();
      expect(foundReq1.name).toBe('Visiting Scholar Dr. Rao');
    });
  });

  // 4. Admin Approving Whitelist as STUDENT / GUARD
  describe('POST /api/admin/whitelist/approve', () => {
    it('should approve testEmail1 as STUDENT', async () => {
      const res = await fetch(`${baseUrl}/api/admin/whitelist/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: requestId1,
          role: 'STUDENT'
        })
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.request.status).toBe('APPROVED');
      expect(json.data.request.approved_role).toBe('STUDENT');
      expect(json.data.user.role).toBe('STUDENT');

      // Now verify that testEmail1 can authenticate via Google login
      const loginRes = await fetch(`${baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail1,
          name: 'Visiting Scholar Dr. Rao'
        })
      });

      expect(loginRes.status).toBe(200);
      const loginJson = await loginRes.json();
      expect(loginJson.success).toBe(true);
      expect(loginJson.data.user.role).toBe('STUDENT');
      expect(loginJson.data.user.mobileNo).toBe('9876543210');
    });

    it('should reject testEmail2 request when Admin clicks reject', async () => {
      const res = await fetch(`${baseUrl}/api/admin/whitelist/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: requestId2
        })
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.request.status).toBe('REJECTED');

      // Unapproved non-IIITA email should be rejected with 403 on Google login
      const loginRes = await fetch(`${baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail2,
          name: 'Night Shift Guard Vijay'
        })
      });

      expect(loginRes.status).toBe(403);
      const loginJson = await loginRes.json();
      expect(loginJson.code).toBe('ACCESS_RESTRICTED');
      expect(loginJson.whitelistStatus).toBe('REJECTED');
    });
  });

  // 5. Admin Direct Add & Revocation with Option A Security
  describe('Direct Add & Revoke Whitelist Workflow (Option A Security)', () => {
    it('should reject delegated admin attempting to directly add an account as ADMIN with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/admin/whitelist/direct-add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${delegatedAdminToken}`
        },
        body: JSON.stringify({
          email: testDirectEmail,
          name: 'Direct Admin Sharma',
          mobileNo: '9876543212',
          role: 'ADMIN'
        })
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Only the primary institutional administrator can grant ADMIN role');
    });

    it('should directly add an account as ADMIN when executed by Root Admin', async () => {
      const res = await fetch(`${baseUrl}/api/admin/whitelist/direct-add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${rootAdminToken}`
        },
        body: JSON.stringify({
          email: testDirectEmail,
          name: 'Direct Admin Sharma',
          mobileNo: '9876543212',
          role: 'ADMIN'
        })
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.role).toBe('ADMIN');
      directStaffId = json.data.id;

      // Google login succeeds as ADMIN
      const loginRes = await fetch(`${baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testDirectEmail,
          name: 'Direct Admin Sharma'
        })
      });

      expect(loginRes.status).toBe(200);
      const loginJson = await loginRes.json();
      expect(loginJson.data.user.role).toBe('ADMIN');
    });

    it('should prevent an admin from revoking their own account (Self-Revocation guard) with 400 Bad Request', async () => {
      // Direct Admin Sharma attempts to revoke their own ID using their own token
      const sharmaToken = generateSessionToken({
        userId: 'sharma-id',
        email: testDirectEmail,
        role: 'ADMIN'
      });

      const res = await fetch(`${baseUrl}/api/admin/whitelist/${directStaffId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${sharmaToken}`
        }
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('You cannot revoke your own account access');
    });

    it('should reject delegated admin attempting to revoke another ADMIN account with 403 Forbidden', async () => {
      // Delegated admin attempts to revoke Direct Admin Sharma
      const res = await fetch(`${baseUrl}/api/admin/whitelist/${directStaffId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${delegatedAdminToken}`
        }
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Only the primary institutional administrator can revoke an ADMIN account');
    });

    it('should allow Root Admin to revoke access and immediately block future logins with 403 Forbidden', async () => {
      // Find staff ID for testEmail1 in active whitelist
      const listRes = await fetch(`${baseUrl}/api/admin/whitelist`, {
        headers: { Authorization: `Bearer ${rootAdminToken}` }
      });
      const listJson = await listRes.json();
      expect(listJson.data.initialAdminEmail).toBeDefined();

      const staff1 = listJson.data.activeUsers.find((u: any) => u.email === testEmail1.toLowerCase());
      expect(staff1).toBeDefined();
      approvedStaffId = staff1.id;

      // Revoke access as Root Admin
      const delRes = await fetch(`${baseUrl}/api/admin/whitelist/${approvedStaffId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${rootAdminToken}`
        }
      });
      expect(delRes.status).toBe(200);
      const delJson = await delRes.json();
      expect(delJson.success).toBe(true);

      // Now Google login should fail with 403 Forbidden
      const loginRes = await fetch(`${baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail1,
          name: 'Visiting Scholar Dr. Rao'
        })
      });

      expect(loginRes.status).toBe(403);
      const loginJson = await loginRes.json();
      expect(loginJson.code).toBe('ACCESS_RESTRICTED');
    });
  });
});
