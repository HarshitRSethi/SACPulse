import type { NextFunction, Request, Response } from 'express';
import { PeerTransferService } from '../application/services/PeerTransferService.js';
import { BaseController } from './BaseController.js';

export class TransferController extends BaseController {
  private readonly transferService: PeerTransferService;

  constructor(transferService: PeerTransferService) {
    super();
    this.transferService = transferService;
  }

  /**
   * POST /api/transfers/:entryId/initiate
   */
  public initiateTransfer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const entryId = String(req.params.entryId || '');
      const studentId = req.body?.studentId || req.authUser?.userId || '';
      const result = await this.transferService.initiateTransfer({
        entryId,
        studentId,
        recipientId: req.body?.recipientId,
        recipientRollNo: req.body?.recipientRollNo,
        callerUserId: req.authUser?.userId,
        callerRole: req.authUser?.role
      });
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * POST /api/transfers/:entryId/cancel
   */
  public cancelTransfer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const entryId = String(req.params.entryId || '');
      const studentId = req.body?.studentId || req.authUser?.userId || '';
      const result = await this.transferService.cancelTransfer({
        entryId,
        studentId,
        callerUserId: req.authUser?.userId,
        callerRole: req.authUser?.role
      });
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * POST /api/transfers/:entryId/respond
   */
  public respondTransfer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const entryId = String(req.params.entryId || '');
      const studentId = req.body?.studentId || req.authUser?.userId || '';
      const result = await this.transferService.respondTransfer({
        entryId,
        studentId,
        action: req.body?.action,
        callerUserId: req.authUser?.userId,
        callerRole: req.authUser?.role
      });
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * GET /api/transfers/incoming/:studentId
   */
  public getIncomingTransfers = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const studentId = String(req.params.studentId || '');
      const caller = req.authUser
        ? { userId: req.authUser.userId, role: req.authUser.role }
        : undefined;
      const incoming = await this.transferService.getIncomingTransfers(studentId, caller);
      return this.ok(res, incoming);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };
}
