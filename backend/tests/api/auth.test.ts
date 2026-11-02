import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../src/presentation/app.js';
import type {
  IGoogleTokenVerifier,
  VerifiedGoogleIdentity
} from '../../src/application/services/AuthService.js';
import { AuthenticationException } from '../../src/domain/exceptions/DomainException.js';
import { DatabaseConnection } from '../../src/infrastructure/persistence/DatabaseConnection.js';

class MockGoogleTokenVerifier implements IGoogleTokenVerifier {
  public async verifyCredential(credential: string): Promise<VerifiedGoogleIdentity> {
    if (!credential.startsWith('mock-google:')) {
      throw new AuthenticationException('Google authentication failed: Invalid ID token signature');
    }
    const [, email, name] = credential.split(':');
    if (!email) {
      throw new AuthenticationException('Google authentication failed: Missing email claim');
    }
    return { email, name: name || undefined };
  }
}

describe('SACPulse Auth, Signed HS256 JWT & Whitelist Roles Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  const testStudentEmail = `test.student.${Date.now()}@iiita.ac.in`;
  const testGuardEmail = 'guard.sac.iiita@gmail.com';
  let studentToken: string;

  beforeAll(async () => {
    const app = createApp({
      googleVerifier: new MockGoogleTokenVerifier()
    });
    server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (process.env.PERSISTENCE_DRIVER !== 'memory') {
      const db = DatabaseConnection.getInstance();
      const supabase = db.getSupabase();
      if (supabase) {
        await supabase.from('users').delete().eq('email', testStudentEmail);
      }
    }

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('POST /api/auth/google should reject raw email payloads without a cryptographic Google credential (400)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testStudentEmail,
        name: 'Spoofed Raw Email'
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/credential token is required/i);
  });

  it('POST /api/auth/google should auto-create Student with parsed Roll No for verified @iiita.ac.in credentials (Rule 1)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: `mock-google:${testStudentEmail}:New College Student`
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.token).toBeDefined();
    // Verify 3-segment signed JWT structure (header.payload.signature)
    expect(body.data.token.split('.')).toHaveLength(3);

    const expectedRollNo = testStudentEmail.split('@')[0].toUpperCase();
    expect(body.data.user.role).toBe('STUDENT');
    expect(body.data.user.rollNo).toBe(expectedRollNo);
    expect(body.data.user.email).toBe(testStudentEmail);
    expect(body.data.user.dashboardRoute).toBe('/student');
    expect(body.data.user.mobileNo).toBeNull();
    expect(body.data.requiresMobileSetup).toBe(true);

    studentToken = body.data.token;
  });

  it('POST /api/auth/google should assign exact whitelisted role for non-iiita staff accounts (Rule 2)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: `mock-google:${testGuardEmail}:SAC Guard Ramesh`
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.role).toBe('GUARD');
    expect(body.data.user.dashboardRoute).toBe('/guard');
    expect(body.data.token).toBeDefined();
  });

  it('POST /api/auth/google should reject unwhitelisted external emails with 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: 'mock-google:unauthorized.external@gmail.com:Intruder'
      })
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Access restricted to @iiita.ac.in or whitelisted accounts');
  });

  it('POST /api/auth/google should reject invalid Google credential token with 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: 'invalid.bogus.jwt.token'
      })
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Google authentication failed');
  });

  it('POST /api/auth/demo-session should issue a signed JWT in non-production demo mode', async () => {
    const res = await fetch(`${baseUrl}/api/auth/demo-session`, {
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
    expect(body.data.token.split('.')).toHaveLength(3);
  });

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
      expect(body.error).toMatch(/Authentication required|Unauthorized/i);
    });

    it('should reject invalid mobile numbers (non-Indian format) with 400 Bad Request', async () => {
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
          credential: `mock-google:${testStudentEmail}:New College Student`
        })
      });

      const loginBody = await loginRes.json();
      expect(loginRes.status).toBe(200);
      expect(loginBody.data.user.mobileNo).toBe(validMobile);
      expect(loginBody.data.requiresMobileSetup).toBe(false);
    });
  });
});
