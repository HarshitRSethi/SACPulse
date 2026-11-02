import type { NextFunction, Request, Response } from 'express';
import {
  AdminGovernanceService,
  type AuthenticatedAdminCaller
} from '../application/services/AdminGovernanceService.js';
import { AuthenticationException } from '../domain/exceptions/DomainException.js';
import { BaseController } from './BaseController.js';

export class AdminController extends BaseController {
  private readonly adminService: AdminGovernanceService;

  constructor(adminService: AdminGovernanceService) {
    super();
    this.adminService = adminService;
  }

  private extractAdminCaller(req: Request): AuthenticatedAdminCaller {
    if (!req.authUser) {
      throw new AuthenticationException('Unauthorized: Admin session token is required.');
    }
    return {
      userId: req.authUser.userId,
      email: req.authUser.email,
      role: req.authUser.role
    };
  }

  /**
   * GET /api/admin/register-logs
   */
  public getRegisterLogs = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const { format, startDate, endDate, status, page, limit } = req.query;
      const isCsv = format === 'csv';
      const pageNum = page ? Math.max(1, parseInt(page as string, 10) || 1) : 1;
      const limitNum = limit ? Math.max(1, parseInt(limit as string, 10) || 25) : 25;

      const queryOptions = {
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        status: status as string | undefined,
        page: pageNum,
        limit: limitNum
      };

      if (isCsv) {
        const csvContent = await this.adminService.exportRegisterLogsCsv(queryOptions);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="sacpulse_register_logs.csv"'
        );
        res.status(200).send(csvContent);
        return;
      }

      const result = await this.adminService.getRegisterLogs(queryOptions);
      return res.status(200).json({
        success: true,
        data: result.logs,
        totalCount: result.totalCount,
        todayCount: result.todayCount,
        totalPages: result.totalPages,
        currentPage: result.currentPage
      });
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * POST /api/admin/users/:id/clear-defaulter
   */
  public clearDefaulter = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const caller = this.extractAdminCaller(req);
      const result = await this.adminService.clearDefaulter(String(req.params.id || ''), caller);
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * POST /api/admin/users/:id/reset-cooldown
   */
  public resetCooldown = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const caller = this.extractAdminCaller(req);
      const result = await this.adminService.resetCooldown(String(req.params.id || ''), caller);
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * POST /api/admin/inventory
   */
  public upsertInventoryItem = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const result = await this.adminService.upsertInventoryItem({
        id: req.body?.id,
        name: req.body?.name,
        category: req.body?.category,
        itemType: req.body?.itemType,
        totalQty: req.body?.totalQty,
        availableQty: req.body?.availableQty,
        damagedQty: req.body?.damagedQty
      });
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * DELETE /api/admin/inventory/:id
   */
  public deleteInventoryItem = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const result = await this.adminService.deleteInventoryItem(String(req.params.id || ''));
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * GET /api/admin/users
   */
  public listUsers = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const users = await this.adminService.listUsers();
      return this.ok(res, users);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * GET /api/admin/whitelist
   */
  public getWhitelist = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const overview = await this.adminService.getWhitelistOverview();
      return this.ok(res, overview);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * POST /api/admin/whitelist/approve
   */
  public approveWhitelist = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const caller = this.extractAdminCaller(req);
      const result = await this.adminService.approveWhitelistRequest({
        requestId: req.body?.requestId,
        role: req.body?.role,
        caller
      });
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * POST /api/admin/whitelist/reject
   */
  public rejectWhitelist = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const result = await this.adminService.rejectWhitelistRequest(req.body?.requestId);
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * POST /api/admin/whitelist/direct-add
   */
  public directAddWhitelist = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const caller = this.extractAdminCaller(req);
      const result = await this.adminService.directAddWhitelist({
        email: req.body?.email,
        name: req.body?.name,
        mobileNo: req.body?.mobileNo,
        role: req.body?.role,
        caller
      });
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };

  /**
   * DELETE /api/admin/whitelist/:id
   */
  public revokeWhitelist = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
    try {
      const caller = this.extractAdminCaller(req);
      const result = await this.adminService.revokeWhitelist(String(req.params.id || ''), caller);
      return this.ok(res, result);
    } catch (err) {
      return this.handleError(err, res, next);
    }
  };
}
