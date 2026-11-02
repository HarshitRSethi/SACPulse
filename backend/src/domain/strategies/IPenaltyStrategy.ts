import type { Student } from '../entities/User.js';
import { IneligibleBorrowerException } from '../exceptions/DomainException.js';
import {
  NoActiveCooldownEligibilityRule,
  NotDefaulterEligibilityRule,
  type EligibilityResult,
  type IEligibilityRule
} from './IEligibilityRule.js';

export type { EligibilityResult };

export interface TimeoutPenaltyEvaluationResult {
  penaltyApplied: boolean;
  penaltyUntil: Date | null;
  strikesCount: number;
}

/**
 * GoF Strategy Pattern Interface: IPenaltyStrategy
 *
 * Decouples SAC checkout TTL duration, strike thresholds, and cooldown calculations
 * from `CheckoutService` and `IssueRequestTTLScheduler`, enabling runtime policy swaps
 * (e.g., Standard Semester Policy vs. Peak/Tournament Strict Policy).
 */
export interface IPenaltyStrategy {
  getStrategyName(): string;
  getRequestTtlSeconds(): number;
  getMaxStrikesInWindow(): number;
  getCooldownHours(): number;
  isEligible(student: Student, now?: Date): EligibilityResult;
  assertEligible(student: Student, now?: Date): void;
  calculatePenaltyExpiry(now?: Date): Date;
  evaluateTimeoutPenalty(
    student: Student,
    strikesLast1Hr: number,
    now?: Date
  ): TimeoutPenaltyEvaluationResult;
}

/**
 * Concrete Strategy 1 (Default): SlidingWindowCooldownStrategy
 * Blueprint Rule 5:
 * - 120s authoritative server TTL
 * - > 3 timeouts in trailing 1 hour (4th strike) -> 5-hour cooldown lock
 */
export class SlidingWindowCooldownStrategy implements IPenaltyStrategy {
  public static readonly REQUEST_TTL_SEC = 120;
  public static readonly MAX_STRIKES_1HR = 3;
  public static readonly COOLDOWN_HRS = 5;

  private readonly rules: IEligibilityRule[];

  constructor(rules?: IEligibilityRule[]) {
    this.rules = rules ?? [
      new NotDefaulterEligibilityRule(),
      new NoActiveCooldownEligibilityRule()
    ];
  }

  public getStrategyName(): string {
    return 'SlidingWindowCooldownStrategy';
  }

  public getRequestTtlSeconds(): number {
    return SlidingWindowCooldownStrategy.REQUEST_TTL_SEC;
  }

  public getMaxStrikesInWindow(): number {
    return SlidingWindowCooldownStrategy.MAX_STRIKES_1HR;
  }

  public getCooldownHours(): number {
    return SlidingWindowCooldownStrategy.COOLDOWN_HRS;
  }

  public isEligible(student: Student, now: Date = new Date()): EligibilityResult {
    for (const rule of this.rules) {
      const check = rule.evaluate(student, now);
      if (!check.eligible) {
        return check;
      }
    }
    return { eligible: true };
  }

  public assertEligible(student: Student, now: Date = new Date()): void {
    const result = this.isEligible(student, now);
    if (!result.eligible) {
      throw new IneligibleBorrowerException(
        `Student ${student.getName()} (${student.getRollNo()}) is ineligible: ${result.reason}`
      );
    }
  }

  public calculatePenaltyExpiry(now: Date = new Date()): Date {
    return new Date(now.getTime() + this.getCooldownHours() * 60 * 60 * 1000);
  }

