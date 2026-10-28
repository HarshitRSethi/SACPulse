import type { Request, Response } from 'express';

/**
 * BaseController
 * Provides standard HTTP response formatting and error handling across controllers.
 */
export abstract class BaseController {
  protected ok<T>(res: Response, dto?: T): Response {
    if (dto) {
      return res.status(200).json({ success: true, data: dto });
    }
    return res.sendStatus(200);
  }

  protected created<T>(res: Response, dto?: T): Response {
    if (dto) {
      return res.status(201).json({ success: true, data: dto });
    }
    return res.sendStatus(201);
  }

  protected clientError(res: Response, message: string = 'Bad request'): Response {
    return res.status(400).json({ success: false, error: message });
  }

  protected unauthorized(res: Response, message: string = 'Unauthorized'): Response {
    return res.status(401).json({ success: false, error: message });
  }

  protected forbidden(res: Response, message: string = 'Forbidden'): Response {
    return res.status(403).json({ success: false, error: message });
  }

  protected notFound(res: Response, message: string = 'Not found'): Response {
    return res.status(404).json({ success: false, error: message });
  }

  protected conflict(res: Response, message: string = 'Conflict'): Response {
    return res.status(409).json({ success: false, error: message });
  }

  protected fail(res: Response, error: Error | string): Response {
    const message = error instanceof Error ? error.message : error;
    return res.status(500).json({ success: false, error: message });
  }
}
