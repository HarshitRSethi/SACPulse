import type { NextFunction, Request, Response } from 'express';
import { GuardCounterService } from '../application/services/GuardCounterService.js';
import { BaseController } from './BaseController.js';

export class GuardCounterController extends BaseController {
  private readonly guardService: GuardCounterService;

  constructor(guardService: GuardCounterService) {
    super();
    this.guardService = guardService;
  }

  /**
   * POST /api/guard/requests/:id/approve
   */
  public approveRequest = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const requestId = String(req.params.id || '');
      const guardId = req.body?.guardId || req.authUser?.userId || '';
      const result = await this.guardService.approveRequest(requestId, guardId);
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * POST /api/guard/returns/:entryId/intact
   */
  public returnUnitIntact = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const entryId = String(req.params.entryId || '');
      const result = await this.guardService.returnUnitIntact(entryId);
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * POST /api/guard/returns/batch/:batchId/intact
   */
  public returnBatchIntact = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const batchId = String(req.params.batchId || '');
      const result = await this.guardService.returnBatchIntact(batchId);
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * POST /api/guard/returns/:entryId/damaged
   */
  public returnUnitDamaged = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const entryId = String(req.params.entryId || '');
      const result = await this.guardService.returnUnitDamaged(entryId);
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * GET /api/guard/register/active
   */
  public getActiveRegister = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const batches = await this.guardService.getActiveRegister();
      return this.ok(res, batches);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * POST /api/guard/rooms/:id/faculty-occupy
   */
  public facultyOccupyRoom = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const roomId = String(req.params.id || '');
      const result = await this.guardService.facultyOccupyRoom(roomId);
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * POST /api/guard/rooms/:id/release
   */
  public releaseRoom = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const roomId = String(req.params.id || '');
      const result = await this.guardService.releaseRoom(roomId);
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };
}
