import type { NextFunction, Request, Response } from 'express';
import {
  JwtTokenService,
  type JwtSessionPayload
} from '../../application/services/JwtTokenService.js';
import type { UserRole } from '../../domain/entities/User.js';
import {
  AuthenticationException,
  UnauthorizedRoleException
} from '../../domain/exceptions/DomainException.js';

declare global {
  namespace Express {
    interface Request {
      authUser?: JwtSessionPayload;
    }
  }
}

export function createAuthenticateJWT(jwtService: JwtTokenService = new JwtTokenService()) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthenticationException(
          'Unauthorized: Missing or invalid Authorization Bearer token.'
        );
      }

      const token = authHeader.slice(7).trim();
      req.authUser = jwtService.verify(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.authUser) {
        throw new AuthenticationException('Unauthorized: Authentication required.');
      }
      if (!allowedRoles.includes(req.authUser.role)) {
        throw new UnauthorizedRoleException(
          `Forbidden: Role '${req.authUser.role}' is not authorized. Required: ${allowedRoles.join(' | ')}.`
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

