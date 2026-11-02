import type { NextFunction, Request, Response } from 'express';
import { AuthService } from '../application/services/AuthService.js';
import {
  generateSessionToken,
  verifySessionToken,
  type JwtSessionPayload
} from '../application/services/JwtTokenService.js';
import { AuthenticationException } from '../domain/exceptions/DomainException.js';
import { BaseController } from './BaseController.js';

export type SessionTokenPayload = JwtSessionPayload;
export { generateSessionToken, verifySessionToken };

export class AuthController extends BaseController {
  private readonly authService: AuthService;

  constructor(authService: AuthService) {
    super();
    this.authService = authService;
  }

  /**
   * POST /api/auth/google
   * Strictly verifies Google OAuth ID token `{ credential }` and returns a signed HS256 JWT.
   */
  public googleAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const result = await this.authService.authenticateWithGoogle(req.body?.credential);
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * POST /api/auth/demo-session
   * Explicit non-production / viva demo role-switcher endpoint gated by `ENABLE_DEMO_AUTH`.
   */
  public demoSession = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const result = await this.authService.authenticateDemoSession(
        req.body?.email,
        req.body?.name
      );
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * PATCH /api/auth/mobile-setup
   */
  public mobileSetup = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      if (!req.authUser?.userId) {
        throw new AuthenticationException('Unauthorized: Missing or invalid authorization token');
      }
      const mobileInput = req.body?.mobileNo ?? req.body?.mobile_no;
      const result = await this.authService.completeMobileOnboarding(
        req.authUser.userId,
        mobileInput
      );
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * POST /api/auth/request-whitelist
   */
  public requestWhitelist = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const result = await this.authService.submitWhitelistRequest({
        email: req.body?.email,
        name: req.body?.name,
        mobileNo: req.body?.mobileNo,
        reason: req.body?.reason
      });
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.data
      });
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * GET /api/auth/whitelist-status?email=...
   */
  public getWhitelistStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const result = await this.authService.getWhitelistStatus(req.query.email);
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * GET /api/users/:id
   */
  public getUserProfile = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const userId = String(req.params.id || '');
      const profile = await this.authService.getUserProfile(userId);
      return this.ok(res, profile);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };
}
