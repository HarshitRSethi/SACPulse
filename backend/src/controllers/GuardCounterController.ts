import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { RegisterLogRepository } from '../infrastructure.persistence/repositories/RegisterLogRepository.js';
import { IssueRequestRepository } from '../infrastructure.persistence/repositories/IssueRequestRepository.js';
import { SACItemRepository } from '../infrastructure.persistence/repositories/SACItemRepository.js';
import { IssueRequestTTLScheduler } from '../domain.services/IssueRequestTTLScheduler.js';
import { RealtimeEventHub } from '../domain.services/RealtimeEventHub.js';

export class GuardCounterController extends BaseController {
  private regRepo: RegisterLogRepository;
  private reqRepo: IssueRequestRepository;
  private itemRepo: SACItemRepository;
  private scheduler: IssueRequestTTLScheduler;
  private hub: RealtimeEventHub;

  constructor() {
    super();
    this.regRepo = new RegisterLogRepository();
    this.reqRepo = new IssueRequestRepository();
    this.itemRepo = new SACItemRepository();
    this.scheduler = IssueRequestTTLScheduler.getInstance();
    this.hub = RealtimeEventHub.getInstance();
  }

  /**
   * POST /api/guard/requests/:id/approve
   * Blueprint Rule 6 & Section 5:
   * Approves bundle request, decrements stock, inserts 1 row per physical unit sharing a batch_id.
   */
  public approveRequest = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = req.params.id as string;
      const { guardId } = req.body;

      if (!guardId) {
        return this.clientError(res, 'guardId is required.');
      }

      // 1. Run ACID Stored Procedure with row-locking
      const result = await this.regRepo.approveIssueRequestTx(id, guardId);

      // 2. Cancel 120s server timeout
      this.scheduler.cancelTimeout(id);

      // 3. Broadcast real-time events
      this.hub.emit('GUARD_QUEUE_UPDATED', {
        requestId: id,
        status: 'APPROVED',
        approvedById: guardId,
        timestamp: new Date().toISOString()
      });

      this.hub.notifyStudent(result.student_id, 'REQUEST_APPROVED', {
        requestId: id,
        batchId: result.batch_id,
        unitsIssued: result.units_issued,
        message: 'Your items have been issued at the SAC Counter!'
      });

      // Broadcast inventory updates
      const updatedInventory = await this.itemRepo.findAll();
      for (const item of updatedInventory) {
        this.hub.broadcastInventoryUpdate(item);
      }

      return this.ok(res, {
        message: 'Request approved successfully and units registered.',
        batchId: result.batch_id,
        unitsIssued: result.units_issued,
        studentId: result.student_id
      });
    } catch (err: any) {
      if (err.message?.includes('expired') || err.message?.includes('status')) {
        return this.conflict(res, err.message);
      }
      if (err.message?.includes('Insufficient stock')) {
        return this.conflict(res, err.message);
      }
      return this.fail(res, err);
    }
  };

  /**
   * POST /api/guard/returns/:entryId/intact
   * Blueprint Rule 7 & 9:
   * Sets status='RETURNED', departure_time=NOW(), wipes pending_transfer_to_id=NULL,
   * restores available stock (or resets room key).
   */
  public returnUnitIntact = async (req: Request, res: Response): Promise<Response> => {
    try {
      const entryId = req.params.entryId as string;

      const result = await this.regRepo.closeGuardReturnTx(entryId, false);

      this.hub.emit('TRANSFER_STATE_CHANGED', {
        entryId,
        status: 'RETURNED',
        pendingTransferToId: null,
        timestamp: new Date().toISOString()
      });

      const updatedItem = await this.itemRepo.findById(result.item_id);
      if (updatedItem) {
        this.hub.broadcastInventoryUpdate(updatedItem);
      }

      return this.ok(res, {
        message: 'Unit returned intact successfully.',
        entryId,
        status: 'RETURNED'
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * POST /api/guard/returns/batch/:batchId/intact
   * Blueprint Rule 6 & 7: Guard clicks "Return All (Intact)" for an entire batch.
   */
  public returnBatchIntact = async (req: Request, res: Response): Promise<Response> => {
    try {
      const batchId = req.params.batchId as string;

      const result = await this.regRepo.closeGuardBatchReturnTx(batchId);

      this.hub.emit('TRANSFER_STATE_CHANGED', {
        batchId,
        status: 'RETURNED',
        timestamp: new Date().toISOString()
      });

      const inventory = await this.itemRepo.findAll();
      for (const item of inventory) {
        this.hub.broadcastInventoryUpdate(item);
      }

      return this.ok(res, {
        message: 'Entire batch returned intact successfully.',
        batchId: result.batch_id,
        returnedCount: result.returned_count
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * POST /api/guard/returns/:entryId/damaged
   * Blueprint Rule 7 & 9:
   * Sets status='DAMAGED', departure_time=NOW(), wipes pending_transfer_to_id=NULL,
   * increments damaged_qty (available_qty unchanged), and sets is_defaulter=TRUE on student.
   */
  public returnUnitDamaged = async (req: Request, res: Response): Promise<Response> => {
    try {
      const entryId = req.params.entryId as string;

      const result = await this.regRepo.closeGuardReturnTx(entryId, true);

      this.hub.emit('TRANSFER_STATE_CHANGED', {
        entryId,
        status: 'DAMAGED',
        pendingTransferToId: null,
        timestamp: new Date().toISOString()
      });

      this.hub.notifyStudent(result.student_id, 'DEFAULTER_LOCKED', {
        message: 'You have been marked as a DEFAULTER due to returning damaged SAC property. Admin approval is required to unblock.',
        entryId
      });

      const updatedItem = await this.itemRepo.findById(result.item_id);
      if (updatedItem) {
        this.hub.broadcastInventoryUpdate(updatedItem);
      }

      return this.ok(res, {
        message: 'Unit marked as DAMAGED. Student holder is now locked as a DEFAULTER.',
        entryId,
        status: 'DAMAGED',
        studentId: result.student_id
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * GET /api/guard/register/active
   * Blueprint Rule 6 & 10:
   * Guard UI displays active register grouped by batch_id with clickable tel: mobile numbers.
   */
  public getActiveRegister = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const activeEntries = await this.regRepo.findActive();

      // Group by batch_id
      const batchesMap = new Map<string, any>();

      for (const entry of activeEntries) {
        const batchId = entry.getBatchId();
        if (!batchesMap.has(batchId)) {
          batchesMap.set(batchId, {
            batchId,
            studentId: entry.getStudentId(),
            studentName: entry.getStudentName(),
            rollNo: entry.getRollNo(),
            mobileNo: entry.getMobileNo(),
            arrivalTime: entry.getArrivalTime().toISOString(),
            units: []
          });
        }
        batchesMap.get(batchId).units.push({
          id: entry.getId(),
          itemId: entry.getItemId(),
          itemName: entry.getItemName(),
          category: entry.getCategory(),
          status: entry.getStatus(),
          pendingTransferToId: entry.getPendingTransferToId()
        });
      }

      return this.ok(res, Array.from(batchesMap.values()));
    } catch (err: any) {
      return this.fail(res, err);
    }
  };
}
