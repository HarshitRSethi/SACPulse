import type { RequestedItem } from '../../domain/entities/IssueRequest.js';
import { Student, type UserRole } from '../../domain/entities/User.js';
import {
  EntityNotFoundException,
  UnauthorizedRoleException,
  ValidationException
} from '../../domain/exceptions/DomainException.js';
import type { IIssueRequestRepository } from '../../domain/repositories/IIssueRequestRepository.js';
import type { IRegisterLogRepository } from '../../domain/repositories/IRegisterLogRepository.js';
import type { IUserRepository } from '../../domain/repositories/IUserRepository.js';
import {
  SlidingWindowCooldownStrategy,
  type IPenaltyStrategy
} from '../../domain/strategies/IPenaltyStrategy.js';
import { IssueRequestTTLScheduler } from './IssueRequestTTLScheduler.js';
import { RealtimeEventHub } from './RealtimeEventHub.js';

export interface PendingQueueItemDTO {
  id: string;
  studentId: string;
  studentName: string;
  rollNo: string | null;
  mobileNo: string | null;
  requestedItems: RequestedItem[];
  status: string;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
}

/**
 * CheckoutService
 *
 * Orchestrates student multi-item checkout requests, enforcing borrowing eligibility via
 * the GoF Strategy Pattern (`IPenaltyStrategy`), starting the authoritative server TTL timer,
 * and broadcasting incoming requests via `RealtimeEventHub`.
 */
export class CheckoutService {
  private readonly userRepo: IUserRepository;
  private readonly issueRequestRepo: IIssueRequestRepository;
  private readonly registerLogRepo: IRegisterLogRepository;
  private readonly scheduler: IssueRequestTTLScheduler;
  private readonly hub: RealtimeEventHub;
  private penaltyStrategy: IPenaltyStrategy;

  constructor(
    userRepo: IUserRepository,
    issueRequestRepo: IIssueRequestRepository,
    registerLogRepo: IRegisterLogRepository,
    penaltyStrategy: IPenaltyStrategy = new SlidingWindowCooldownStrategy(),
    scheduler: IssueRequestTTLScheduler = IssueRequestTTLScheduler.getInstance(),
    hub: RealtimeEventHub = RealtimeEventHub.getInstance()
  ) {
    this.userRepo = userRepo;
    this.issueRequestRepo = issueRequestRepo;
    this.registerLogRepo = registerLogRepo;
    this.penaltyStrategy = penaltyStrategy;
    this.scheduler = scheduler;
    this.hub = hub;
  }

  public setPenaltyStrategy(strategy: IPenaltyStrategy): void {
    this.penaltyStrategy = strategy;
    this.scheduler.setPenaltyStrategy(strategy);
  }

  public async createIssueRequest(params: {
    studentId: string;
    callerUserId?: string;
    callerRole?: UserRole;
    rawItems: unknown;
    now?: Date;
  }) {
    const { studentId, callerUserId, callerRole, rawItems } = params;
    const now = params.now ?? new Date();

    if (!studentId) {
      throw new ValidationException('studentId is required.');
    }
    if (callerUserId && callerRole === 'STUDENT' && callerUserId !== studentId) {
      throw new UnauthorizedRoleException(
        'Students cannot submit issue requests on behalf of another student.'
      );
    }
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new ValidationException('Requested items array cannot be empty.');
    }

    const user = await this.userRepo.findById(studentId);
    if (!user) {
      throw new EntityNotFoundException('Student', studentId);
    }
    if (!(user instanceof Student)) {
      throw new ValidationException('Only students can create issue requests.');
    }

    // Enforce Strategy Pattern eligibility rules
    this.penaltyStrategy.assertEligible(user, now);

    const requestedItems: RequestedItem[] = rawItems.map((i: any) => ({
      itemId: String(i?.itemId || i?.item_id || ''),
      name: String(i?.name || ''),
      qty: Number(i?.qty ?? 1)
    }));

    const ttlSeconds = this.penaltyStrategy.getRequestTtlSeconds();
    const issueReq = user.createIssueRequest(requestedItems, now, undefined, ttlSeconds);

    const saved = await this.issueRequestRepo.create(issueReq);

    this.scheduler.scheduleTimeout(saved.getId(), saved.getStudentId(), saved.getExpiresAt());

    this.hub.notifyGuardQueue(saved, {
      name: user.getName(),
      rollNo: user.getRollNo(),
      mobileNo: user.getMobileNo()
    });

    return {
      id: saved.getId(),
      studentId: saved.getStudentId(),
      studentName: user.getName(),
      rollNo: user.getRollNo(),
      mobileNo: user.getMobileNo(),
      requestedItems: saved.getRequestedItems(),
      status: saved.getStatus(),
      createdAt: saved.getCreatedAt().toISOString(),
      expiresAt: saved.getExpiresAt().toISOString(),
      ttlSeconds
    };
  }

  /**
   * Lists active pending queue requests.
   * Blueprint Rule 2 Privacy Guard: When queried by a `STUDENT`, filters strictly to that student's
   * own pending requests so other students' names, roll numbers, and mobile numbers are never exposed.
   */
  public async getPendingRequests(caller?: {
    userId: string;
    role: UserRole;
  }): Promise<PendingQueueItemDTO[]> {
    const pending = await this.issueRequestRepo.findPending();
    const visible =
      caller && caller.role === 'STUDENT'
        ? pending.filter((r) => r.getStudentId() === caller.userId)
        : pending;

    return Promise.all(
      visible.map(async (r) => {
        const user = await this.userRepo.findById(r.getStudentId());
        const profile = user ? user.toProfileDTO() : null;
        return {
          id: r.getId(),
          studentId: r.getStudentId(),
          studentName: profile ? profile.name : 'Student',
          rollNo: profile ? profile.rollNo : null,
          mobileNo: profile ? profile.mobileNo : null,
          requestedItems: r.getRequestedItems(),
          status: r.getStatus(),
          createdAt: r.getCreatedAt().toISOString(),
          expiresAt: r.getExpiresAt().toISOString(),
          isExpired: r.isExpired()
        };
      })
    );
  }

  public async getStudentActiveHoldings(
    studentId: string,
    caller?: { userId: string; role: UserRole }
  ) {
    if (caller && caller.role === 'STUDENT' && caller.userId !== studentId) {
      throw new UnauthorizedRoleException(
        'Students may only view their own active register holdings.'
      );
    }

    const activeEntries = await this.registerLogRepo.findActive({ studentId });
    return activeEntries.map((e) => ({
      id: e.getId(),
      batchId: e.getBatchId(),
      studentId: e.getStudentId(),
      studentName: e.getStudentName(),
      rollNo: e.getRollNo(),
      mobileNo: e.getMobileNo(),
      itemId: e.getItemId(),
      itemName: e.getItemName(),
      category: e.getCategory(),
      arrivalTime: e.getArrivalTime().toISOString(),
      status: e.getStatus(),
      pendingTransferToId: e.getPendingTransferToId()
    }));
  }
}

