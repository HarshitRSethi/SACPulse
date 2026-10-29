import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../src/presentation/app.js';
import { DatabaseConnection } from '../../src/infrastructure.persistence/DatabaseConnection.js';

describe('SACPulse Auth & Whitelist Roles Integration Tests (Part 1B)', () => {
  let server: http.Server;
  let baseUrl: string;
  const testStudentEmail = `test.student.${Date.now()}@iiita.ac.in`;
  const testGuardEmail = 'guard.sac.iiita@gmail.com';
  let studentToken: string;
  let studentUserId: string;

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
    // Cleanup generated test user
    const db = DatabaseConnection.getInstance();
    const supabase = db.getSupabase();
    if (supabase) {
      await supabase.from('users').delete().eq('email', testStudentEmail);
    }

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // 1. @iiita.ac.in auto-creates Student with parsed Roll No
  it('POST /api/auth/google should auto-create Student with parsed Roll No for @iiita.ac.in emails (Rule 1)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testStudentEmail,
        name: 'New College Student'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.token).toBeDefined();

    const expectedRollNo = testStudentEmail.split('@')[0].toUpperCase();
    expect(body.data.user.role).toBe('STUDENT');
    expect(body.data.user.rollNo).toBe(expectedRollNo);
    expect(body.data.user.email).toBe(testStudentEmail);
    expect(body.data.user.dashboardRoute).toBe('/student');
    expect(body.data.user.mobileNo).toBeNull();
    expect(body.data.requiresMobileSetup).toBe(true);

    studentToken = body.data.token;
    studentUserId = body.data.user.id;
  });

  // 2. Whitelisted email receives their exact assigned role ('GUARD' or 'ADMIN')
  it('POST /api/auth/google should assign exact whitelisted role for non-iiita staff accounts (Rule 2)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testGuardEmail,
        name: 'SAC Guard Ramesh'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.role).toBe('GUARD');
    expect(body.data.user.dashboardRoute).toBe('/guard');
    expect(body.data.token).toBeDefined();
  });

  // 3. Unwhitelisted external email returns 403 Forbidden
  it('POST /api/auth/google should reject unwhitelisted external emails with 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'unauthorized.external@gmail.com',
        name: 'Intruder'
      })
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Access restricted to @iiita.ac.in or whitelisted accounts');
  });

  // 4. Mobile setup updates phone number and rejects invalid inputs
  describe('PATCH /api/auth/mobile-setup', () => {
    it('should reject requests without authentication with 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/auth/mobile-setup`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobileNo: '9876543210' })
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Unauthorized');
    });

    it('should reject invalid mobile numbers (non-Indian format) with 400 Bad Request', async () => {
      // Invalid lengths or starting digits
      const invalidNumbers = ['12345', '1234567890', '987654321', '98765432101', 'abcdefghij'];

      for (const num of invalidNumbers) {
        const res = await fetch(`${baseUrl}/api/auth/mobile-setup`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`
          },
          body: JSON.stringify({ mobileNo: num })
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain('Invalid mobile number');
      }
    });

    it('should accept valid 10-digit Indian mobile number and update user profile', async () => {
      const validMobile = '9876543210';
      const res = await fetch(`${baseUrl}/api/auth/mobile-setup`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`
        },
        body: JSON.stringify({ mobileNo: validMobile })
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.mobileNo).toBe(validMobile);
      expect(body.data.requiresMobileSetup).toBe(false);

      // Verify on subsequent Google login that requiresMobileSetup is now false
      const loginRes = await fetch(`${baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testStudentEmail,
          name: 'New College Student'
        })
      });

      const loginBody = await loginRes.json();
      expect(loginBody.status || loginRes.status).toBe(200);
      expect(loginBody.data.user.mobileNo).toBe(validMobile);
      expect(loginBody.data.requiresMobileSetup).toBe(false);
    });
  });
});
