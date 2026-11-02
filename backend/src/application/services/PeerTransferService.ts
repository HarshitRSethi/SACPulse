import { Student, type UserRole } from '../../domain/entities/User.js';
import {
  EntityNotFoundException,
  InvalidStateTransitionException,
  UnauthorizedRoleException,
  ValidationException
} from '../../domain/exceptions/DomainException.js';
import type { IRegisterLogRepository } from '../../domain/repositories/IRegisterLogRepository.js';
import type { IUserRepository } from '../../domain/repositories/IUserRepository.js';
import {
  SlidingWindowCooldownStrategy,
  type IPenaltyStrategy
} from '../../domain/strategies/IPenaltyStrategy.js';
import { RealtimeEventHub } from './RealtimeEventHub.js';

/**
 * PeerTransferService
 *
 * Orchestrates peer-to-peer equipment/room handoffs using the GoF State Pattern
 * (`RegisterEntry` composing `IRegisterEntryState`) and GoF Strategy Pattern (`IPenaltyStrategy`),
 * followed by atomic persistence splits and real-time WebSocket broadcasts.
 */
export class PeerTransferService {
  private readonly registerLogRepo: IRegisterLogRepository;
  private readonly userRepo: IUserRepository;
  private readonly penaltyStrategy: IPenaltyStrategy;
  private readonly hub: RealtimeEventHub;

  constructor(
    registerLogRepo: IRegisterLogRepository,
    userRepo: IUserRepository,
    penaltyStrategy: IPenaltyStrategy = new SlidingWindowCooldownStrategy(),
    hub: RealtimeEventHub = RealtimeEventHub.getInstance()
  ) {
    this.registerLogRepo = registerLogRepo;
    this.userRepo = userRepo;
    this.penaltyStrategy = penaltyStrategy;
    this.hub = hub;
  }

  public async initiateTransfer(params: {
    entryId: string;
    studentId: string;
    recipientId?: string;
    recipientRollNo?: string;
    callerUserId?: string;
    callerRole?: UserRole;
    now?: Date;
  }) {
    const { entryId, studentId, recipientId, recipientRollNo, callerUserId, callerRole } = params;
    const now = params.now ?? new Date();

    if (!studentId) {
      throw new ValidationException('studentId of the current holder is required.');
    }
    if (!recipientRollNo && !recipientId) {
      throw new ValidationException('recipientRollNo or recipientId is required.');
    }
    if (callerUserId && callerRole === 'STUDENT' && callerUserId !== studentId) {
      throw new UnauthorizedRoleException('Only the current holder can initiate a transfer.');
    }

    const entry = await this.registerLogRepo.findById(entryId);
    if (!entry) {
      throw new EntityNotFoundException('Register entry', entryId);
    }
    if (entry.getStudentId() !== studentId) {
      throw new UnauthorizedRoleException('Only the current holder can initiate a transfer.');
    }

    const recipient = recipientId
      ? await this.userRepo.findById(recipientId)
      : await this.userRepo.findByRollNo(recipientRollNo!);

    if (!recipient) {
      throw new EntityNotFoundException('Recipient student');
    }
    if (!(recipient instanceof Student)) {
      throw new ValidationException('Transfer recipient must be a student.');
    }
    if (recipient.getId() === studentId) {
      throw new ValidationException('Cannot initiate transfer to yourself.');
    }

    this.penaltyStrategy.assertEligible(recipient, now);

    const holder = await this.userRepo.findById(studentId);
    if (holder instanceof Student) {
      holder.initiateTransfer(entry, recipient, now);
    } else {
      entry.lockForTransfer(recipient.getId());
    }

    await this.registerLogRepo.initiateTransfer(entryId, recipient.getId());

    this.hub.notifyTransferState(entryId, studentId, recipient.getId(), 'ISSUED_TRANSFER_PENDING');
    this.hub.notifyStudent(recipient.getId(), 'INCOMING_TRANSFER', {
      entryId,
      itemName: entry.getItemName(),
      fromStudentName: entry.getStudentName(),
      fromRollNo: entry.getRollNo(),
      message: `${entry.getStudentName()} wants to transfer '${entry.getItemName()}' to you.`
    });

    return {
      message: 'Transfer initiated successfully. Waiting for recipient acceptance.',
      entryId,
      recipientId: recipient.getId(),
      recipientName: recipient.getName(),
      recipientRollNo: recipient.getRollNo()
    };
  }

