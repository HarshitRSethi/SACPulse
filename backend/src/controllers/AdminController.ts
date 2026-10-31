import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { RegisterLogRepository } from '../infrastructure.persistence/repositories/RegisterLogRepository.js';
import { UserRepository } from '../infrastructure.persistence/repositories/UserRepository.js';
import { SACItemRepository } from '../infrastructure.persistence/repositories/SACItemRepository.js';
import { DatabaseConnection } from '../infrastructure.persistence/DatabaseConnection.js';
import { RealtimeEventHub } from '../domain.services/RealtimeEventHub.js';
import { SportsEquipment, RoomKey } from '../domain.entities/SACItem.js';
import { Student } from '../domain.entities/User.js';
import { verifySessionToken } from './AuthController.js';
import crypto from 'crypto';

export class AdminController extends BaseController {
  private regRepo: RegisterLogRepository;
  private userRepo: UserRepository;
  private itemRepo: SACItemRepository;
  private hub: RealtimeEventHub;

  constructor() {
    super();
    this.regRepo = new RegisterLogRepository();
    this.userRepo = new UserRepository();
    this.itemRepo = new SACItemRepository();
    this.hub = RealtimeEventHub.getInstance();
  }

  /**
   * GET /api/admin/register-logs
   * Section 5: Master register logs table with CSV export option and 25-row pagination.
   */
  public getRegisterLogs = async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { format, startDate, endDate, status, page, limit } = req.query;

      const isCsv = format === 'csv';
      const pageNum = page ? Math.max(1, parseInt(page as string, 10) || 1) : 1;
      const limitNum = limit ? Math.max(1, parseInt(limit as string, 10) || 25) : 25;

      const result = await this.regRepo.getMasterLogs({
        startDate: startDate as string,
        endDate: endDate as string,
        status: status as string,
        page: pageNum,
        limit: limitNum,
        unpaginated: isCsv
      });

      if (isCsv) {
        const csvContent = this.regRepo.generateCSV(result.logs);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="sacpulse_register_logs.csv"');
        res.status(200).send(csvContent);
        return;
      }

