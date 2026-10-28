import type { Student } from '../domain.entities/User.js';

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

export interface TimeoutPenaltyEvaluationResult {
  penaltyApplied: boolean;
  penaltyUntil: Date | null;
  strikesCount: number;
}

/**
 * PenaltyAndEligibilityPolicy
 * Implements the Strategy Pattern to encapsulate SAC borrowing rules,
 * defaulter locks, and the sliding 1-hour strike rule with 5-hour cooldown.
 *
 * Blueprint Rule 5:
 * Sliding 1-Hr Strike Rule (>3 Timeouts -> 5h Cooldown):
 * When an IssueRequest becomes TIMED_OUT, count that student's TIMED_OUT rows
 * where created_at >= NOW() - INTERVAL '1 hour'. If count > 3 (4th strike in 1h),
 * set users.penalty_until = NOW() + INTERVAL '5 hours'.
 */
export class PenaltyAndEligibilityPolicy {
  public static readonly REQUEST_TTL_SEC: number = 120;
  public static readonly MAX_STRIKES_1HR: number = 3;
  public static readonly COOLDOWN_HRS: number = 5;

  /**
   * Asserts whether a student is eligible to issue items or receive peer transfers.
   * Throws an Error if ineligible.
   */
  public assertEligible(student: Student, now: Date = new Date()): void {
    const result = this.isEligible(student, now);
    if (!result.eligible) {
      throw new Error(`Student ${student.getName()} (${student.getRollNo()}) is ineligible: ${result.reason}`);
    }
  }

  /**
   * Checks eligibility returning boolean and explanation.
   */
  public isEligible(student: Student, now: Date = new Date()): EligibilityResult {
    if (student.getIsDefaulter()) {
      return {
        eligible: false,
        reason: 'Student is marked as a defaulter due to damaged SAC property. Admin must clear defaulter status.'
      };
    }

    const penaltyUntil = student.getPenaltyUntil();
    if (penaltyUntil && now.getTime() < penaltyUntil.getTime()) {
      return {
        eligible: false,
        reason: `Student is in 5-hour cooldown penalty until ${penaltyUntil.toISOString()} due to excessive timeouts.`
      };
    }

    return { eligible: true };
  }

  /**
   * Calculates the exact cooldown timestamp: NOW() + 5 hours.
   */
  public calculatePenaltyExpiry(now: Date = new Date()): Date {
    return new Date(now.getTime() + PenaltyAndEligibilityPolicy.COOLDOWN_HRS * 60 * 60 * 1000);
  }

  /**
   * Evaluates if a newly timed-out request triggers the 5-hour cooldown.
   * If total strikes in the last 1-hour window > 3 (i.e. 4 or more strikes),
   * sets student's penaltyUntil to now + 5 hours.
   */
  public evaluateTimeoutPenalty(
    student: Student,
    strikesLast1Hr: number,
    now: Date = new Date()
  ): TimeoutPenaltyEvaluationResult {
    if (strikesLast1Hr > PenaltyAndEligibilityPolicy.MAX_STRIKES_1HR) {
      const penaltyUntil = this.calculatePenaltyExpiry(now);
      student.setPenaltyUntil(penaltyUntil);
      return {
        penaltyApplied: true,
        penaltyUntil,
        strikesCount: strikesLast1Hr
      };
    }

    return {
      penaltyApplied: false,
      penaltyUntil: student.getPenaltyUntil(),
      strikesCount: strikesLast1Hr
    };
  }
}
