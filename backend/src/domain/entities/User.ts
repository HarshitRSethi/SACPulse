import {
  EntityNotFoundException,
  IneligibleBorrowerException,
  UnauthorizedRoleException,
  ValidationException
} from '../exceptions/DomainException.js';
import { CheckoutBatch } from './CheckoutBatch.js';
import { IssueRequest, type RequestedItem } from './IssueRequest.js';
import type { RegisterEntry } from './RegisterEntry.js';
import type { SACItem } from './SACItem.js';

export type UserRole = 'STUDENT' | 'GUARD' | 'ADMIN';

export interface UserProfileDTO {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  rollNo: string | null;
  mobileNo: string | null;
  isDefaulter: boolean;
  penaltyUntil: string | null;
  dashboardRoute: string;
  requiresMobileSetup: boolean;
  isRootAdmin: boolean;
}

/**
 * Abstract Base User Class
 * Models every human actor (`Student`, `Guard`, `Admin`) in the SACPulse domain
 * with polymorphic routing, onboarding rules, and DTO projection (eliminating `instanceof` branches).
 */
export abstract class User {
  protected readonly id: string;
  protected name: string;
  protected readonly email: string;
  protected role: UserRole;
  protected mobileNo: string | null;

  protected constructor(
    id: string,
    name: string,
    email: string,
    role: UserRole,
    mobileNo: string | null = null
  ) {
    if (!id || !name.trim() || !email.trim()) {
      throw new ValidationException('User must have a non-empty id, name, and email.');
    }
    this.id = id;
    this.name = name.trim();
    this.email = email.toLowerCase().trim();
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
    if (!name.trim()) {
      throw new ValidationException('User name cannot be empty.');
    }
    this.name = name.trim();
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
    if (mobileNo !== null && !/^[6-9]\d{9}$/.test(mobileNo.trim())) {
      throw new ValidationException(
        'Invalid mobile number. Must be a valid 10-digit Indian mobile number starting with 6-9.'
      );
    }
    this.mobileNo = mobileNo ? mobileNo.trim() : null;
  }

  public requiresMobileOnboarding(): boolean {
    return this.mobileNo === null || this.mobileNo.trim() === '';
  }

  public isRootAdministrator(initialAdminEmail?: string | null): boolean {
    if (!initialAdminEmail) return false;
    return this.email === initialAdminEmail.toLowerCase().trim();
  }

  public abstract getDashboardRoute(): string;

  public abstract toProfileDTO(initialAdminEmail?: string | null): UserProfileDTO;
}

/**
 * Student Domain Entity
 * Inherits from User; encapsulates borrowing eligibility, issue request creation, and P2P transfers.
 */
export class Student extends User {
  private readonly rollNo: string;
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
    this.rollNo = (rollNo || 'N/A').trim();
    this.isDefaulter = isDefaulter;
    this.penaltyUntil = penaltyUntil;
  }

  public getRollNo(): string {
    return this.rollNo;
  }

  public getIsDefaulter(): boolean {
    return this.isDefaulter;
  }

  public setIsDefaulter(val: boolean): void {
    this.isDefaulter = val;
  }

  public flagAsDefaulter(): void {
    this.isDefaulter = true;
  }

  public clearDefaulterStatus(): void {
    this.isDefaulter = false;
  }

  public getPenaltyUntil(): Date | null {
    return this.penaltyUntil;
  }

  public setPenaltyUntil(until: Date | null): void {
    this.penaltyUntil = until;
  }

  public imposeCooldown(until: Date): void {
    this.penaltyUntil = until;
  }

  public clearCooldown(): void {
    this.penaltyUntil = null;
  }

  public canBorrowOrReceive(now: Date = new Date()): { eligible: boolean; reason?: string } {
    if (this.isDefaulter) {
      return {
        eligible: false,
        reason: 'Student is marked as a defaulter (damaged item locked).'
      };
    }
    if (this.penaltyUntil && now.getTime() < this.penaltyUntil.getTime()) {
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
    requestId?: string,
    ttlSeconds: number = IssueRequest.DEFAULT_TTL_SECONDS
  ): IssueRequest {
    const eligibility = this.canBorrowOrReceive(now);
    if (!eligibility.eligible) {
      throw new IneligibleBorrowerException(`Cannot create issue request: ${eligibility.reason}`);
    }
    if (!items || items.length === 0) {
      throw new ValidationException('Cannot create issue request with empty item list.');
    }
    return IssueRequest.create(this.id, items, now, requestId, ttlSeconds);
  }

  public initiateTransfer(entry: RegisterEntry, peer: Student, now: Date = new Date()): void {
    if (entry.getStudentId() !== this.id) {
      throw new UnauthorizedRoleException('Only the current holder can initiate a transfer.');
    }
    const peerEligibility = peer.canBorrowOrReceive(now);
    if (!peerEligibility.eligible) {
      throw new IneligibleBorrowerException(
        `Recipient is not eligible for transfer: ${peerEligibility.reason}`
      );
    }
    entry.lockForTransfer(peer.getId());
  }

  public cancelTransfer(entry: RegisterEntry): void {
    if (entry.getStudentId() !== this.id) {
      throw new UnauthorizedRoleException('Only the current holder can cancel a transfer.');
    }
    entry.cancelTransfer();
  }

  public acceptTransfer(
    entry: RegisterEntry,
    now: Date = new Date(),
    newEntryId?: string
  ): RegisterEntry {
    const eligibility = this.canBorrowOrReceive(now);
    if (!eligibility.eligible) {
      throw new IneligibleBorrowerException(`Cannot accept transfer: ${eligibility.reason}`);
    }
    return entry.completeAtomicTransfer(this, now, newEntryId);
  }

  public override getDashboardRoute(): string {
    return '/student';
  }

  public override toProfileDTO(initialAdminEmail?: string | null): UserProfileDTO {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      role: this.role,
      rollNo: this.rollNo,
      mobileNo: this.mobileNo,
      isDefaulter: this.isDefaulter,
      penaltyUntil: this.penaltyUntil ? this.penaltyUntil.toISOString() : null,
      dashboardRoute: this.getDashboardRoute(),
      requiresMobileSetup: this.requiresMobileOnboarding(),
      isRootAdmin: this.isRootAdministrator(initialAdminEmail)
    };
  }
}

