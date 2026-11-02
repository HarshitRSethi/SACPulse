import type { NextFunction, Request, Response } from 'express';
import { DomainException } from '../../domain/exceptions/DomainException.js';

/**
 * Centralized Express Error Translation Middleware
 *
 * Polymorphically translates any `DomainException` subclass into its canonical
 * HTTP status code, semantic `code`, and optional `details` payload without string matching.
 */
export function domainErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof DomainException) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      ...(err.details ?? {})
    });
    return;
  }

  const fallbackError = err instanceof Error ? err : new Error(String(err));
  const status = (err as any)?.status || 500;
  if (status >= 500 && process.env.NODE_ENV !== 'test') {
    console.error('Unhandled Application Error:', fallbackError);
  }
  res.status(status).json({
    success: false,
    error: fallbackError.message || 'Internal Server Error'
  });
}

