import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { RegisterLogRepository } from '../infrastructure.persistence/repositories/RegisterLogRepository.js';
import { UserRepository } from '../infrastructure.persistence/repositories/UserRepository.js';
import { PenaltyAndEligibilityPolicy } from '../domain.services/PenaltyAndEligibilityPolicy.js';
import { RealtimeEventHub } from '../domain.services/RealtimeEventHub.js';
import { Student } from '../domain.entities/User.js';

export class TransferController extends BaseController {
  private regRepo: RegisterLogRepository;
  private userRepo: UserRepository;
  private policy: PenaltyAndEligibilityPolicy;
  private hub: RealtimeEventHub;

  constructor() {
    super();
    this.regRepo = new RegisterLogRepository();
    this.userRepo = new UserRepository();
    this.policy = new PenaltyAndEligibilityPolicy();
    this.hub = RealtimeEventHub.getInstance();
  }

  /**
   * POST /api/transfers/:entryId/initiate
   * Blueprint Rule 8:
   * Holder A initiates transfer to Student B. Verifies B is eligible.
   * Sets status='ISSUED_TRANSFER_PENDING', pending_transfer_to_id=B.id.
   */
  public initiateTransfer = async (req: Request, res: Response): Promise<Response> => {
    try {
      const entryId = req.params.entryId as string;
      const { studentId, recipientRollNo, recipientId } = req.body;

      if (!studentId) {
        return this.clientError(res, 'studentId of the current holder is required.');
      }
      if (!recipientRollNo && !recipientId) {
        return this.clientError(res, 'recipientRollNo or recipientId is required.');
      }

      // 1. Verify Entry
      const entry = await this.regRepo.findById(entryId);
      if (!entry) {
        return this.notFound(res, `Register entry ${entryId} not found.`);
      }
      if (entry.getStudentId() !== studentId) {
        return this.forbidden(res, 'Only the current holder can initiate a transfer.');
      }
      if (entry.getStatus() !== 'ISSUED') {
        return this.conflict(res, `Cannot initiate transfer for item in status '${entry.getStatus()}'.`);
      }

      // 2. Resolve & Verify Recipient
      const recipient = recipientId
        ? await this.userRepo.findById(recipientId as string)
        : await this.userRepo.findByRollNo(recipientRollNo as string);

      if (!recipient) {
        return this.notFound(res, 'Recipient student not found.');
      }
      if (!(recipient instanceof Student)) {
        return this.clientError(res, 'Transfer recipient must be a student.');
      }
      if (recipient.getId() === studentId) {
        return this.clientError(res, 'Cannot initiate transfer to yourself.');
      }

      const now = new Date();
      const eligibility = this.policy.isEligible(recipient, now);
      if (!eligibility.eligible) {
        return this.forbidden(res, `Recipient is ineligible: ${eligibility.reason}`);
      }

      // 3. Initiate Transfer
      await this.regRepo.initiateTransfer(entryId, recipient.getId());

      // 4. Broadcast Real-Time Notification
      this.hub.notifyTransferState(entryId, studentId, recipient.getId(), 'ISSUED_TRANSFER_PENDING');

      this.hub.notifyStudent(recipient.getId(), 'INCOMING_TRANSFER', {
        entryId,
        itemName: entry.getItemName(),
        fromStudentName: entry.getStudentName(),
        fromRollNo: entry.getRollNo(),
        message: `${entry.getStudentName()} wants to transfer '${entry.getItemName()}' to you.`
      });

      return this.ok(res, {
        message: 'Transfer initiated successfully. Waiting for recipient acceptance.',
        entryId,
        recipientId: recipient.getId(),
        recipientName: recipient.getName(),
        recipientRollNo: recipient.getRollNo()
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * POST /api/transfers/:entryId/cancel
   * Blueprint Rule 8:
   * Holder A cancels pending transfer. Reverts to status='ISSUED', pending_transfer_to_id=NULL.
   */
  public cancelTransfer = async (req: Request, res: Response): Promise<Response> => {
    try {
      const entryId = req.params.entryId as string;
      const { studentId } = req.body;

      const entry = await this.regRepo.findById(entryId);
      if (!entry) {
        return this.notFound(res, `Register entry ${entryId} not found.`);
      }
      if (entry.getStudentId() !== studentId) {
        return this.forbidden(res, 'Only the current holder can cancel a transfer.');
      }
      if (entry.getStatus() !== 'ISSUED_TRANSFER_PENDING') {
        return this.conflict(res, `Cannot cancel transfer: Entry is in status '${entry.getStatus()}'.`);
      }

      const recipientId = entry.getPendingTransferToId();
      await this.regRepo.cancelTransfer(entryId);

      this.hub.notifyTransferState(entryId, studentId, null, 'ISSUED');

      if (recipientId) {
        this.hub.notifyStudent(recipientId, 'TRANSFER_CANCELLED', {
          entryId,
          itemName: entry.getItemName(),
          message: `${entry.getStudentName()} cancelled the transfer request.`
        });
      }

      return this.ok(res, {
        message: 'Transfer cancelled successfully.',
        entryId,
        status: 'ISSUED'
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * POST /api/transfers/:entryId/respond
   * Blueprint Rule 8:
   * Recipient B accepts or rejects the transfer.
   * If accepted, executes atomic row split:
   * 1. A's row: status='RETURNED_VIA_TRANSFER', departure_time=NOW(), pending_transfer_to_id=NULL
   * 2. B's row: newly inserted with status='ISSUED', arrival_time=NOW(), sharing batch_id.
   * 3. Broadcasts via WebSocket so Guard Desk immediately swaps holder info.
   */
  public respondTransfer = async (req: Request, res: Response): Promise<Response> => {
    try {
      const entryId = req.params.entryId as string;
      const { studentId, action } = req.body;

      if (!studentId || !action) {
        return this.clientError(res, 'studentId and action (ACCEPT | REJECT) are required.');
      }

      const entry = await this.regRepo.findById(entryId);
      if (!entry) {
        return this.notFound(res, `Register entry ${entryId} not found.`);
      }
      if (entry.getStatus() !== 'ISSUED_TRANSFER_PENDING') {
        return this.conflict(res, `Transfer failed: Item is no longer pending transfer (Status: ${entry.getStatus()}).`);
      }
      if (entry.getPendingTransferToId() !== studentId) {
        return this.forbidden(res, 'You are not the designated recipient for this transfer.');
      }

      if (action === 'REJECT') {
        await this.regRepo.cancelTransfer(entryId);
        this.hub.notifyTransferState(entryId, entry.getStudentId(), null, 'ISSUED');
        this.hub.notifyStudent(entry.getStudentId(), 'TRANSFER_REJECTED', {
          entryId,
          message: 'The recipient declined the transfer request.'
        });
        return this.ok(res, { message: 'Transfer rejected and reverted to holder.' });
      }

      if (action === 'ACCEPT') {
        // Execute Atomic Row Split Stored Procedure
        const splitResult = await this.regRepo.executeTransferSplitTx(entryId, studentId);

        // Broadcast to WebSocket clients (Guard UI immediately swaps holder)
        this.hub.notifyTransferState(entryId, entry.getStudentId(), studentId, 'RETURNED_VIA_TRANSFER');
        this.hub.emit('GUARD_REGISTER_SWAPPED', {
          batchId: splitResult.batch_id,
          oldEntryId: splitResult.old_entry_id,
          newEntryId: splitResult.new_entry_id,
          newHolderId: studentId,
          newHolderName: splitResult.recipient_name,
          timestamp: new Date().toISOString()
        });

        this.hub.notifyStudent(entry.getStudentId(), 'TRANSFER_COMPLETED', {
          entryId,
          newHolderName: splitResult.recipient_name,
          message: `Transfer of '${entry.getItemName()}' to ${splitResult.recipient_name} complete.`
        });

        return this.ok(res, {
          message: 'Transfer accepted successfully. Ownership transferred atomically.',
          ...splitResult
        });
      }

      return this.clientError(res, "Invalid action. Expected 'ACCEPT' or 'REJECT'.");
    } catch (err: any) {
      if (err.message?.includes('mismatch') || err.message?.includes('status')) {
        return this.conflict(res, err.message);
      }
      return this.fail(res, err);
    }
  };

  /**
   * GET /api/transfers/incoming/:studentId
   * Returns incoming pending transfers for student banner display.
   */
  public getIncomingTransfers = async (req: Request, res: Response): Promise<Response> => {
    try {
      const studentId = req.params.studentId as string;
      const incoming = await this.regRepo.findPendingIncomingTransfers(studentId);

      return this.ok(res, incoming.map((e) => ({
        entryId: e.getId(),
        batchId: e.getBatchId(),
        itemId: e.getItemId(),
        itemName: e.getItemName(),
        category: e.getCategory(),
        fromStudentId: e.getStudentId(),
        fromStudentName: e.getStudentName(),
        fromRollNo: e.getRollNo(),
        arrivalTime: e.getArrivalTime().toISOString()
      })));
    } catch (err: any) {
      return this.fail(res, err);
    }
  };
}
