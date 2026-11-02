import { OAuth2Client } from 'google-auth-library';
import type { User, UserProfileDTO, UserRole } from '../../domain/entities/User.js';
import {
  AccessRestrictedException,
  AuthenticationException,
  EntityNotFoundException,
  ValidationException
} from '../../domain/exceptions/DomainException.js';
import type {
  IUserRepository,
  WhitelistRequestRecord
} from '../../domain/repositories/IUserRepository.js';
import { JwtTokenService } from './JwtTokenService.js';

export interface VerifiedGoogleIdentity {
  email: string;
  name?: string;
}

export interface IGoogleTokenVerifier {
  verifyCredential(credential: string): Promise<VerifiedGoogleIdentity>;
}

/**
 * Cryptographic Google OAuth 2.0 ID Token Verifier.
 * Never falls back to unverified base64 JWT decoding.
 */
export class GoogleOAuthTokenVerifier implements IGoogleTokenVerifier {
  private readonly oauthClient: OAuth2Client;
  private readonly clientId: string | undefined;

  constructor(oauthClient?: OAuth2Client, clientId?: string) {
    this.clientId =
      clientId || process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
    this.oauthClient = oauthClient || new OAuth2Client(this.clientId);
  }

  public async verifyCredential(credential: string): Promise<VerifiedGoogleIdentity> {
    try {
      const ticket = await this.oauthClient.verifyIdToken({
        idToken: credential,
        audience: this.clientId
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new AuthenticationException(
          'Google authentication failed: missing email claim in verified ID token.'
        );
      }
      return {
        email: payload.email,
        name: payload.name
      };
    } catch (err: unknown) {
      if (err instanceof AuthenticationException) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : 'Invalid ID token';
      throw new AuthenticationException(`Google authentication failed: ${msg}`);
    }
  }
}

export interface AuthSessionResult {
  token: string;
  sessionToken: string;
  user: UserProfileDTO;
  requiresMobileSetup: boolean;
}

/**
 * AuthService
 *
 * Orchestrates institutional Google OAuth verification, explicit non-production demo sessions,
 * `@iiita.ac.in` roll-number provisioning, external staff whitelist checks, mobile onboarding,
 * and HS256 JWT issuance.
 */
export class AuthService {
  private static readonly INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

  private readonly userRepo: IUserRepository;
  private readonly jwtService: JwtTokenService;
  private readonly googleVerifier: IGoogleTokenVerifier;

  constructor(
    userRepo: IUserRepository,
    jwtService: JwtTokenService = new JwtTokenService(),
    googleVerifier: IGoogleTokenVerifier = new GoogleOAuthTokenVerifier()
  ) {
    this.userRepo = userRepo;
    this.jwtService = jwtService;
    this.googleVerifier = googleVerifier;
  }

  public static isDemoAuthEnabled(): boolean {
    if (process.env.ENABLE_DEMO_AUTH === 'true') {
      return true;
    }
    if (process.env.ENABLE_DEMO_AUTH === 'false') {
      return false;
    }
    return process.env.NODE_ENV !== 'production';
  }

  /**
   * Production Google OAuth login — requires a cryptographically verifiable Google ID token.
   */
  public async authenticateWithGoogle(credential: unknown): Promise<AuthSessionResult> {
    if (!credential || typeof credential !== 'string' || !credential.trim()) {
      throw new ValidationException(
        'Google OAuth credential token is required. Raw email login is not permitted on /api/auth/google.'
      );
    }

    const identity = await this.googleVerifier.verifyCredential(credential.trim());
    return this.resolveAndIssueSession(identity.email, identity.name);
  }

  /**
   * Explicit Demo / Viva Role Switcher Session — strictly gated by `ENABLE_DEMO_AUTH` / non-production environment.
   * Applies the exact same `@iiita.ac.in` and `whitelisted_staff` authorization rules.
   */
  public async authenticateDemoSession(email: unknown, name?: unknown): Promise<AuthSessionResult> {
    if (!AuthService.isDemoAuthEnabled()) {
      throw new AccessRestrictedException(
        'Demo role-switching sessions are disabled in production.'
      );
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      throw new ValidationException('Valid email is required to establish a demo session.');
    }

    const cleanName = typeof name === 'string' && name.trim() ? name.trim() : undefined;
    return this.resolveAndIssueSession(email, cleanName);
  }

