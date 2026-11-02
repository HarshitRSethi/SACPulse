import crypto from 'crypto';
import { ValidationException } from '../exceptions/DomainException.js';
import {
  createRegisterEntryState,
  type IRegisterEntryState
} from '../states/IRegisterEntryState.js';
import type { Student } from './User.js';

export type RegisterStatus =
  | 'ISSUED'
  | 'ISSUED_TRANSFER_PENDING'
  | 'RETURNED'
  | 'RETURNED_VIA_TRANSFER'
  | 'DAMAGED';

/**
 * RegisterEntry Entity (Context in the GoF State Pattern)
 *
 * Represents a single physical unit row in `register_logs` sharing a `batchId`.
 * Composes (`*--`) an `IRegisterEntryState` instance that governs all legal transitions
 * across ISSUED, ISSUED_TRANSFER_PENDING, RETURNED_VIA_TRANSFER, RETURNED, and DAMAGED.
 */
export class RegisterEntry {
  private readonly id: string;
  private readonly batchId: string;
  private readonly studentId: string;
  private readonly studentName: string;
  private readonly rollNo: string;
  private readonly mobileNo: string;
  private readonly itemId: string;
  private readonly itemName: string;
  private readonly category: string;
  private readonly arrivalTime: Date;
  private departureTime: Date | null;
  private state: IRegisterEntryState;

  constructor(
    id: string,
    batchId: string,
    studentId: string,
    studentName: string,
    rollNo: string,
    mobileNo: string,
    itemId: string,
    itemName: string,
    category: string,
    arrivalTime: Date = new Date(),
    departureTime: Date | null = null,
    status: RegisterStatus = 'ISSUED',
    pendingTransferToId: string | null = null
  ) {
    if (!id || !batchId || !studentId || !itemId) {
      throw new ValidationException(
        'RegisterEntry requires id, batchId, studentId, and itemId.'
      );
    }
    this.id = id;
    this.batchId = batchId;
    this.studentId = studentId;
    this.studentName = studentName;
    this.rollNo = rollNo;
    this.mobileNo = mobileNo;
    this.itemId = itemId;
    this.itemName = itemName;
    this.category = category;
    this.arrivalTime = arrivalTime;
    this.departureTime = departureTime;
    this.state = createRegisterEntryState(status, pendingTransferToId);
  }

  public getId(): string {
    return this.id;
  }

  public getBatchId(): string {
    return this.batchId;
  }

  public getStudentId(): string {
    return this.studentId;
  }

  public getStudentName(): string {
    return this.studentName;
  }

  public getRollNo(): string {
    return this.rollNo;
  }

  public getMobileNo(): string {
    return this.mobileNo;
  }

  public getItemId(): string {
    return this.itemId;
  }

  public getItemName(): string {
    return this.itemName;
  }

  public getCategory(): string {
    return this.category;
  }

  public getArrivalTime(): Date {
    return this.arrivalTime;
  }

  public getDepartureTime(): Date | null {
    return this.departureTime;
  }

  public getState(): IRegisterEntryState {
    return this.state;
  }

  public getStatus(): RegisterStatus {
    return this.state.getStatus();
  }

  public isActiveHolding(): boolean {
    return this.state.isActiveHolding();
  }

  public getPendingTransferToId(): string | null {
    return this.state.getPendingRecipientId();
  }

  /**
   * Internal state transition hook invoked exclusively by concrete IRegisterEntryState classes.
   */
  public transitionToState(nextState: IRegisterEntryState): void {
    this.state = nextState;
  }

  public recordDeparture(now: Date): void {
    this.departureTime = now;
  }

  public spawnTransferredEntry(
    peer: Student,
    peerMobile: string,
    now: Date,
    newEntryId?: string
  ): RegisterEntry {
    return new RegisterEntry(
      newEntryId ?? crypto.randomUUID(),
      this.batchId,
      peer.getId(),
      peer.getName(),
      peer.getRollNo(),
      peerMobile,
      this.itemId,
      this.itemName,
      this.category,
      now,
      null,
      'ISSUED',
      null
    );
  }

  /**
   * Blueprint Rule 8: Delegates transfer initiation to current state object.
   */
  public lockForTransfer(peerId: string): void {
    this.state.initiateTransfer(this, peerId);
  }

  /**
   * Blueprint Rule 8: Delegates transfer cancellation to current state object.
   */
  public cancelTransfer(): void {
    this.state.cancelTransfer(this);
  }

  /**
   * Blueprint Rule 8: Delegates atomic row split to current state object.
   */
  public completeAtomicTransfer(
    peer: Student,
    now: Date = new Date(),
    newEntryId?: string
  ): RegisterEntry {
    return this.state.acceptTransfer(this, peer, now, newEntryId);
  }

  /**
   * Blueprint Rule 7 & 9: Delegates guard counter return (intact or damaged) to current state object,
   * automatically wiping any pending transfer recipient.
   */
  public closeOnGuardReturn(isDamaged: boolean = false, now: Date = new Date()): void {
    this.state.closeOnGuardReturn(this, isDamaged, now);
  }
}

