import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { RegisterLogRepository } from '../infrastructure.persistence/repositories/RegisterLogRepository.js';
import { UserRepository } from '../infrastructure.persistence/repositories/UserRepository.js';
import { SACItemRepository } from '../infrastructure.persistence/repositories/SACItemRepository.js';
import { DatabaseConnection } from '../infrastructure.persistence/DatabaseConnection.js';
import { RealtimeEventHub } from '../domain.services/RealtimeEventHub.js';
import { SportsEquipment, RoomKey } from '../domain.entities/SACItem.js';
import { Student } from '../domain.entities/User.js';
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
}
