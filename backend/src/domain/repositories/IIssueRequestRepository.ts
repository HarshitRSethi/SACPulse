import type { IssueRequest } from '../entities/IssueRequest.js';

/**
 * Persistence delegate interface consumed by `IssueRequestTTLScheduler`.
 */
export interface ITTLPersistenceDelegate {
  markRequestTimedOut(requestId: string): Promise<boolean>;
  countTrailingTimeoutsLastHour(studentId: string): Promise<number>;
  applyStudentPenalty(studentId: string, penaltyUntil: Date): Promise<void>;
  getRequestById(requestId: string): Promise<IssueRequest | null>;
  findAllPendingUnexpiredOrOverdue?(): Promise<IssueRequest[]>;
}

/**
 * SOLID Dependency Inversion Principle (DIP): Abstract IssueRequest Repository Contract.
 */
export interface IIssueRequestRepository extends ITTLPersistenceDelegate {
  create(request: IssueRequest): Promise<IssueRequest>;
  findById(id: string): Promise<IssueRequest | null>;
  findPending(): Promise<IssueRequest[]>;
  findAllPendingStatus(): Promise<IssueRequest[]>;
}

