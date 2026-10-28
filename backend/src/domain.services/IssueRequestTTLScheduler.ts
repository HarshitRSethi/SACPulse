import { IssueRequest } from '../domain.entities/IssueRequest.js';
import { PenaltyAndEligibilityPolicy } from './PenaltyAndEligibilityPolicy.js';
import { RealtimeEventHub } from './RealtimeEventHub.js';

export interface ITTLPersistenceDelegate {
  markRequestTimedOut(requestId: string): Promise<boolean>;
  countTrailingTimeoutsLastHour(studentId: string): Promise<number>;
  applyStudentPenalty(studentId: string, penaltyUntil: Date): Promise<void>;
  getRequestById(requestId: string): Promise<IssueRequest | null>;
}

/**
 * IssueRequestTTLScheduler
 * Manages the authoritative 120-second server clock TTL for IssueRequests.
 * Blueprint Rule 4 & 5:
 * - 2-minute server TTL (expiresAt = createdAt + 120s)
 * - Transitions unfulfilled requests to TIMED_OUT
 * - Counts trailing strikes in the last 1-hour window (>3 -> sets penalty_until = NOW() + 5 hours)
 * - Broadcasts events via RealtimeEventHub / WebSockets
 */
export class IssueRequestTTLScheduler {
  private static instance: IssueRequestTTLScheduler | null = null;
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();
  private persistenceDelegate: ITTLPersistenceDelegate | null = null;
  private penaltyPolicy: PenaltyAndEligibilityPolicy;
  private eventHub: RealtimeEventHub;
  private checkInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.penaltyPolicy = new PenaltyAndEligibilityPolicy();
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

  /**
   * Schedules a precise 120s timeout callback for an IssueRequest.
   */
  public scheduleTimeout(
    requestId: string,
    studentId: string,
    expiresAt: Date,
    customDelayMs?: number
  ): void {
    this.cancelTimeout(requestId);

    const now = Date.now();
    const delay = customDelayMs !== undefined 
      ? customDelayMs 
      : Math.max(0, expiresAt.getTime() - now);

    const timer = setTimeout(async () => {
      await this.handleTimeout(requestId, studentId);
    }, delay);

    // Ensure timer doesn't keep the Node.js process open unnecessarily in test runners
    if (timer.unref) {
      timer.unref();
    }

    this.activeTimers.set(requestId, timer);
  }

  /**
   * Cancels scheduled timeout when a request is approved by guard.
   */
  public cancelTimeout(requestId: string): void {
    const existing = this.activeTimers.get(requestId);
    if (existing) {
      clearTimeout(existing);
      this.activeTimers.delete(requestId);
    }
  }

  /**
   * Executes the timeout transition and checks for the 5-hour cooldown penalty.
   */
  public async handleTimeout(requestId: string, studentId: string): Promise<void> {
    this.activeTimers.delete(requestId);

    if (this.persistenceDelegate) {
      const transitioned = await this.persistenceDelegate.markRequestTimedOut(requestId);
      if (!transitioned) {
        return; // Request was already approved or handled
      }

      // 1. Fetch trailing timeouts in the last 1-hour window
      const trailingStrikes = await this.persistenceDelegate.countTrailingTimeoutsLastHour(studentId);

      // 2. Evaluate sliding 1-hour strike rule (>3 strikes -> 5-hour cooldown)
      if (trailingStrikes > PenaltyAndEligibilityPolicy.MAX_STRIKES_1HR) {
        const now = new Date();
        const penaltyUntil = this.penaltyPolicy.calculatePenaltyExpiry(now);
        await this.persistenceDelegate.applyStudentPenalty(studentId, penaltyUntil);

        this.eventHub.notifyStudent(studentId, 'PENALTY_APPLIED', {
          reason: 'Excessive request timeouts (more than 3 strikes in 1 hour).',
          penaltyUntil: penaltyUntil.toISOString(),
          cooldownHours: PenaltyAndEligibilityPolicy.COOLDOWN_HRS
        });
      }

      // 3. Broadcast timeout to guard desk and student
      this.eventHub.emit('REQUEST_TIMED_OUT', {
        requestId,
        studentId,
        status: 'TIMED_OUT',
        trailingStrikes,
        timestamp: new Date().toISOString()
      });

      this.eventHub.emit('GUARD_QUEUE_UPDATED', {
        requestId,
        studentId,
        status: 'TIMED_OUT',
        timestamp: new Date().toISOString()
      });

      this.eventHub.notifyStudent(studentId, 'REQUEST_TIMED_OUT', {
        requestId,
        status: 'TIMED_OUT',
        message: 'Your 2-minute request window expired at the SAC counter.'
      });
    }
  }

  public clearAll(): void {
    for (const timer of this.activeTimers.values()) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}
