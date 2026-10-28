import { describe, it, expect } from 'vitest';
import { PenaltyAndEligibilityPolicy } from '../../src/domain.services/PenaltyAndEligibilityPolicy.js';
import { Student } from '../../src/domain.entities/User.js';

describe('PenaltyAndEligibilityPolicy: 3 Strikes in 1 Hour -> 5-Hour Cooldown', () => {
  const policy = new PenaltyAndEligibilityPolicy();

  it('should not apply penalty when strikes in the last hour are <= 3', () => {
    const student = new Student('s-1', 'Student A', 'studenta@iiita.ac.in', 'IIT2023001', '9876543210');
    const now = new Date('2026-10-28T12:00:00Z');

    // 1st strike
    const res1 = policy.evaluateTimeoutPenalty(student, 1, now);
    expect(res1.penaltyApplied).toBe(false);
    expect(res1.penaltyUntil).toBeNull();
    expect(student.getPenaltyUntil()).toBeNull();
    expect(policy.isEligible(student, now).eligible).toBe(true);

    // 2nd strike
    const res2 = policy.evaluateTimeoutPenalty(student, 2, now);
    expect(res2.penaltyApplied).toBe(false);
    expect(res2.penaltyUntil).toBeNull();
    expect(student.getPenaltyUntil()).toBeNull();
    expect(policy.isEligible(student, now).eligible).toBe(true);

    // 3rd strike (at threshold MAX_STRIKES_1HR = 3)
    const res3 = policy.evaluateTimeoutPenalty(student, 3, now);
    expect(res3.penaltyApplied).toBe(false);
    expect(res3.penaltyUntil).toBeNull();
    expect(student.getPenaltyUntil()).toBeNull();
    expect(policy.isEligible(student, now).eligible).toBe(true);
  });

  it('should apply exactly 5-hour cooldown on the 4th strike within 1 hour (> 3 strikes)', () => {
    const student = new Student('s-1', 'Student A', 'studenta@iiita.ac.in', 'IIT2023001', '9876543210');
    const now = new Date('2026-10-28T12:00:00.000Z');
    const expectedExpiry = new Date('2026-10-28T17:00:00.000Z'); // exactly 5 hours later

    // 4th strike (count = 4 > MAX_STRIKES_1HR)
    const res4 = policy.evaluateTimeoutPenalty(student, 4, now);

    expect(res4.penaltyApplied).toBe(true);
    expect(res4.penaltyUntil).toEqual(expectedExpiry);
    expect(student.getPenaltyUntil()).toEqual(expectedExpiry);

    // During cooldown, student is blocked from borrowing or receiving transfers
    const duringCooldown = new Date('2026-10-28T14:30:00.000Z');
    const eligibilityDuring = policy.isEligible(student, duringCooldown);
    expect(eligibilityDuring.eligible).toBe(false);
    expect(eligibilityDuring.reason).toMatch(/5-hour cooldown/);

    expect(() => policy.assertEligible(student, duringCooldown)).toThrowError(/cooldown penalty/);
    expect(student.canBorrowOrReceive(duringCooldown).eligible).toBe(false);
  });

  it('should automatically restore eligibility once the 5-hour cooldown expires', () => {
    const student = new Student('s-1', 'Student A', 'studenta@iiita.ac.in', 'IIT2023001', '9876543210');
    const now = new Date('2026-10-28T12:00:00.000Z');

    policy.evaluateTimeoutPenalty(student, 4, now);

    // After exactly 5 hours and 1 millisecond
    const afterCooldown = new Date('2026-10-28T17:00:00.001Z');
    const eligibilityAfter = policy.isEligible(student, afterCooldown);
    expect(eligibilityAfter.eligible).toBe(true);
    expect(() => policy.assertEligible(student, afterCooldown)).not.toThrow();
    expect(student.canBorrowOrReceive(afterCooldown).eligible).toBe(true);
  });

  it('should prioritize Defaulter lock over cooldown when student damaged SAC property', () => {
    const student = new Student(
      's-1',
      'Student A',
      'studenta@iiita.ac.in',
      'IIT2023001',
      '9876543210',
      true, // isDefaulter = true
      new Date('2026-10-28T17:00:00.000Z')
    );
    const now = new Date('2026-10-28T12:00:00.000Z');

    const result = policy.isEligible(student, now);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/defaulter due to damaged SAC property/);
  });
});
