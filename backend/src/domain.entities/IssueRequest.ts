import crypto from 'crypto';

export type IssueRequestStatus = 'PENDING' | 'APPROVED' | 'TIMED_OUT';

export interface RequestedItem {
  itemId: string;
  name: string;
  qty: number;
}

/**
 * IssueRequest Entity
 * Represents a student's bundle equipment/room request.
 * Blueprint Rule 3 & 4:
 * - 2-step confirm, manual cancel is disabled
 * - Authoritative 2-minute server TTL (expiresAt = createdAt + 120s)
 * - Status transitions: PENDING -> APPROVED | TIMED_OUT
 */
export class IssueRequest {
  private readonly id: string;
  private readonly studentId: string;
  private readonly requestedItems: RequestedItem[];
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
      throw new Error('IssueRequest requires id and studentId.');
    }
    if (!requestedItems || requestedItems.length === 0) {
      throw new Error('IssueRequest must contain at least one requested item.');
    }
    for (const item of requestedItems) {
      if (!item.itemId || !item.name || item.qty <= 0) {
        throw new Error(`Invalid requested item: ${JSON.stringify(item)}`);
      }
    }

    this.id = id;
    this.studentId = studentId;
    this.requestedItems = requestedItems;
    this.status = status;
    this.createdAt = createdAt;
    // Authoritative 2-minute server TTL (120 seconds)
    this.expiresAt = expiresAt ?? new Date(createdAt.getTime() + 120 * 1000);
    this.approvedById = approvedById;
  }

  public static create(
    studentId: string,
    requestedItems: RequestedItem[],
    now: Date = new Date(),
    id?: string
  ): IssueRequest {
    const requestId = id ?? crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + 120 * 1000);
    return new IssueRequest(requestId, studentId, requestedItems, 'PENDING', now, expiresAt, null);
  }

  public getId(): string {
    return this.id;
  }

  public getStudentId(): string {
    return this.studentId;
  }

  public getRequestedItems(): RequestedItem[] {
    return this.requestedItems.map((item) => ({ ...item }));
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

  /**
   * Authoritative expiration check against server time.
   */
  public isExpired(now: Date = new Date()): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  /**
   * Guard counter approval. Throws if expired or not pending.
   */
  public markApproved(approvedById: string, now: Date = new Date()): void {
    if (this.status !== 'PENDING') {
      throw new Error(`Cannot approve request: current status is '${this.status}', expected 'PENDING'.`);
    }
    if (this.isExpired(now)) {
      this.status = 'TIMED_OUT';
      throw new Error('Cannot approve request: Authoritative 2-minute server TTL has expired.');
    }
    if (!approvedById) {
      throw new Error('Approver user ID is required.');
    }
    this.status = 'APPROVED';
    this.approvedById = approvedById;
  }

  /**
   * Marks request as timed out when 2-minute window elapses unfulfilled.
   */
  public markTimedOut(now: Date = new Date()): void {
    if (this.status !== 'PENDING') {
      throw new Error(`Cannot time out request: current status is '${this.status}', expected 'PENDING'.`);
    }
    this.status = 'TIMED_OUT';
  }
}
