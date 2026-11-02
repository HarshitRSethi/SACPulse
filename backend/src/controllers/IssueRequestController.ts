import type { NextFunction, Request, Response } from 'express';
import { CheckoutService } from '../application/services/CheckoutService.js';
import { BaseController } from './BaseController.js';

export class IssueRequestController extends BaseController {
  private readonly checkoutService: CheckoutService;

  constructor(checkoutService: CheckoutService) {
    super();
    this.checkoutService = checkoutService;
  }

  /**
   * POST /api/issue-requests
   */
  public createIssueRequest = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const studentId = req.body?.studentId || req.authUser?.userId || '';
      const result = await this.checkoutService.createIssueRequest({
        studentId,
        callerUserId: req.authUser?.userId,
        callerRole: req.authUser?.role,
        rawItems: req.body?.items
      });
      return this.created(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * GET /api/guard/requests/pending
   * GET /api/issue-requests/my-pending
   */
  public getPendingRequests = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const caller = req.authUser
        ? { userId: req.authUser.userId, role: req.authUser.role }
        : undefined;
      const result = await this.checkoutService.getPendingRequests(caller);
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * GET /api/register/student/:studentId
   */
  public getStudentActiveHoldings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const studentId = String(req.params.studentId || '');
      const caller = req.authUser
        ? { userId: req.authUser.userId, role: req.authUser.role }
        : undefined;
      const holdings = await this.checkoutService.getStudentActiveHoldings(studentId, caller);
      return this.ok(res, holdings);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };
}