  public evaluateTimeoutPenalty(
    student: Student,
    strikesLast1Hr: number,
    now: Date = new Date()
  ): TimeoutPenaltyEvaluationResult {
    if (strikesLast1Hr > this.getMaxStrikesInWindow()) {
      const penaltyUntil = this.calculatePenaltyExpiry(now);
      student.imposeCooldown(penaltyUntil);
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

/**
 * Concrete Strategy 2: StrictPeakHoursPenaltyStrategy
 * Interchangeable GoF Strategy for high-congestion evening tournaments or exam-week limits:
 * - Tighter 90s walk-up TTL
 * - > 1 timeout in trailing 1 hour (2nd strike) -> 12-hour cooldown lock
 */
export class StrictPeakHoursPenaltyStrategy implements IPenaltyStrategy {
  public static readonly REQUEST_TTL_SEC = 90;
  public static readonly MAX_STRIKES_1HR = 1;
  public static readonly COOLDOWN_HRS = 12;

  private readonly rules: IEligibilityRule[];

  constructor(rules?: IEligibilityRule[]) {
    this.rules = rules ?? [
      new NotDefaulterEligibilityRule(),
      new NoActiveCooldownEligibilityRule()
    ];
  }

  public getStrategyName(): string {
    return 'StrictPeakHoursPenaltyStrategy';
  }

  public getRequestTtlSeconds(): number {
    return StrictPeakHoursPenaltyStrategy.REQUEST_TTL_SEC;
  }

  public getMaxStrikesInWindow(): number {
    return StrictPeakHoursPenaltyStrategy.MAX_STRIKES_1HR;
  }

  public getCooldownHours(): number {
    return StrictPeakHoursPenaltyStrategy.COOLDOWN_HRS;
  }

  public isEligible(student: Student, now: Date = new Date()): EligibilityResult {
    for (const rule of this.rules) {
      const check = rule.evaluate(student, now);
      if (!check.eligible) {
        return check;
      }
    }
    return { eligible: true };
  }

  public assertEligible(student: Student, now: Date = new Date()): void {
    const result = this.isEligible(student, now);
    if (!result.eligible) {
      throw new IneligibleBorrowerException(
        `Student ${student.getName()} (${student.getRollNo()}) is ineligible: ${result.reason}`
      );
    }
  }

  public calculatePenaltyExpiry(now: Date = new Date()): Date {
    return new Date(now.getTime() + this.getCooldownHours() * 60 * 60 * 1000);
  }

  public evaluateTimeoutPenalty(
    student: Student,
    strikesLast1Hr: number,
    now: Date = new Date()
  ): TimeoutPenaltyEvaluationResult {
    if (strikesLast1Hr > this.getMaxStrikesInWindow()) {
      const penaltyUntil = this.calculatePenaltyExpiry(now);
      student.imposeCooldown(penaltyUntil);
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

/**
 * Domain Policy Context wrapping an injected IPenaltyStrategy (defaults to SlidingWindowCooldownStrategy).
 */
export class PenaltyAndEligibilityPolicy {
  public static readonly REQUEST_TTL_SEC = SlidingWindowCooldownStrategy.REQUEST_TTL_SEC;
  public static readonly MAX_STRIKES_1HR = SlidingWindowCooldownStrategy.MAX_STRIKES_1HR;
  public static readonly COOLDOWN_HRS = SlidingWindowCooldownStrategy.COOLDOWN_HRS;

  private strategy: IPenaltyStrategy;

  constructor(strategy: IPenaltyStrategy = new SlidingWindowCooldownStrategy()) {
    this.strategy = strategy;
  }

  public setStrategy(strategy: IPenaltyStrategy): void {
    this.strategy = strategy;
  }

  public getStrategy(): IPenaltyStrategy {
    return this.strategy;
  }

  public isEligible(student: Student, now: Date = new Date()): EligibilityResult {
    return this.strategy.isEligible(student, now);
  }

  public assertEligible(student: Student, now: Date = new Date()): void {
    this.strategy.assertEligible(student, now);
  }

  public calculatePenaltyExpiry(now: Date = new Date()): Date {
    return this.strategy.calculatePenaltyExpiry(now);
  }

  public evaluateTimeoutPenalty(
    student: Student,
    strikesLast1Hr: number,
    now: Date = new Date()
  ): TimeoutPenaltyEvaluationResult {
    return this.strategy.evaluateTimeoutPenalty(student, strikesLast1Hr, now);
  }
}

