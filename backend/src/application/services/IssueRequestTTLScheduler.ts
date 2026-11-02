import type { ITTLPersistenceDelegate } from '../../domain/repositories/IIssueRequestRepository.js';
import {
  SlidingWindowCooldownStrategy,
  type IPenaltyStrategy
} from '../../domain/strategies/IPenaltyStrategy.js';
import { RealtimeEventHub } from './RealtimeEventHub.js';

export type { ITTLPersistenceDelegate };

/**
 * IssueRequestTTLScheduler
 *
 * Manages the authoritative server-clock TTL for `IssueRequest`s using an injected `IPenaltyStrategy`
 * (GoF Strategy Pattern) and recovers orphaned `PENDING` requests across server restarts.
 */
export class IssueRequestTTLScheduler {
  private static instance: IssueRequestTTLScheduler | null = null;
  private readonly activeTimers: Map<string, NodeJS.Timeout> = new Map();
  private persistenceDelegate: ITTLPersistenceDelegate | null = null;
  private penaltyStrategy: IPenaltyStrategy;
  private readonly eventHub: RealtimeEventHub;

  private constructor(strategy: IPenaltyStrategy = new SlidingWindowCooldownStrategy()) {
    this.penaltyStrategy = strategy;
    this.eventHub = RealtimeEventHub.getInstance();
  }

  public static getInstance(): IssueRequestTTLScheduler {
    if (!IssueRequestTTLScheduler.instance) {
      IssueRequestTTLScheduler.instance = new IssueRequestTTLScheduler();
    }
    return IssueRequestTTLScheduler.instance;
  }

  public static resetInstance(): void {
    if (IssueRequestTTLScheduler.instance) {
      IssueRequestTTLScheduler.instance.clearAll();
      IssueRequestTTLScheduler.instance = null;
    }
  }

  public setPersistenceDelegate(delegate: ITTLPersistenceDelegate): void {
    this.persistenceDelegate = delegate;
  }

  public setPenaltyStrategy(strategy: IPenaltyStrategy): void {
    this.penaltyStrategy = strategy;
  }

  public getPenaltyStrategy(): IPenaltyStrategy {
    return this.penaltyStrategy;
  }

  public getActiveTimerCount(): number {
    return this.activeTimers.size;
  }

  /**
   * Schedules a precise server timeout callback for an `IssueRequest`.
   */
  public scheduleTimeout(
    requestId: string,
    studentId: string,
    expiresAt: Date,
    customDelayMs?: number
  ): void {
    this.cancelTimeout(requestId);

    const now = Date.now();
    const delay =
      customDelayMs !== undefined ? customDelayMs : Math.max(0, expiresAt.getTime() - now);

    const timer = setTimeout(async () => {
      await this.handleTimeout(requestId, studentId);
    }, delay);

    if (timer.unref) {
      timer.unref();
    }

    this.activeTimers.set(requestId, timer);
  }

  /**
   * Cancels scheduled timeout when a request is approved at the Guard Desk.
   */
  public cancelTimeout(requestId: string): void {
    const existing = this.activeTimers.get(requestId);
    if (existing) {
      clearTimeout(existing);
      this.activeTimers.delete(requestId);
    }
  }

  /**
   * Boot-time recovery sweep:
   * Immediately expires any `PENDING` requests whose `expires_at <= NOW()` and re-arms
   * remaining `PENDING` timers for requests still within their walk-up window.
   */
  public async recoverPendingRequests(now: Date = new Date()): Promise<{
    expiredImmediately: number;
    rescheduled: number;
  }> {
    if (
      !this.persistenceDelegate ||
      typeof this.persistenceDelegate.findAllPendingUnexpiredOrOverdue !== 'function'
    ) {
      return { expiredImmediately: 0, rescheduled: 0 };
    }

    const pendingRequests = await this.persistenceDelegate.findAllPendingUnexpiredOrOverdue();
    let expiredImmediately = 0;
    let rescheduled = 0;

    for (const req of pendingRequests) {
      if (req.getExpiresAt().getTime() <= now.getTime()) {
        await this.handleTimeout(req.getId(), req.getStudentId());
        expiredImmediately += 1;
      } else {
        this.scheduleTimeout(req.getId(), req.getStudentId(), req.getExpiresAt());
        rescheduled += 1;
      }
    }

    return { expiredImmediately, rescheduled };
  }

  /**
   * Executes the timeout transition and evaluates the configured `IPenaltyStrategy`.
   */
  public async handleTimeout(requestId: string, studentId: string): Promise<void> {
    this.activeTimers.delete(requestId);

    if (!this.persistenceDelegate) {
      return;
    }

    const transitioned = await this.persistenceDelegate.markRequestTimedOut(requestId);
    if (!transitioned) {
      return; // Request was already approved or previously timed out
    }

    const trailingStrikes =
      await this.persistenceDelegate.countTrailingTimeoutsLastHour(studentId);

    if (trailingStrikes > this.penaltyStrategy.getMaxStrikesInWindow()) {
      const now = new Date();
      const penaltyUntil = this.penaltyStrategy.calculatePenaltyExpiry(now);
      await this.persistenceDelegate.applyStudentPenalty(studentId, penaltyUntil);

      this.eventHub.notifyStudent(studentId, 'PENALTY_APPLIED', {
        reason: `Excessive request timeouts (more than ${this.penaltyStrategy.getMaxStrikesInWindow()} strikes in 1 hour).`,
        penaltyUntil: penaltyUntil.toISOString(),
        cooldownHours: this.penaltyStrategy.getCooldownHours(),
        strategy: this.penaltyStrategy.getStrategyName()
      });
    }

    const timestamp = new Date().toISOString();

    this.eventHub.emit('REQUEST_TIMED_OUT', {
      requestId,
      studentId,
      status: 'TIMED_OUT',
      trailingStrikes,
      timestamp
    });

    this.eventHub.emit('GUARD_QUEUE_UPDATED', {
      requestId,
      studentId,
      status: 'TIMED_OUT',
      timestamp
    });

    this.eventHub.notifyStudent(studentId, 'REQUEST_TIMED_OUT', {
      requestId,
      status: 'TIMED_OUT',
      message: 'Your request walk-up window expired at the SAC counter.'
    });
  }

  public clearAll(): void {
    for (const timer of this.activeTimers.values()) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
  }
}