/**
 * Guard Domain Entity
 * Inherits from User; executes counter request approvals, intact/batch returns,
 * damaged item locks, and faculty room overrides using polymorphic SACItem methods.
 */
export class Guard extends User {
  private readonly deskId: string;

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

  public approveRequest(
    req: IssueRequest,
    now: Date = new Date(),
    inventoryMap?: ReadonlyMap<string, SACItem>
  ): void {
    req.markApproved(this.id, now);
    if (inventoryMap) {
      for (const line of req.getLineItems()) {
        const item = inventoryMap.get(line.getItemId());
        if (!item) {
          throw new EntityNotFoundException('SACItem', line.getItemId());
        }
        item.checkout(line.getQty(), now);
      }
    }
  }

  public markUnitReturned(entry: RegisterEntry, item: SACItem, now: Date = new Date()): void {
    entry.closeOnGuardReturn(false, now);
    item.checkin(1, false, now);
  }

  public markBatchReturned(
    batchId: string,
    entries: RegisterEntry[],
    itemsMap: Map<string, SACItem>,
    now: Date = new Date()
  ): number {
    const matching = entries.filter((e) => e.getBatchId() === batchId);
    if (matching.length === 0) {
      return 0;
    }
    const batch = new CheckoutBatch(batchId, matching);
    return batch.returnAllActiveIntact(itemsMap, now);
  }

  /**
   * Blueprint Rule 7 & 9: Polymorphically invokes `item.checkin(1, true, now)`
   * without needing `item instanceof SportsEquipment`!
   */
  public markUnitDamaged(
    entry: RegisterEntry,
    item: SACItem,
    holder: Student,
    now: Date = new Date()
  ): void {
    entry.closeOnGuardReturn(true, now);
    item.checkin(1, true, now);
    holder.flagAsDefaulter();
  }

  public override getDashboardRoute(): string {
    return '/guard';
  }

  public override toProfileDTO(initialAdminEmail?: string | null): UserProfileDTO {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      role: this.role,
      rollNo: null,
      mobileNo: this.mobileNo,
      isDefaulter: false,
      penaltyUntil: null,
      dashboardRoute: this.getDashboardRoute(),
      requiresMobileSetup: this.mobileNo === null,
      isRootAdmin: this.isRootAdministrator(initialAdminEmail)
    };
  }
}

/**
 * Admin Domain Entity
 * Inherits from User; governs defaulter unblocking, cooldown resets, role hierarchy, and catalog management.
 */
export class Admin extends User {
  constructor(id: string, name: string, email: string, mobileNo: string | null = null) {
    super(id, name, email, 'ADMIN', mobileNo);
  }

  public clearDefaulter(student: Student): void {
    student.clearDefaulterStatus();
  }

  public resetCooldown(student: Student): void {
    student.clearCooldown();
  }

  public updateUserRole(user: User, newRole: UserRole): void {
    user.setRole(newRole);
  }

  public override getDashboardRoute(): string {
    return '/admin';
  }

  public override toProfileDTO(initialAdminEmail?: string | null): UserProfileDTO {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      role: this.role,
      rollNo: null,
      mobileNo: this.mobileNo,
      isDefaulter: false,
      penaltyUntil: null,
      dashboardRoute: this.getDashboardRoute(),
      requiresMobileSetup: this.mobileNo === null,
      isRootAdmin: this.isRootAdministrator(initialAdminEmail)
    };
  }
}

