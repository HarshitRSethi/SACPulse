import crypto from 'crypto';
import type { UserRole } from '../../domain/entities/User.js';
import { AuthenticationException } from '../../domain/exceptions/DomainException.js';

export interface JwtSessionPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf.toString('base64url');
}

function base64UrlDecodeToString(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf-8');
}

/**
 * JwtTokenService
 *
 * Implements RFC 7519 HMAC-SHA256 (HS256) signed JSON Web Tokens using Node's native `crypto` module.
 * Replaces legacy unsigned Base64 payloads with tamper-evident signatures and enforced expiry checks.
 */
export class JwtTokenService {
  private static readonly DEFAULT_EXPIRES_IN_SECONDS = 12 * 60 * 60; // 12 hours
  private readonly secret: string;

  constructor(secret?: string) {
    this.secret =
      secret ||
      process.env.JWT_SECRET ||
      'sacpulse-institutional-hmac-sha256-secret-key';
  }

  public sign(
    claims: { userId: string; email: string; role: UserRole | string },
    expiresInSeconds: number = JwtTokenService.DEFAULT_EXPIRES_IN_SECONDS,
    nowMs: number = Date.now()
  ): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const iat = Math.floor(nowMs / 1000);
    const exp = iat + expiresInSeconds;

    const payload: JwtSessionPayload = {
      userId: claims.userId,
      email: claims.email.toLowerCase().trim(),
      role: claims.role.toUpperCase() as UserRole,
      iat,
      exp
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(signingInput)
      .digest('base64url');

    return `${signingInput}.${signature}`;
  }

  public verify(token: string, nowMs: number = Date.now()): JwtSessionPayload {
    if (!token || typeof token !== 'string') {
      throw new AuthenticationException('Unauthorized: Missing bearer token.');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new AuthenticationException('Unauthorized: Malformed JWT token.');
    }

    const [encodedHeader, encodedPayload, providedSignature] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(signingInput)
      .digest('base64url');

    const providedBuf = Buffer.from(providedSignature, 'utf-8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf-8');

    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      throw new AuthenticationException('Unauthorized: Invalid JWT signature.');
    }

    let header: { alg?: string; typ?: string };
    let payload: JwtSessionPayload;
    try {
      header = JSON.parse(base64UrlDecodeToString(encodedHeader));
      payload = JSON.parse(base64UrlDecodeToString(encodedPayload));
    } catch {
      throw new AuthenticationException('Unauthorized: Corrupted JWT payload.');
    }

    if (header.alg !== 'HS256') {
      throw new AuthenticationException('Unauthorized: Unsupported JWT signing algorithm.');
    }

    if (
      !payload ||
      typeof payload.userId !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.role !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      throw new AuthenticationException('Unauthorized: Incomplete JWT claims.');
    }

    const nowSec = Math.floor(nowMs / 1000);
    if (nowSec >= payload.exp) {
      throw new AuthenticationException('Unauthorized: Session token has expired.');
    }

    return payload;
  }

  public tryVerify(token: string, nowMs: number = Date.now()): JwtSessionPayload | null {
    try {
      return this.verify(token, nowMs);
    } catch {
      return null;
    }
  }
}

const defaultJwtService = new JwtTokenService();

export function generateSessionToken(
  payload: { userId: string; email: string; role: string },
  expiresInSeconds?: number
): string {
  return defaultJwtService.sign(payload, expiresInSeconds);
}

export function verifySessionToken(token: string): JwtSessionPayload | null {
  return defaultJwtService.tryVerify(token);
}

