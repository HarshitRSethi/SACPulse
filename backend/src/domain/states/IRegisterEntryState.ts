import {
  InvalidStateTransitionException,
  ValidationException
} from '../exceptions/DomainException.js';
import type { RegisterEntry, RegisterStatus } from '../entities/RegisterEntry.js';
import type { Student } from '../entities/User.js';

/**
 * GoF State Pattern Interface for RegisterEntry lifecycle.
 * Each state encapsulates legal transitions and enforces state-linked invariants
 * (such as wiping pending transfers upon guard counter return).
 */
export interface IRegisterEntryState {
  getStatus(): RegisterStatus;
  isActiveHolding(): boolean;
  getPendingRecipientId(): string | null;
  initiateTransfer(context: RegisterEntry, peerId: string): void;
  cancelTransfer(context: RegisterEntry): void;
  acceptTransfer(
    context: RegisterEntry,
    peer: Student,
    now: Date,
    newEntryId?: string
  ): RegisterEntry;
  closeOnGuardReturn(context: RegisterEntry, isDamaged: boolean, now: Date): void;
}

/**
 * Active Holding State: ISSUED
 * Unit is physically held by a student with no pending transfer.
 */
export class IssuedState implements IRegisterEntryState {
  public getStatus(): RegisterStatus {
    return 'ISSUED';
  }

  public isActiveHolding(): boolean {
    return true;
  }

  public getPendingRecipientId(): string | null {
    return null;
  }

  public initiateTransfer(context: RegisterEntry, peerId: string): void {
    if (!peerId || !peerId.trim()) {
      throw new ValidationException('Recipient peer ID is required to initiate transfer.');
    }
    if (peerId === context.getStudentId()) {
      throw new ValidationException('Cannot transfer an item to yourself.');
    }
    context.transitionToState(new TransferPendingState(peerId));
  }

  public cancelTransfer(_context: RegisterEntry): void {
    throw new InvalidStateTransitionException(
      "Cannot cancel transfer: current status is 'ISSUED', expected 'ISSUED_TRANSFER_PENDING'."
    );
  }

  public acceptTransfer(
    _context: RegisterEntry,
    _peer: Student,
    _now: Date,
    _newEntryId?: string
  ): RegisterEntry {
    throw new InvalidStateTransitionException(
      "Transfer acceptance failed: Entry status is 'ISSUED', expected 'ISSUED_TRANSFER_PENDING'."
    );
  }

  public closeOnGuardReturn(context: RegisterEntry, isDamaged: boolean, now: Date): void {
    context.recordDeparture(now);
    context.transitionToState(isDamaged ? new DamagedState() : new ReturnedState());
  }
}

/**
 * Active Holding State: ISSUED_TRANSFER_PENDING
 * Holder A has offered the unit to Peer B; item remains A's responsibility until B accepts
 * or the Guard closes the holding at the SAC counter.
 */
export class TransferPendingState implements IRegisterEntryState {
  private readonly recipientPeerId: string;

  constructor(recipientPeerId: string) {
    if (!recipientPeerId) {
      throw new ValidationException(
        'ISSUED_TRANSFER_PENDING state requires a target recipientPeerId.'
      );
    }
    this.recipientPeerId = recipientPeerId;
  }

  public getStatus(): RegisterStatus {
    return 'ISSUED_TRANSFER_PENDING';
  }

  public isActiveHolding(): boolean {
    return true;
  }

  public getPendingRecipientId(): string | null {
    return this.recipientPeerId;
  }

  public initiateTransfer(_context: RegisterEntry, _peerId: string): void {
    throw new InvalidStateTransitionException(
      "Cannot initiate transfer from status 'ISSUED_TRANSFER_PENDING'. Item must be in 'ISSUED' state."
    );
  }

  public cancelTransfer(context: RegisterEntry): void {
    context.transitionToState(new IssuedState());
  }