  public async cancelTransfer(params: {
    entryId: string;
    studentId: string;
    callerUserId?: string;
    callerRole?: UserRole;
  }) {
    const { entryId, studentId, callerUserId, callerRole } = params;

    if (!studentId) {
      throw new ValidationException('studentId is required.');
    }
    if (callerUserId && callerRole === 'STUDENT' && callerUserId !== studentId) {
      throw new UnauthorizedRoleException('Only the current holder can cancel a transfer.');
    }

    const entry = await this.registerLogRepo.findById(entryId);
    if (!entry) {
      throw new EntityNotFoundException('Register entry', entryId);
    }
    if (entry.getStudentId() !== studentId) {
      throw new UnauthorizedRoleException('Only the current holder can cancel a transfer.');
    }

    const recipientId = entry.getPendingTransferToId();

    const holder = await this.userRepo.findById(studentId);
    if (holder instanceof Student) {
      holder.cancelTransfer(entry);
    } else {
      entry.cancelTransfer();
    }

    await this.registerLogRepo.cancelTransfer(entryId);

    this.hub.notifyTransferState(entryId, studentId, null, 'ISSUED');

    if (recipientId) {
      this.hub.notifyStudent(recipientId, 'TRANSFER_CANCELLED', {
        entryId,
        itemName: entry.getItemName(),
        message: `${entry.getStudentName()} cancelled the transfer request.`
      });
    }

    return {
      message: 'Transfer cancelled successfully.',
      entryId,
      status: 'ISSUED' as const
    };
  }

  public async respondTransfer(params: {
    entryId: string;
    studentId: string;
    action: string;
    callerUserId?: string;
    callerRole?: UserRole;
    now?: Date;
  }) {
    const { entryId, studentId, action, callerUserId, callerRole } = params;
    const now = params.now ?? new Date();

    if (!studentId || !action) {
      throw new ValidationException('studentId and action (ACCEPT | REJECT) are required.');
    }
    if (callerUserId && callerRole === 'STUDENT' && callerUserId !== studentId) {
      throw new UnauthorizedRoleException('You are not the designated recipient for this transfer.');
    }

    const normalizedAction = action.toUpperCase();
    if (normalizedAction !== 'ACCEPT' && normalizedAction !== 'REJECT') {
      throw new ValidationException("Invalid action. Expected 'ACCEPT' or 'REJECT'.");
    }

    const entry = await this.registerLogRepo.findById(entryId);
    if (!entry) {
      throw new EntityNotFoundException('Register entry', entryId);
    }

    if (entry.getStatus() !== 'ISSUED_TRANSFER_PENDING') {
      throw new InvalidStateTransitionException(
        `Transfer failed: Item is no longer pending transfer (Status: ${entry.getStatus()}).`
      );
    }
    if (entry.getPendingTransferToId() !== studentId) {
      throw new UnauthorizedRoleException('You are not the designated recipient for this transfer.');
    }

    const originalHolderId = entry.getStudentId();

    if (normalizedAction === 'REJECT') {
      // GoF State Pattern transition: ISSUED_TRANSFER_PENDING -> ISSUED
      entry.cancelTransfer();
      await this.registerLogRepo.cancelTransfer(entryId);

      this.hub.notifyTransferState(entryId, originalHolderId, null, 'ISSUED');
      this.hub.notifyStudent(originalHolderId, 'TRANSFER_REJECTED', {
        entryId,
        message: 'The recipient declined the transfer request.'
      });

      return { message: 'Transfer rejected and reverted to holder.' };
    }

    // ACCEPT path: Hydrate recipient Student, assert Strategy eligibility, run GoF State Pattern split
    const recipient = await this.userRepo.findById(studentId);
    if (!recipient || !(recipient instanceof Student)) {
      throw new EntityNotFoundException('Recipient student', studentId);
    }

    this.penaltyStrategy.assertEligible(recipient, now);
    recipient.acceptTransfer(entry, now);

    // Commit ACID atomic row split in persistence
    const splitResult = await this.registerLogRepo.executeTransferSplitTx(entryId, studentId);

    this.hub.notifyTransferState(entryId, originalHolderId, studentId, 'RETURNED_VIA_TRANSFER');
    this.hub.emit('GUARD_REGISTER_SWAPPED', {
      batchId: splitResult.batch_id,
      oldEntryId: splitResult.old_entry_id,
      newEntryId: splitResult.new_entry_id,
      newHolderId: studentId,
      newHolderName: splitResult.recipient_name,
      timestamp: new Date().toISOString()
    });

    this.hub.notifyStudent(originalHolderId, 'TRANSFER_COMPLETED', {
      entryId,
      newHolderName: splitResult.recipient_name,
      message: `Transfer of '${entry.getItemName()}' to ${splitResult.recipient_name} complete.`
    });

    return {
      message: 'Transfer accepted successfully. Ownership transferred atomically.',
      ...splitResult
    };
  }

  public async getIncomingTransfers(
    studentId: string,
    caller?: { userId: string; role: UserRole }
  ) {
    if (caller && caller.role === 'STUDENT' && caller.userId !== studentId) {
      throw new UnauthorizedRoleException('Students may only view their own incoming transfers.');
    }

    const incoming = await this.registerLogRepo.findPendingIncomingTransfers(studentId);
    return incoming.map((e) => ({
      entryId: e.getId(),
      batchId: e.getBatchId(),
      itemId: e.getItemId(),
      itemName: e.getItemName(),
      category: e.getCategory(),
      fromStudentId: e.getStudentId(),
      fromStudentName: e.getStudentName(),
      fromRollNo: e.getRollNo(),
      arrivalTime: e.getArrivalTime().toISOString()
    }));
  }
}

