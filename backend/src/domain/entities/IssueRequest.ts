import crypto from 'crypto';
import {
  InvalidStateTransitionException,
  RequestExpiredException,
  ValidationException
} from '../exceptions/DomainException.js';

export type IssueRequestStatus = 'PENDING' | 'APPROVED' | 'TIMED_OUT';

export interface RequestedItem {
  itemId: string;
  name: string;
  qty: number;
}

/**
 * RequestLineItem Value Object
 *
 * Demonstrates OOP Composition (`IssueRequest *-- RequestLineItem`):
 * Immutable value object whose lifecycle is strictly bound to its parent `IssueRequest`.
 */
export class RequestLineItem {
  private readonly itemId: string;
  private readonly name: string;
  private readonly qty: number;

  constructor(itemId: string, name: string, qty: number) {
    if (!itemId || !name || !name.trim() || !Number.isFinite(qty) || qty <= 0) {
      throw new ValidationException(
        `Invalid requested line item: ${JSON.stringify({ itemId, name, qty })}`
      );
    }
    this.itemId = itemId;
    this.name = name.trim();
    this.qty = Math.floor(qty);
  }

  public getItemId(): string {
    return this.itemId;
  }

  public getName(): string {
    return this.name;
  }

  public getQty(): number {
    return this.qty;
  }

  public toDTO(): RequestedItem {
    return {
      itemId: this.itemId,
      name: this.name,
      qty: this.qty
    };
  }
}

/**
 * IssueRequest Entity
 * Represents a student's bundle equipment/room request.
 * Blueprint Rule 3 & 4:
 * - 2-step confirm, manual cancel is disabled
 * - Authoritative server TTL (default 120s: expiresAt = createdAt + ttlSeconds)
 * - Status transitions: PENDING -> APPROVED | TIMED_OUT
 */
export class IssueRequest {
  public static readonly DEFAULT_TTL_SECONDS = 120;

  private readonly id: string;
  private readonly studentId: string;
  private readonly lineItems: RequestLineItem[];
  private status: IssueRequestStatus;
  private readonly createdAt: Date;
  private readonly expiresAt: Date;
  private approvedById: string | null;

  constructor(
    id: string,
    studentId: string,
    requestedItems: RequestedItem[],
    status: IssueRequestStatus = 'PENDING',
    createdAt: Date = new Date(),
    expiresAt?: Date,
    approvedById: string | null = null
  ) {
    if (!id || !studentId) {
      throw new ValidationException('IssueRequest requires id and studentId.');
    }
    if (!requestedItems || requestedItems.length === 0) {
      throw new ValidationException('IssueRequest must contain at least one requested item.');
    }

    this.id = id;
    this.studentId = studentId;
    this.lineItems = requestedItems.map(
      (item) => new RequestLineItem(item.itemId, item.name, item.qty)
    );
    this.status = status;
    this.createdAt = createdAt;
    this.expiresAt =
      expiresAt ??
      new Date(createdAt.getTime() + IssueRequest.DEFAULT_TTL_SECONDS * 1000);
    this.approvedById = approvedById;
  }

  public static create(
    studentId: string,
    requestedItems: RequestedItem[],
    now: Date = new Date(),
    id?: string,
    ttlSeconds: number = IssueRequest.DEFAULT_TTL_SECONDS
  ): IssueRequest {
    const requestId = id ?? crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    return new IssueRequest(requestId, studentId, requestedItems, 'PENDING', now, expiresAt, null);
  }

  public getId(): string {
    return this.id;
  }

  public getStudentId(): string {
    return this.studentId;
  }

  public getLineItems(): RequestLineItem[] {
    return [...this.lineItems];
  }

  public getRequestedItems(): RequestedItem[] {
    return this.lineItems.map((line) => line.toDTO());
  }

  public getTotalRequestedUnits(): number {
    return this.lineItems.reduce((sum, line) => sum + line.getQty(), 0);
  }

  public getStatus(): IssueRequestStatus {
    return this.status;
  }

  public getCreatedAt(): Date {
    return this.createdAt;
  }

  public getExpiresAt(): Date {
    return this.expiresAt;
  }

  public getApprovedById(): string | null {
    return this.approvedById;
  }

  public isExpired(now: Date = new Date()): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  /**
   * Guard counter approval. Throws typed DomainExceptions if expired or not pending.
   */
  public markApproved(approvedById: string, now: Date = new Date()): void {
    if (this.status !== 'PENDING') {
      throw new InvalidStateTransitionException(
        `Cannot approve request: current status is '${this.status}', expected 'PENDING'.`
      );
    }
    if (this.isExpired(now)) {
      this.status = 'TIMED_OUT';
      throw new RequestExpiredException();
    }
    if (!approvedById) {
      throw new ValidationException('Approver user ID is required.');
    }
    this.status = 'APPROVED';
    this.approvedById = approvedById;
  }

  /**
   * Marks request as timed out when 2-minute window elapses unfulfilled.
   */
  public markTimedOut(_now: Date = new Date()): void {
    if (this.status !== 'PENDING') {
      throw new InvalidStateTransitionException(
        `Cannot time out request: current status is '${this.status}', expected 'PENDING'.`
      );
    }
    this.status = 'TIMED_OUT';
  }
}