  public acceptTransfer(
    context: RegisterEntry,
    peer: Student,
    now: Date,
    newEntryId?: string
  ): RegisterEntry {
    if (this.recipientPeerId !== peer.getId()) {
      throw new InvalidStateTransitionException(
        `Transfer recipient mismatch: assigned to '${this.recipientPeerId}', but accepted by '${peer.getId()}'.`
      );
    }
    const peerMobile = peer.getMobileNo();
    if (!peerMobile) {
      throw new ValidationException(
        'Peer mobile number is required before receiving an item.'
      );
    }

    // Step 1: Close holder A's row atomically (wiping pending recipient via new state)
    context.recordDeparture(now);
    context.transitionToState(new ReturnedViaTransferState());

    // Step 2: Spawn new ISSUED row for Peer B within the same batch
    return context.spawnTransferredEntry(peer, peerMobile, now, newEntryId);
  }

  /**
   * Blueprint Rule 9: Guard return immediately closes the unit and wipes `pendingTransferToId`
   * by transitioning out of `TransferPendingState` into a terminal state.
   */
  public closeOnGuardReturn(context: RegisterEntry, isDamaged: boolean, now: Date): void {
    context.recordDeparture(now);
    context.transitionToState(isDamaged ? new DamagedState() : new ReturnedState());
  }
}

/**
 * Abstract base for terminal (closed) register states: RETURNED, RETURNED_VIA_TRANSFER, DAMAGED.
 */
abstract class TerminalRegisterState implements IRegisterEntryState {
  public abstract getStatus(): RegisterStatus;

  public isActiveHolding(): boolean {
    return false;
  }

  public getPendingRecipientId(): string | null {
    return null;
  }

  public initiateTransfer(_context: RegisterEntry, _peerId: string): void {
    throw new InvalidStateTransitionException(
      `Cannot initiate transfer from status '${this.getStatus()}'. Item must be in 'ISSUED' state.`
    );
  }

  public cancelTransfer(_context: RegisterEntry): void {
    throw new InvalidStateTransitionException(
      `Cannot cancel transfer: current status is '${this.getStatus()}', expected 'ISSUED_TRANSFER_PENDING'.`
    );
  }

  public acceptTransfer(
    _context: RegisterEntry,
    _peer: Student,
    _now: Date,
    _newEntryId?: string
  ): RegisterEntry {
    throw new InvalidStateTransitionException(
      `Transfer acceptance failed: Entry status is '${this.getStatus()}', expected 'ISSUED_TRANSFER_PENDING'.`
    );
  }

  public closeOnGuardReturn(_context: RegisterEntry, _isDamaged: boolean, _now: Date): void {
    throw new InvalidStateTransitionException(
      `Cannot close entry in status '${this.getStatus()}'. Unit is already closed.`
    );
  }
}

export class ReturnedState extends TerminalRegisterState {
  public override getStatus(): RegisterStatus {
    return 'RETURNED';
  }
}

export class ReturnedViaTransferState extends TerminalRegisterState {
  public override getStatus(): RegisterStatus {
    return 'RETURNED_VIA_TRANSFER';
  }
}

export class DamagedState extends TerminalRegisterState {
  public override getStatus(): RegisterStatus {
    return 'DAMAGED';
  }
}

/**
 * Reconstitutes the appropriate GoF State object from persisted status & transfer target.
 */
export function createRegisterEntryState(
  status: RegisterStatus,
  pendingTransferToId: string | null = null
): IRegisterEntryState {
  switch (status) {
    case 'ISSUED':
      return new IssuedState();
    case 'ISSUED_TRANSFER_PENDING':
      if (!pendingTransferToId) {
        return new IssuedState();
      }
      return new TransferPendingState(pendingTransferToId);
    case 'RETURNED':
      return new ReturnedState();
    case 'RETURNED_VIA_TRANSFER':
      return new ReturnedViaTransferState();
    case 'DAMAGED':
      return new DamagedState();
    default:
      throw new ValidationException(`Unknown RegisterEntry status '${String(status)}'.`);
  }
}

