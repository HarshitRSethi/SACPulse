import { IssueRequest, type RequestedItem } from './IssueRequest.js';
import type { RegisterEntry } from './RegisterEntry.js';
import type { SACItem } from './SACItem.js';
import { SportsEquipment } from './SACItem.js';

export type UserRole = 'STUDENT' | 'GUARD' | 'ADMIN';

/**
 * Abstract Base User class
 * Core participant in the SACPulse ecosystem.
 */
export abstract class User {
  protected readonly id: string;
  protected name: string;
  protected readonly email: string;
  protected role: UserRole;
  protected mobileNo: string | null;

  constructor(id: string, name: string, email: string, role: UserRole, mobileNo: string | null = null) {
    if (!id || !name || !email) {
      throw new Error('User must have an id, name, and email.');
    }
    this.id = id;
    this.name = name;
    this.email = email;
    this.role = role;
    this.mobileNo = mobileNo;
  }

  public getId(): string {
    return this.id;
  }

  public getName(): string {
    return this.name;
  }

  public setName(name: string): void {
    this.name = name;
  }

  public getEmail(): string {
    return this.email;
  }

  public getRole(): UserRole {
    return this.role;
  }

  public setRole(role: UserRole): void {
    this.role = role;
  }

  public getMobileNo(): string | null {
    return this.mobileNo;
  }

  public setMobileNo(mobileNo: string | null): void {
    this.mobileNo = mobileNo;
  }

  /**
   * Polymorphic method to determine user dashboard destination.
   */
  public abstract getDashboardRoute(): string;
}

/**
 * Student Domain Entity
 * Inherits from User, encapsulates borrowing eligibility, issue requests, and P2P transfers.
 */
export class Student extends User {
  private rollNo: string;
  private isDefaulter: boolean;
  private penaltyUntil: Date | null;

  constructor(
    id: string,
    name: string,
    email: string,
    rollNo: string,
    mobileNo: string | null = null,
    isDefaulter: boolean = false,
    penaltyUntil: Date | null = null
  ) {
    super(id, name, email, 'STUDENT', mobileNo);
    this.rollNo = rollNo;
    this.isDefaulter = isDefaulter;
    this.penaltyUntil = penaltyUntil;
  }

  public getRollNo(): string {
    return this.rollNo;
  }

  public getMobileNo(): string | null {
    return this.mobileNo;
  }

  public setMobileNo(mobileNo: string): void {
    this.mobileNo = mobileNo;
  }

  public getIsDefaulter(): boolean {
    return this.isDefaulter;
  }

  public setIsDefaulter(val: boolean): void {
    this.isDefaulter = val;
  }

  public getPenaltyUntil(): Date | null {
    return this.penaltyUntil;
  }

  public setPenaltyUntil(until: Date | null): void {
    this.penaltyUntil = until;
  }

  /**
   * Evaluates student eligibility based on Defaulter lock and 5-hour cooldown status.
   */
  public canBorrowOrReceive(now: Date = new Date()): { eligible: boolean; reason?: string } {
    if (this.isDefaulter) {
      return { eligible: false, reason: 'Student is marked as a defaulter (damaged item locked).' };
    }
    if (this.penaltyUntil && now < this.penaltyUntil) {
      return {
        eligible: false,
        reason: `Student is in 5-hour cooldown penalty until ${this.penaltyUntil.toISOString()}.`
      };
    }
    return { eligible: true };
  }

  public createIssueRequest(
    items: RequestedItem[],
    now: Date = new Date(),
    requestId?: string
  ): IssueRequest {
    const eligibility = this.canBorrowOrReceive(now);
    if (!eligibility.eligible) {
      throw new Error(`Cannot create issue request: ${eligibility.reason}`);
    }
    if (!items || items.length === 0) {
      throw new Error('Cannot create issue request with empty item list.');
    }
    return IssueRequest.create(this.id, items, now, requestId);
  }

  public initiateTransfer(entry: RegisterEntry, peer: Student, now: Date = new Date()): void {
    if (entry.getStudentId() !== this.id) {
      throw new Error('Only the current holder can initiate a transfer.');
    }
    const peerEligibility = peer.canBorrowOrReceive(now);
    if (!peerEligibility.eligible) {
      throw new Error(`Recipient is not eligible for transfer: ${peerEligibility.reason}`);
    }
    entry.lockForTransfer(peer.getId());
  }

  public cancelTransfer(entry: RegisterEntry): void {
    if (entry.getStudentId() !== this.id) {
      throw new Error('Only the current holder can cancel a transfer.');
    }
    entry.cancelTransfer();
  }

  public acceptTransfer(entry: RegisterEntry, now: Date = new Date(), newEntryId?: string): RegisterEntry {
    const eligibility = this.canBorrowOrReceive(now);
    if (!eligibility.eligible) {
      throw new Error(`Cannot accept transfer: ${eligibility.reason}`);
    }
    return entry.completeAtomicTransfer(this, now, newEntryId);
  }

  public override getDashboardRoute(): string {
    return '/student';
  }
}

/**
 * Guard Domain Entity
 * Inherits from User, handles counter approvals, intact batch returns, and damaged item locks.
 */
export class Guard extends User {
  private deskId: string;

  constructor(
    id: string,
    name: string,
    email: string,
    deskId: string = 'DESK_1',
    mobileNo: string | null = null
  ) {
    super(id, name, email, 'GUARD', mobileNo);
    this.deskId = deskId;
  }

  public getDeskId(): string {
    return this.deskId;
  }

  public approveRequest(req: IssueRequest, now: Date = new Date()): void {
    req.markApproved(this.id, now);
  }

  public markUnitReturned(entry: RegisterEntry, item: SACItem, now: Date = new Date()): void {
    entry.closeOnGuardReturn(false, now);
    item.releaseUnit(1);
  }

  public markBatchReturned(
    batchId: string,
    entries: RegisterEntry[],
    itemsMap: Map<string, SACItem>,
    now: Date = new Date()
  ): void {
    for (const entry of entries) {
      if (
        entry.getBatchId() === batchId &&
        (entry.getStatus() === 'ISSUED' || entry.getStatus() === 'ISSUED_TRANSFER_PENDING')
      ) {
        const item = itemsMap.get(entry.getItemId());
        if (!item) {
          throw new Error(`Item ${entry.getItemId()} not found in inventory.`);
        }
        this.markUnitReturned(entry, item, now);
      }
    }
  }

  public markUnitDamaged(
    entry: RegisterEntry,
    item: SACItem,
    holder: Student,
    now: Date = new Date()
  ): void {
    entry.closeOnGuardReturn(true, now);
    if (item instanceof SportsEquipment) {
      item.recordDamage(1);
    }
    holder.setIsDefaulter(true);
  }

  public override getDashboardRoute(): string {
    return '/guard';
  }
}

/**
 * Admin Domain Entity
 * Inherits from User, handles defaulter resets, cooldown resets, role updates, and item master data.
 */
export class Admin extends User {
  constructor(id: string, name: string, email: string, mobileNo: string | null = null) {
    super(id, name, email, 'ADMIN', mobileNo);
  }

  public clearDefaulter(student: Student): void {
    student.setIsDefaulter(false);
  }

  public resetCooldown(student: Student): void {
    student.setPenaltyUntil(null);
  }

  public updateUserRole(user: User, newRole: UserRole): void {
    user.setRole(newRole);
  }

  public override getDashboardRoute(): string {
    return '/admin';
  }
}
