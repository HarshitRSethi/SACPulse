import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { RegisterLogRepository } from '../infrastructure.persistence/repositories/RegisterLogRepository.js';
import { UserRepository } from '../infrastructure.persistence/repositories/UserRepository.js';
import { SACItemRepository } from '../infrastructure.persistence/repositories/SACItemRepository.js';
import { SportsEquipment, RoomKey } from '../domain.entities/SACItem.js';
import { Student } from '../domain.entities/User.js';
import crypto from 'crypto';

export class AdminController extends BaseController {
  private regRepo: RegisterLogRepository;
  private userRepo: UserRepository;
  private itemRepo: SACItemRepository;

  constructor() {
    super();
    this.regRepo = new RegisterLogRepository();
    this.userRepo = new UserRepository();
    this.itemRepo = new SACItemRepository();
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
