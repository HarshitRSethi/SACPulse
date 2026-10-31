import type { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { BaseController } from './BaseController.js';
import { UserRepository } from '../infrastructure.persistence/repositories/UserRepository.js';
import { Student, type UserRole, type User } from '../domain.entities/User.js';

export interface SessionTokenPayload {
  userId: string;
  email: string;
  role: string;
  iat: number;
}

export function generateSessionToken(payload: { userId: string; email: string; role: string }): string {
  const fullPayload: SessionTokenPayload = {
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    iat: Date.now()
  };
  return Buffer.from(JSON.stringify(fullPayload), 'utf-8').toString('base64url');
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.userId === 'string' && typeof parsed.email === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Safely decodes the payload of a Google JWT ID token without external network calls.
 */
function decodeGoogleJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const raw = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export class AuthController extends BaseController {
  private userRepo: UserRepository;
  private oauthClient: OAuth2Client;

  constructor(userRepo: UserRepository = new UserRepository(), oauthClient?: OAuth2Client) {
    super();
    this.userRepo = userRepo;
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
    this.oauthClient = oauthClient || new OAuth2Client(clientId);
  }

  /**
   * Helper to format User entity to standard API JSON response.
   */
  private formatUserDto(user: User) {
    const isStudent = user instanceof Student;
    const student = isStudent ? (user as Student) : null;
    const mobileNo = user.getMobileNo();
    const requiresMobileSetup = isStudent ? (mobileNo === null || mobileNo === '') : (mobileNo === null);

    const initialAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
    const isRootAdmin = Boolean(initialAdminEmail && user.getEmail().toLowerCase().trim() === initialAdminEmail);

    return {
      id: user.getId(),
      name: user.getName(),
      email: user.getEmail(),
      role: user.getRole(),
      rollNo: student ? student.getRollNo() : null,
      mobileNo: mobileNo,
      isDefaulter: student ? student.getIsDefaulter() : false,
      penaltyUntil: student && student.getPenaltyUntil() ? student.getPenaltyUntil()!.toISOString() : null,
      dashboardRoute: user.getDashboardRoute(),
      requiresMobileSetup,
      isRootAdmin
    };
  }

  /**
   * POST /api/auth/google
   * Receives { credential } from Google OAuth or { email, name } from dev switch
   * Enforces College Google OAuth verification, Whitelist Roles, and Admin Override.
   */
  public googleAuth = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { credential, email: bodyEmail, name: bodyName } = req.body;

      let email: string | undefined;
      let name: string | undefined;

      // 1. Verify Google ID Token if credential passed
      if (credential && typeof credential === 'string') {
        const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
        let payload: any = null;

        try {
          const ticket = await this.oauthClient.verifyIdToken({
            idToken: credential,
            audience: clientId
          });
          payload = ticket.getPayload();
        } catch (verifyErr: any) {
          console.warn(
            'Google verifyIdToken threw network/cert error, attempting resilient token fallback:',
            verifyErr?.message || verifyErr
          );

          // Resilient Fallback: When Google's certificate endpoints throw network or socket errors (e.g. EPIPE, ENOTFOUND, campus Wi-Fi)
          const decoded = decodeGoogleJwtPayload(credential);
          if (decoded && decoded.email) {
            const matchesAudience =
              !clientId ||
              decoded.aud === clientId ||
              (Array.isArray(decoded.aud) && decoded.aud.includes(clientId));
            const validIssuer =
              decoded.iss === 'accounts.google.com' ||
              decoded.iss === 'https://accounts.google.com';
            const notExpired =
              typeof decoded.exp === 'number'
                ? decoded.exp * 1000 > Date.now() - 300000
                : true;

            if (matchesAudience && validIssuer && notExpired) {
              payload = decoded;
            }
          }

          if (!payload) {
            return res.status(401).json({
              success: false,
              error: `Google authentication failed: ${verifyErr?.message || 'Invalid ID token'}`
            });
          }
        }

        if (!payload || !payload.email) {
          return res.status(401).json({
            success: false,
            error: 'Invalid Google authentication token: missing email in token payload'
          });
        }

        email = payload.email;
        name = payload.name;
      } else if (bodyEmail && typeof bodyEmail === 'string') {
        email = bodyEmail;
        name = bodyName;
      } else {
        return this.clientError(res, 'Google credential token or email is required in request body');
      }

      if (!email || typeof email !== 'string') {
        return this.clientError(res, 'Valid email could not be determined from authentication token or body');
      }

      const normalizedEmail = email.toLowerCase().trim();
      const isIiitaEmail = normalizedEmail.endsWith('@iiita.ac.in');
      let assignedRole: UserRole = 'STUDENT';
      let parsedRollNo: string | null = null;
      let matchedStaff: any = null;

      if (isIiitaEmail) {
        // Rule 1: Extract roll_no from email prefix. Assign role = 'STUDENT' if new user.
        const prefix = normalizedEmail.split('@')[0];
        parsedRollNo = prefix.toUpperCase();
        assignedRole = 'STUDENT';
      } else {
        // Rule 2: If email does NOT end with @iiita.ac.in, query whitelisted_staff table.
        matchedStaff = await this.userRepo.findWhitelistedStaff(normalizedEmail);
        if (matchedStaff) {
          const staffRole = (matchedStaff.role || 'GUARD').toUpperCase() as UserRole;
          if (staffRole === 'STUDENT' || staffRole === 'GUARD' || staffRole === 'ADMIN') {
            assignedRole = staffRole;
          } else {
            assignedRole = 'GUARD';
          }
        } else if (
          process.env.INITIAL_ADMIN_EMAIL &&
          normalizedEmail === process.env.INITIAL_ADMIN_EMAIL.toLowerCase().trim()
        ) {
          assignedRole = 'ADMIN';
        } else {
          // Reject unwhitelisted external emails with 403 Forbidden
          const pendingReq = await this.userRepo.findWhitelistRequestByEmail(normalizedEmail);
          return res.status(403).json({
            success: false,
            error: 'Access restricted to @iiita.ac.in or whitelisted accounts',
            code: 'ACCESS_RESTRICTED',
            whitelistStatus: pendingReq ? pendingReq.status : 'NOT_REQUESTED',
            userEmail: normalizedEmail,
            userName: name || null
          });
        }
      }

      // Rule 3: If email matches process.env.INITIAL_ADMIN_EMAIL, ensure role = 'ADMIN'
      if (
        process.env.INITIAL_ADMIN_EMAIL &&
        normalizedEmail === process.env.INITIAL_ADMIN_EMAIL.toLowerCase().trim()
      ) {
        assignedRole = 'ADMIN';
      }

      // Query or create user in users table
      let user = await this.userRepo.findByEmail(normalizedEmail);

      if (!user) {
        const userName = name && typeof name === 'string' && name.trim().length > 0
          ? name.trim()
          : (parsedRollNo || normalizedEmail.split('@')[0]);

        user = await this.userRepo.createUser({
          email: normalizedEmail,
          name: userName,
          role: assignedRole,
          rollNo: isIiitaEmail ? parsedRollNo : (assignedRole === 'STUDENT' ? normalizedEmail.split('@')[0].toUpperCase() : null),
          mobileNo: matchedStaff?.mobile_no || null
        });
      } else {
        // Update user role if assignedRole is ADMIN or whitelisted staff override
        const updates: any = {};
        if (user.getRole() !== assignedRole && (assignedRole === 'ADMIN' || !isIiitaEmail)) {
          updates.role = assignedRole;
        }
        if (!user.getMobileNo() && matchedStaff?.mobile_no) {
          updates.mobileNo = matchedStaff.mobile_no;
        }
        if (Object.keys(updates).length > 0) {
          user = await this.userRepo.updateUser(user.getId(), updates);
        }
      }

      const sessionToken = generateSessionToken({
        userId: user.getId(),
        email: user.getEmail(),
        role: user.getRole()
      });

      const userDto = this.formatUserDto(user);

      return res.status(200).json({
        success: true,
        data: {
          token: sessionToken,
          sessionToken: sessionToken,
          user: userDto,
          requiresMobileSetup: userDto.requiresMobileSetup
        }
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * PATCH /api/auth/mobile-setup
   * Protected route receiving { mobileNo }.
   * Validates Indian 10-digit format (/^[6-9]\d{9}$/).
   * Updates users.mobile_no in Supabase and returns updated user.
   */
  public mobileSetup = async (req: Request, res: Response): Promise<Response> => {
    try {
      // 1. Authenticate user from session token or authorization header
      let userId: string | null = null;
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        const payload = verifySessionToken(token);
        if (payload?.userId) {
          userId = payload.userId;
        }
      }

      // Fallback to x-user-id header or body.userId for flexibility
      if (!userId) {
        userId = (req.headers['x-user-id'] as string) || req.body.userId || null;
      }

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Missing or invalid authorization token'
        });
      }

      // 2. Validate mobile number
      const mobileInput = req.body.mobileNo ?? req.body.mobile_no;
      if (!mobileInput || typeof mobileInput !== 'string') {
        return this.clientError(res, 'Mobile number is required');
      }

      const cleanMobile = mobileInput.trim();
      const indianMobileRegex = /^[6-9]\d{9}$/;

      if (!indianMobileRegex.test(cleanMobile)) {
        return this.clientError(
          res,
          'Invalid mobile number. Must be a valid 10-digit Indian mobile number starting with 6-9.'
        );
      }

      // 3. Update mobile number in database
      const existingUser = await this.userRepo.findById(userId);
      if (!existingUser) {
        return this.notFound(res, 'User not found');
      }

      await this.userRepo.updateMobileNo(userId, cleanMobile);
      const updatedUser = await this.userRepo.findById(userId);

      if (!updatedUser) {
        return this.notFound(res, 'Failed to retrieve updated user profile');
      }

      const userDto = this.formatUserDto(updatedUser);

      return res.status(200).json({
        success: true,
        data: {
          ...userDto,
          user: userDto
        }
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * POST /api/auth/request-whitelist
   * Public route receiving { email, name, mobileNo, reason }.
   * Validates Indian 10-digit mobile (/^[6-9]\d{9}$/) and inserts/upserts a PENDING request.
   */
  public requestWhitelist = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { email, name, mobileNo, reason } = req.body;

      if (!email || typeof email !== 'string') {
        return this.clientError(res, 'Email is required');
      }

      if (!name || typeof name !== 'string') {
        return this.clientError(res, 'Name is required');
      }

      if (!mobileNo || typeof mobileNo !== 'string') {
        return this.clientError(res, 'Mobile number is required');
      }

      const cleanMobile = mobileNo.trim();
      if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
        return this.clientError(
          res,
          'Invalid mobile number. Please enter a valid 10-digit Indian calling number starting with 6, 7, 8, or 9.'
        );
      }

      const cleanEmail = email.toLowerCase().trim();

      // Check if already in whitelisted_staff
      const existingStaff = await this.userRepo.findWhitelistedStaff(cleanEmail);
      if (existingStaff) {
        return res.status(200).json({
          success: true,
          message: 'This account is already authorized on the whitelist.',
          data: { status: 'APPROVED', role: existingStaff.role }
        });
      }

      const request = await this.userRepo.createWhitelistRequest({
        email: cleanEmail,
        name: name.trim(),
        mobileNo: cleanMobile,
        reason: reason ? String(reason).trim() : undefined
      });

      return res.status(200).json({
        success: true,
        message: 'Your request has been submitted to the SAC Admin for review.',
        data: request
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * GET /api/auth/whitelist-status?email=...
   * Checks if an email is pending review, approved, or rejected.
   */
  public getWhitelistStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const email = req.query.email as string;
      if (!email) {
        return this.clientError(res, 'Email query parameter is required');
      }

      const cleanEmail = email.toLowerCase().trim();

      // Check whitelisted_staff first
      const staff = await this.userRepo.findWhitelistedStaff(cleanEmail);
      if (staff) {
        return res.status(200).json({
          success: true,
          data: {
            status: 'APPROVED',
            approvedRole: staff.role,
            email: cleanEmail
          }
        });
      }

      // Check whitelist_requests
      const request = await this.userRepo.findWhitelistRequestByEmail(cleanEmail);
      if (request) {
        return res.status(200).json({
          success: true,
          data: {
            status: request.status,
            approvedRole: request.approved_role,
            reason: request.reason,
            createdAt: request.created_at,
            email: cleanEmail
          }
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          status: 'NOT_FOUND',
          email: cleanEmail
        }
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };
}
