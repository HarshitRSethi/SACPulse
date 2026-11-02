import type { NextFunction, Response } from 'express';
import { DomainException } from '../domain/exceptions/DomainException.js';

/**
 * BaseController
 *
 * Abstract HTTP presentation adapter base class providing uniform JSON envelope formatting
 * and polymorphic `DomainException` delegation.
 */
export abstract class BaseController {
  protected ok<T>(res: Response, dto?: T): Response {
    if (dto !== undefined) {
      return res.status(200).json({ success: true, data: dto });
    }
    return res.sendStatus(200);
  }

  protected created<T>(res: Response, dto?: T): Response {
    if (dto !== undefined) {
      return res.status(201).json({ success: true, data: dto });
    }
    return res.sendStatus(201);
  }

  protected handleError(err: unknown, res: Response, next?: NextFunction): Response | void {
    if (next) {
      next(err);
      return;
    }
    if (err instanceof DomainException) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message,
        code: err.code,
        ...(err.details ?? {})
      });
    }
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
}
