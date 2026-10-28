import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IssueRequestTTLScheduler, type ITTLPersistenceDelegate } from '../../src/domain.services/IssueRequestTTLScheduler.js';
import { RealtimeEventHub } from '../../src/domain.services/RealtimeEventHub.js';
import { IssueRequest } from '../../src/domain.entities/IssueRequest.js';

describe('IssueRequestTTLScheduler (Authoritative 120-Second Server Clock TTL)', () => {
  let scheduler: IssueRequestTTLScheduler;
  let eventHub: RealtimeEventHub;
  let mockDelegate: ITTLPersistenceDelegate;
  let timedOutRequests: string[];
  let penaltiesApplied: Map<string, Date>;
  let trailingStrikesCount: number;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = IssueRequestTTLScheduler.getInstance();
    scheduler.clearAll();
    eventHub = RealtimeEventHub.getInstance();

    timedOutRequests = [];
    penaltiesApplied = new Map();
    trailingStrikesCount = 1;

    mockDelegate = {
      markRequestTimedOut: vi.fn(async (requestId: string) => {
        timedOutRequests.push(requestId);
        return true;
      }),
      countTrailingTimeoutsLastHour: vi.fn(async (_studentId: string) => {
        return trailingStrikesCount;
      }),
      applyStudentPenalty: vi.fn(async (studentId: string, penaltyUntil: Date) => {
        penaltiesApplied.set(studentId, penaltyUntil);
      }),
      getRequestById: vi.fn(async (requestId: string) => {
        return new IssueRequest(
          requestId,
          'student-1',
          [{ itemId: 'item-1', name: 'TT Racket', qty: 2 }],
          'PENDING',
          new Date(),
          new Date(Date.now() + 120 * 1000)
        );
      })
    };

    scheduler.setPersistenceDelegate(mockDelegate);
  });

  afterEach(() => {
    scheduler.clearAll();
    vi.useRealTimers();
  });

  it('should automatically time out an IssueRequest when 120 seconds elapse', async () => {
    const requestId = 'req-101';
    const studentId = 'student-1';
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 120 * 1000);

    let queueEventReceived: any = null;
    eventHub.subscribe('GUARD_QUEUE_UPDATED', (payload) => {
      queueEventReceived = payload;
    });

    scheduler.scheduleTimeout(requestId, studentId, expiresAt);

    // Before 120 seconds: not timed out
    vi.advanceTimersByTime(119 * 1000);
    expect(timedOutRequests).not.toContain(requestId);

    // At 120 seconds: transitions to TIMED_OUT
    await vi.advanceTimersByTimeAsync(2000);

    expect(timedOutRequests).toContain(requestId);
    expect(mockDelegate.markRequestTimedOut).toHaveBeenCalledWith(requestId);
    expect(queueEventReceived).not.toBeNull();
    expect(queueEventReceived.status).toBe('TIMED_OUT');
  });

  it('should cancel the 120s timer when guard approves the request before expiry', async () => {
    const requestId = 'req-102';
    const studentId = 'student-1';
    const expiresAt = new Date(Date.now() + 120 * 1000);

    scheduler.scheduleTimeout(requestId, studentId, expiresAt);

    // Guard approves at 45 seconds
    vi.advanceTimersByTime(45 * 1000);
    scheduler.cancelTimeout(requestId);

    // Advance past 120 seconds
    await vi.advanceTimersByTimeAsync(80 * 1000);

    expect(timedOutRequests).not.toContain(requestId);
    expect(mockDelegate.markRequestTimedOut).not.toHaveBeenCalled();
  });

  it('should apply 5-hour cooldown penalty when student exceeds 3 timeouts in 1 hour (> 3 strikes)', async () => {
    const requestId = 'req-strike-4';
    const studentId = 'student-strike';
    const now = new Date('2026-10-28T12:00:00Z');
    vi.setSystemTime(now);
    const expiresAt = new Date(now.getTime() + 120 * 1000);

    // 4th strike in the trailing 1-hour window (> 3 strikes)
    trailingStrikesCount = 4;

    scheduler.scheduleTimeout(requestId, studentId, expiresAt);

    await vi.advanceTimersByTimeAsync(121 * 1000);

    expect(timedOutRequests).toContain(requestId);
    expect(mockDelegate.applyStudentPenalty).toHaveBeenCalled();

    const appliedPenalty = penaltiesApplied.get(studentId);
    expect(appliedPenalty).toBeDefined();

    // Must be exactly 5 hours from timeout evaluation (120s after creation)
    const expectedExpiry = new Date(now.getTime() + 120 * 1000 + 5 * 60 * 60 * 1000);
    expect(appliedPenalty?.getTime()).toBeCloseTo(expectedExpiry.getTime(), -4);
  });

  it('should NOT apply penalty if trailing strikes in 1 hour are <= 3', async () => {
    const requestId = 'req-strike-3';
    const studentId = 'student-ok';
    const now = new Date('2026-10-28T12:00:00Z');
    const expiresAt = new Date(now.getTime() + 120 * 1000);

    // 3 strikes (exact threshold, not exceeded)
    trailingStrikesCount = 3;

    scheduler.scheduleTimeout(requestId, studentId, expiresAt);
    await vi.advanceTimersByTimeAsync(121 * 1000);

    expect(timedOutRequests).toContain(requestId);
    expect(mockDelegate.applyStudentPenalty).not.toHaveBeenCalled();
    expect(penaltiesApplied.has(studentId)).toBe(false);
  });
});
