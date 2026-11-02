import type { Student } from '../entities/User.js';

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

/**
 * Pluggable Eligibility Rule Interface (Composite / Strategy Collaborator)
 * Allows chaining independent borrowing guards without modifying core entities (Open/Closed Principle).
 */
export interface IEligibilityRule {
  evaluate(student: Student, now: Date): EligibilityResult;
}

/**
 * Rule A: Blocks borrowing/transfers while student has an unresolved damaged-property lock.
 */
export class NotDefaulterEligibilityRule implements IEligibilityRule {
  public evaluate(student: Student, _now: Date): EligibilityResult {
    if (student.getIsDefaulter()) {
      return {
        eligible: false,
        reason:
          'Student is marked as a defaulter due to damaged SAC property. Admin must clear defaulter status.'
      };
    }
    return { eligible: true };
  }
}

/**
 * Rule B: Blocks borrowing/transfers while student is serving an active timeout cooldown window.
 */
export class NoActiveCooldownEligibilityRule implements IEligibilityRule {
  public evaluate(student: Student, now: Date): EligibilityResult {
    const penaltyUntil = student.getPenaltyUntil();
    if (penaltyUntil && now.getTime() < penaltyUntil.getTime()) {
      return {
        eligible: false,
        reason: `Student is in 5-hour cooldown penalty until ${penaltyUntil.toISOString()} due to excessive timeouts.`
      };
    }
    return { eligible: true };
  }
}