      return res.status(200).json({
        success: true,
        data: result.logs,
        totalCount: result.totalCount,
        todayCount: result.todayCount,
        totalPages: result.totalPages,
        currentPage: result.currentPage
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * POST /api/admin/users/:id/clear-defaulter
   * Blueprint Rule 7 & Section 5:
   * Clears defaulter lock on student, restoring borrowing eligibility.
   */
  public clearDefaulter = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const user = await this.userRepo.findById(id);

      if (!user) {
        return this.notFound(res, `User ${id} not found.`);
      }

      await this.userRepo.setDefaulter(id, false);

      return this.ok(res, {
        message: `Defaulter status cleared for student ${user.getName()}.`,
        userId: id,
        isDefaulter: false
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * POST /api/admin/users/:id/reset-cooldown
   * Section 5: Resets 5-hour timeout cooldown on student.
   */
  public resetCooldown = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const user = await this.userRepo.findById(id);

      if (!user) {
        return this.notFound(res, `User ${id} not found.`);
      }

      await this.userRepo.setPenaltyUntil(id, null);

      return this.ok(res, {
        message: `Cooldown penalty reset for student ${user.getName()}.`,
        userId: id,
        penaltyUntil: null
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * POST /api/admin/inventory
   * Upserts or adds SAC items to inventory.
   */
  public upsertInventoryItem = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id, name, category, itemType, totalQty, availableQty } = req.body;

      if (!name || !category || !itemType) {
        return this.clientError(res, 'name, category, and itemType (EQUIPMENT | ROOM_KEY) are required.');
      }

      const itemId = (id as string) || crypto.randomUUID();
      const entity = itemType === 'ROOM_KEY'
        ? new RoomKey(itemId, name, category, 1, availableQty ?? 1, null)
        : new SportsEquipment(itemId, name, category, totalQty, availableQty ?? totalQty, 0);

      if (id) {
        await this.itemRepo.save(entity);
      } else {
        await this.itemRepo.create(entity);
      }

      this.hub.emit('INVENTORY_UPDATED', {
        action: 'UPSERTED',
        itemId,
        timestamp: new Date().toISOString()
      });

      return this.ok(res, {
        message: 'SAC Item upserted successfully.',
        item: {
          id: entity.getId(),
          name: entity.getName(),
          category: entity.getCategory(),
          itemType: entity.getItemType(),
          totalQty: entity.getTotalQty(),
          availableQty: entity.getAvailableQty()
        }
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * DELETE /api/admin/inventory/:id
   * Safety Check: Query register_logs to ensure no unit of this item is currently in status 'ISSUED' or 'ISSUED_TRANSFER_PENDING'.
   * If active holdings exist, reject with 400 Bad Request ("Cannot delete item while units are currently checked out").
   * Deletes or archives the item from sac_items in Supabase and broadcasts inventory:updated.
   */
  public deleteInventoryItem = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      if (!id) {
        return this.clientError(res, 'Item ID is required.');
      }

      const item = await this.itemRepo.findById(id);
      if (!item) {
        return this.notFound(res, `Item ${id} not found.`);
      }

      // 1. Safety Check: Query register_logs to ensure no unit is currently checked out
      const supabase = DatabaseConnection.getInstance().getSupabase();
      if (!supabase) {
        throw new Error('Supabase client is not initialized.');
      }

      const { data: activeUnits, error: checkError } = await supabase
        .from('register_logs')
        .select('id, status')
        .eq('item_id', id)
        .in('status', ['ISSUED', 'ISSUED_TRANSFER_PENDING']);

      if (checkError) {
        throw new Error(`Failed to check active holdings: ${checkError.message}`);
      }

      if (activeUnits && activeUnits.length > 0) {
        return this.clientError(res, 'Cannot delete item while units are currently checked out');
      }

      // 2. Delete or archive from sac_items
      await this.itemRepo.delete(id);

      // 3. Broadcast real-time inventory update
      this.hub.emit('INVENTORY_UPDATED', {
        action: 'DELETED',
        itemId: id,
        itemName: item.getName(),
        timestamp: new Date().toISOString()
      });

      return this.ok(res, {
        message: `Item "${item.getName()}" deleted successfully.`,
        deletedItemId: id
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * GET /api/admin/users
   */
  public listUsers = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const users = await this.userRepo.findAll();
      return this.ok(res, users.map((u) => {
        const isStudent = u instanceof Student;
        return {
          id: u.getId(),
          name: u.getName(),
          email: u.getEmail(),
          role: u.getRole(),
          rollNo: isStudent ? (u as Student).getRollNo() : null,
          mobileNo: isStudent ? (u as Student).getMobileNo() : null,
          isDefaulter: isStudent ? (u as Student).getIsDefaulter() : false,
          penaltyUntil: isStudent && (u as Student).getPenaltyUntil()
            ? (u as Student).getPenaltyUntil()!.toISOString()
            : null
        };
      }));
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * Helper to extract authenticated caller info from Authorization header or custom header.
   */
  private getCaller(req: Request): { email: string; role: string } | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = verifySessionToken(token);
      if (payload) {
        return { email: payload.email.toLowerCase().trim(), role: payload.role };
      }
    }
    const headerEmail = (req.headers['x-admin-email'] as string) || (req.headers['x-user-email'] as string);
    if (headerEmail) {
      return { email: headerEmail.toLowerCase().trim(), role: 'ADMIN' };
    }
    return null;
  }

  /**
   * Helper to check if an email matches the primary institutional administrator.
   */
  private isRootAdmin(email?: string | null): boolean {
    if (!email) return false;
    const initialAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
    return Boolean(initialAdminEmail && email.toLowerCase().trim() === initialAdminEmail);
  }

  /**
   * GET /api/admin/whitelist
   * Returns { pendingRequests: [...], activeUsers: [...], initialAdminEmail: string }
   */
  public getWhitelist = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const initialAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
      const [pendingRequests, activeUsers] = await Promise.all([
        this.userRepo.listPendingWhitelistRequests(),
        this.userRepo.listWhitelistedStaff()
      ]);
      return this.ok(res, {
        pendingRequests,
        activeUsers,
        initialAdminEmail
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * POST /api/admin/whitelist/approve
   * Receives { requestId, role ('STUDENT' | 'GUARD' | 'ADMIN') }
   */
  public approveWhitelist = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { requestId, role } = req.body;
      if (!requestId) {
        return this.clientError(res, 'requestId is required');
      }

      const validRoles = ['STUDENT', 'GUARD', 'ADMIN'];
      if (!role || !validRoles.includes(role.toUpperCase())) {
        return this.clientError(res, 'role must be STUDENT, GUARD, or ADMIN');
      }

      const approvedRole = role.toUpperCase();

      // Rule 3: Only Root Admin can approve as ADMIN
      if (approvedRole === 'ADMIN') {
        const caller = this.getCaller(req);
        if (!caller || !this.isRootAdmin(caller.email)) {
          return this.forbidden(res, 'Only the primary institutional administrator can grant ADMIN role');
        }
      }

      const request = await this.userRepo.findWhitelistRequestById(requestId);
      if (!request) {
        return this.notFound(res, 'Whitelist request not found');
      }

      // Mark request APPROVED
      const updatedReq = await this.userRepo.updateWhitelistRequestStatus(requestId, 'APPROVED', approvedRole);

      // Insert/upsert into whitelisted_staff with approved role
      await this.userRepo.addWhitelistedStaff({
        email: request.email,
        name: request.name,
        mobileNo: request.mobile_no,
        role: approvedRole
      });

      // Upsert into users table
      const user = await this.userRepo.upsertUser({
        email: request.email,
        name: request.name,
        role: approvedRole,
        mobileNo: request.mobile_no,
        rollNo: approvedRole === 'STUDENT' ? (request.email.split('@')[0].toUpperCase()) : null
      });

      return this.ok(res, {
        message: `Request approved as ${approvedRole} and access granted`,
        request: updatedReq,
        user: {
          id: user.getId(),
          email: user.getEmail(),
          name: user.getName(),
          role: user.getRole(),
          mobileNo: user.getMobileNo()
        }
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * POST /api/admin/whitelist/reject
   * Receives { requestId }
   */
  public rejectWhitelist = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { requestId } = req.body;
      if (!requestId) {
        return this.clientError(res, 'requestId is required');
      }

      const request = await this.userRepo.findWhitelistRequestById(requestId);
      if (!request) {
        return this.notFound(res, 'Whitelist request not found');
      }

      const updatedReq = await this.userRepo.updateWhitelistRequestStatus(requestId, 'REJECTED');
      return this.ok(res, {
        message: 'Whitelist request rejected',
        request: updatedReq
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * POST /api/admin/whitelist/direct-add
   * Receives { email, name, mobileNo, role }
   */
  public directAddWhitelist = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { email, name, mobileNo, role } = req.body;

      if (!email || typeof email !== 'string') {
        return this.clientError(res, 'Email is required');
      }
      if (!name || typeof name !== 'string') {
        return this.clientError(res, 'Name is required');
      }

      const validRoles = ['STUDENT', 'GUARD', 'ADMIN'];
      if (!role || !validRoles.includes(role.toUpperCase())) {
        return this.clientError(res, 'Role must be STUDENT, GUARD, or ADMIN');
      }

      const assignedRole = role.toUpperCase();

      // Rule 3: Only Root Admin can direct-add as ADMIN
      if (assignedRole === 'ADMIN') {
        const caller = this.getCaller(req);
        if (!caller || !this.isRootAdmin(caller.email)) {
          return this.forbidden(res, 'Only the primary institutional administrator can grant ADMIN role');
        }
      }

      const cleanEmail = email.toLowerCase().trim();
      const cleanMobile = mobileNo ? String(mobileNo).trim() : null;

      // Add to whitelisted_staff
      const staff = await this.userRepo.addWhitelistedStaff({
        email: cleanEmail,
        name: name.trim(),
        mobileNo: cleanMobile,
        role: assignedRole
      });

      // Upsert into users table
      await this.userRepo.upsertUser({
        email: cleanEmail,
        name: name.trim(),
        role: assignedRole,
        mobileNo: cleanMobile,
        rollNo: assignedRole === 'STUDENT' ? cleanEmail.split('@')[0].toUpperCase() : null
      });

      return this.ok(res, staff);
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * DELETE /api/admin/whitelist/:id
   * Removes user from whitelisted_staff, immediately revoking access.
   * Enforces:
   * 1. Root admin immunity (cannot be revoked by anyone)
   * 2. Self-revocation prevention (cannot revoke own account)
   * 3. Role hierarchy (only Root admin can revoke an ADMIN account)
   */
  public revokeWhitelist = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      if (!id) {
        return this.clientError(res, 'Whitelist record ID is required');
      }

      const target = await this.userRepo.findWhitelistedStaffById(id);
      if (!target) {
        return this.notFound(res, 'Whitelisted staff record not found');
      }

      const initialAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
      const targetEmail = target.email.toLowerCase().trim();

      // Rule 1: Root Admin immunity
      if (initialAdminEmail && targetEmail === initialAdminEmail) {
        return this.forbidden(res, 'The primary institutional administrator cannot be modified or revoked');
      }

      const caller = this.getCaller(req);

      // Rule 2: Prevent self-revocation
      if (caller && caller.email.toLowerCase().trim() === targetEmail) {
        return this.clientError(res, 'You cannot revoke your own account access');
      }

      // Rule 3: Only Root Admin can revoke an ADMIN account
      const isTargetAdmin = target.role?.toUpperCase() === 'ADMIN';
      if (isTargetAdmin) {
        if (!caller || !this.isRootAdmin(caller.email)) {
          return this.forbidden(res, 'Only the primary institutional administrator can revoke an ADMIN account');
        }
      }

      await this.userRepo.removeWhitelistedStaff(id);
      return this.ok(res, {
        message: 'Access revoked successfully and user removed from whitelist'
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };
}
