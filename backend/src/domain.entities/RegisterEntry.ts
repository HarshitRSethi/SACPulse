import crypto from 'crypto';
import type { Student } from './User.js';

export type RegisterStatus =
  | 'ISSUED'
  | 'ISSUED_TRANSFER_PENDING'
  | 'RETURNED'
  | 'RETURNED_VIA_TRANSFER'
  | 'DAMAGED';

/**
 * RegisterEntry Entity
 * Employs the State Pattern to govern the lifecycle of a single physical unit in the digital register.
 * Corresponds to 1 row per unit in `register_logs` sharing a common `batch_id`.
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
  private status: RegisterStatus;
  private pendingTransferToId: string | null;

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
      throw new Error('RegisterEntry requires id, batchId, studentId, and itemId.');
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
    this.status = status;
    this.pendingTransferToId = pendingTransferToId;
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

  public getStatus(): RegisterStatus {
    return this.status;
  }

  public getPendingTransferToId(): string | null {
    return this.pendingTransferToId;
  }

  /**
   * Blueprint Rule 8: Peer-to-Peer Transfer Initiation.
   * Changes status to ISSUED_TRANSFER_PENDING and records target recipient.
   */
  public lockForTransfer(peerId: string): void {
    if (this.status !== 'ISSUED') {
      throw new Error(
        `Cannot initiate transfer from status '${this.status}'. Item must be in 'ISSUED' state.`
      );
    }
    if (!peerId) {
      throw new Error('Recipient peer ID is required to initiate transfer.');
    }
    if (peerId === this.studentId) {
      throw new Error('Cannot transfer an item to yourself.');
    }
    this.status = 'ISSUED_TRANSFER_PENDING';
    this.pendingTransferToId = peerId;
  }

  /**
   * Blueprint Rule 8: Cancel Transfer.
   * Returns row to standard ISSUED state and clears pending transfer.
   */
  public cancelTransfer(): void {
    if (this.status !== 'ISSUED_TRANSFER_PENDING') {
      throw new Error(
        `Cannot cancel transfer: current status is '${this.status}', expected 'ISSUED_TRANSFER_PENDING'.`
      );
    }
    this.status = 'ISSUED';
    this.pendingTransferToId = null;
  }

  /**
   * Blueprint Rule 8: Peer-to-Peer Atomic Row Split.
   * Closes the current holder's row (RETURNED_VIA_TRANSFER) and spawns a new ISSUED row for the peer.
   */
  public completeAtomicTransfer(
    peer: Student,
    now: Date = new Date(),
    newEntryId?: string
  ): RegisterEntry {
    if (this.status !== 'ISSUED_TRANSFER_PENDING') {
      throw new Error(
        `Transfer acceptance failed: Entry status is '${this.status}', expected 'ISSUED_TRANSFER_PENDING'.`
      );
    }
    if (this.pendingTransferToId !== peer.getId()) {
      throw new Error(
        `Transfer recipient mismatch: assigned to '${this.pendingTransferToId}', but accepted by '${peer.getId()}'.`
      );
    }
    const peerMobile = peer.getMobileNo();
    if (!peerMobile) {
      throw new Error('Peer mobile number is required before receiving an item.');
    }

    // Step 1: Close current holder's row
    this.status = 'RETURNED_VIA_TRANSFER';
    this.departureTime = now;
    this.pendingTransferToId = null;

    // Step 2: Spawn new row for recipient peer in same batch
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
   * Blueprint Rule 7 & 9: State-Linked Transfer Kill on Guard Return.
   * Guard return immediately closes the unit, sets departure_time, and ALWAYS wipes pendingTransferToId.
   */
  public closeOnGuardReturn(isDamaged: boolean = false, now: Date = new Date()): void {
    if (this.status !== 'ISSUED' && this.status !== 'ISSUED_TRANSFER_PENDING') {
      throw new Error(
        `Cannot close entry in status '${this.status}'. Unit is already closed.`
      );
    }
    // Blueprint Rule 9 invariant: wipes any pending transfer request
    this.pendingTransferToId = null;
    this.departureTime = now;
    this.status = isDamaged ? 'DAMAGED' : 'RETURNED';
  }
}