  private async resolveAndIssueSession(email: string, name?: string): Promise<AuthSessionResult> {
    const normalizedEmail = email.toLowerCase().trim();
    const initialAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
    const isIiitaEmail = normalizedEmail.endsWith('@iiita.ac.in');

    let assignedRole: UserRole = 'STUDENT';
    let parsedRollNo: string | null = null;
    let staffMobile: string | null = null;

    if (isIiitaEmail) {
      parsedRollNo = normalizedEmail.split('@')[0].toUpperCase();
      assignedRole = 'STUDENT';
    } else {
      const matchedStaff = await this.userRepo.findWhitelistedStaff(normalizedEmail);
      if (matchedStaff) {
        const staffRole = (matchedStaff.role || 'GUARD').toUpperCase() as UserRole;
        assignedRole =
          staffRole === 'STUDENT' || staffRole === 'GUARD' || staffRole === 'ADMIN'
            ? staffRole
            : 'GUARD';
        staffMobile = matchedStaff.mobile_no ?? null;
      } else if (initialAdminEmail && normalizedEmail === initialAdminEmail) {
        assignedRole = 'ADMIN';
      } else {
        const pendingReq = await this.userRepo.findWhitelistRequestByEmail(normalizedEmail);
        throw new AccessRestrictedException(
          'Access restricted to @iiita.ac.in or whitelisted accounts',
          {
            whitelistStatus: pendingReq ? pendingReq.status : 'NOT_REQUESTED',
            userEmail: normalizedEmail,
            userName: name || null
          }
        );
      }
    }

    if (initialAdminEmail && normalizedEmail === initialAdminEmail) {
      assignedRole = 'ADMIN';
    }

    let user: User | null = await this.userRepo.findByEmail(normalizedEmail);

    if (!user) {
      const displayName =
        name && name.trim().length > 0
          ? name.trim()
          : parsedRollNo || normalizedEmail.split('@')[0];

      user = await this.userRepo.createUser({
        email: normalizedEmail,
        name: displayName,
        role: assignedRole,
        rollNo: isIiitaEmail
          ? parsedRollNo
          : assignedRole === 'STUDENT'
            ? normalizedEmail.split('@')[0].toUpperCase()
            : null,
        mobileNo: staffMobile
      });
    } else {
      const updates: { role?: UserRole; mobileNo?: string | null } = {};
      if (user.getRole() !== assignedRole && (assignedRole === 'ADMIN' || !isIiitaEmail)) {
        updates.role = assignedRole;
      }
      if (!user.getMobileNo() && staffMobile) {
        updates.mobileNo = staffMobile;
      }
      if (Object.keys(updates).length > 0) {
        user = await this.userRepo.updateUser(user.getId(), updates);
      }
    }

    const token = this.jwtService.sign({
      userId: user.getId(),
      email: user.getEmail(),
      role: user.getRole()
    });

    const userDto = user.toProfileDTO(initialAdminEmail);

    return {
      token,
      sessionToken: token,
      user: userDto,
      requiresMobileSetup: userDto.requiresMobileSetup
    };
  }

  public async completeMobileOnboarding(
    userId: string,
    mobileInput: unknown
  ): Promise<{ user: UserProfileDTO } & UserProfileDTO> {
    if (!mobileInput || typeof mobileInput !== 'string') {
      throw new ValidationException('Mobile number is required.');
    }

    const cleanMobile = mobileInput.trim();
    if (!AuthService.INDIAN_MOBILE_REGEX.test(cleanMobile)) {
      throw new ValidationException(
        'Invalid mobile number. Must be a valid 10-digit Indian mobile number starting with 6-9.'
      );
    }

    const existingUser = await this.userRepo.findById(userId);
    if (!existingUser) {
      throw new EntityNotFoundException('User', userId);
    }

    existingUser.setMobileNo(cleanMobile);
    await this.userRepo.updateMobileNo(userId, cleanMobile);

    const updatedUser = await this.userRepo.findById(userId);
    if (!updatedUser) {
      throw new EntityNotFoundException('User', userId);
    }

    const initialAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
    const userDto = updatedUser.toProfileDTO(initialAdminEmail);

    return {
      ...userDto,
      user: userDto
    };
  }

  public async submitWhitelistRequest(params: {
    email: unknown;
    name: unknown;
    mobileNo: unknown;
    reason?: unknown;
  }): Promise<
    | { alreadyAuthorized: true; message: string; data: { status: 'APPROVED'; role: string } }
    | { alreadyAuthorized: false; message: string; data: WhitelistRequestRecord }
  > {
    if (!params.email || typeof params.email !== 'string') {
      throw new ValidationException('Email is required.');
    }
    if (!params.name || typeof params.name !== 'string') {
      throw new ValidationException('Name is required.');
    }
    if (!params.mobileNo || typeof params.mobileNo !== 'string') {
      throw new ValidationException('Mobile number is required.');
    }

    const cleanMobile = params.mobileNo.trim();
    if (!AuthService.INDIAN_MOBILE_REGEX.test(cleanMobile)) {
      throw new ValidationException(
        'Invalid mobile number. Please enter a valid 10-digit Indian calling number starting with 6, 7, 8, or 9.'
      );
    }

    const cleanEmail = params.email.toLowerCase().trim();
    const existingStaff = await this.userRepo.findWhitelistedStaff(cleanEmail);
    if (existingStaff) {
      return {
        alreadyAuthorized: true,
        message: 'This account is already authorized on the whitelist.',
        data: { status: 'APPROVED', role: existingStaff.role }
      };
    }

    const request = await this.userRepo.createWhitelistRequest({
      email: cleanEmail,
      name: params.name.trim(),
      mobileNo: cleanMobile,
      reason: params.reason ? String(params.reason).trim() : undefined
    });

    return {
      alreadyAuthorized: false,
      message: 'Your request has been submitted to the SAC Admin for review.',
      data: request
    };
  }

  public async getWhitelistStatus(email: unknown): Promise<{
    status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'NOT_FOUND';
    approvedRole?: string | null;
    reason?: string | null;
    createdAt?: string;
    email: string;
  }> {
    if (!email || typeof email !== 'string') {
      throw new ValidationException('Email query parameter is required.');
    }

    const cleanEmail = email.toLowerCase().trim();

    const staff = await this.userRepo.findWhitelistedStaff(cleanEmail);
    if (staff) {
      return {
        status: 'APPROVED',
        approvedRole: staff.role,
        email: cleanEmail
      };
    }

    const request = await this.userRepo.findWhitelistRequestByEmail(cleanEmail);
    if (request) {
      return {
        status: request.status,
        approvedRole: request.approved_role,
        reason: request.reason,
        createdAt: request.created_at,
        email: cleanEmail
      };
    }

    return {
      status: 'NOT_FOUND',
      email: cleanEmail
    };
  }

  public async getUserProfile(userId: string): Promise<UserProfileDTO> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new EntityNotFoundException('User', userId);
    }
    const initialAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
    return user.toProfileDTO(initialAdminEmail);
  }
}

