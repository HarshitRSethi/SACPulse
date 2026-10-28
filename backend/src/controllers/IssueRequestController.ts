import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { UserRepository } from '../infrastructure.persistence/repositories/UserRepository.js';
import { IssueRequestRepository } from '../infrastructure.persistence/repositories/IssueRequestRepository.js';
import { IssueRequestTTLScheduler } from '../domain.services/IssueRequestTTLScheduler.js';
import { PenaltyAndEligibilityPolicy } from '../domain.services/PenaltyAndEligibilityPolicy.js';
import { RealtimeEventHub } from '../domain.services/RealtimeEventHub.js';
import { Student } from '../domain.entities/User.js';
import { IssueRequest, type RequestedItem } from '../domain.entities/IssueRequest.js';

export class IssueRequestController extends BaseController {
  private userRepo: UserRepository;
  private reqRepo: IssueRequestRepository;
  private scheduler: IssueRequestTTLScheduler;
  private policy: PenaltyAndEligibilityPolicy;
  private hub: RealtimeEventHub;

  constructor() {
    super();
    this.userRepo = new UserRepository();
    this.reqRepo = new IssueRequestRepository();
    this.scheduler = IssueRequestTTLScheduler.getInstance();
    this.policy = new PenaltyAndEligibilityPolicy();
    this.hub = RealtimeEventHub.getInstance();
  }

  /**
   * POST /api/issue-requests
   * Blueprint Rule 3 & 4:
   * - 2-step confirm, manual cancel is disabled
   * - Authoritative 2-minute server TTL (expiresAt = createdAt + 120s)
   */
  public createIssueRequest = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { studentId, items } = req.body;

      if (!studentId) {
        return this.clientError(res, 'studentId is required.');
      }
      if (!Array.isArray(items) || items.length === 0) {
        return this.clientError(res, 'Requested items array cannot be empty.');
      }

      // 1. Verify student exists and is eligible
      const user = await this.userRepo.findById(studentId);
      if (!user) {
        return this.notFound(res, `Student with id ${studentId} not found.`);
      }
      if (!(user instanceof Student)) {
        return this.clientError(res, 'Only students can create issue requests.');
      }

      const now = new Date();
      const eligibility = this.policy.isEligible(user, now);
      if (!eligibility.eligible) {
        return this.forbidden(res, `Issue request rejected: ${eligibility.reason}`);
      }

      // Format and validate items
      const requestedItems: RequestedItem[] = items.map((i: any) => ({
        itemId: i.itemId || i.item_id,
        name: i.name,
        qty: Number(i.qty || 1)
      }));

      // 2. Create Domain Entity
      const issueReq = user.createIssueRequest(requestedItems, now);

      // 3. Persist Request
      const saved = await this.reqRepo.create(issueReq);

      // 4. Start Authoritative 120s Server TTL Scheduler
      this.scheduler.scheduleTimeout(saved.getId(), saved.getStudentId(), saved.getExpiresAt());

      // 5. Broadcast to Guard Incoming Queue
      this.hub.notifyGuardQueue(saved, {
        name: user.getName(),
        rollNo: user.getRollNo(),
        mobileNo: user.getMobileNo()
      });

      return this.created(res, {
        id: saved.getId(),
        studentId: saved.getStudentId(),
        studentName: user.getName(),
        rollNo: user.getRollNo(),
        mobileNo: user.getMobileNo(),
        requestedItems: saved.getRequestedItems(),
        status: saved.getStatus(),
        createdAt: saved.getCreatedAt().toISOString(),
        expiresAt: saved.getExpiresAt().toISOString(),
        ttlSeconds: PenaltyAndEligibilityPolicy.REQUEST_TTL_SEC
      });
    } catch (err: any) {
      return this.fail(res, err);
    }
  };

  /**
   * GET /api/guard/requests/pending
   * Returns active live queue for Guard counter with student identity details.
   */
  public getPendingRequests = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const pending = await this.reqRepo.findPending();
      const enriched = await Promise.all(
        pending.map(async (r) => {
          const user = await this.userRepo.findById(r.getStudentId());
          const isStudent = user instanceof Student;
          return {
            id: r.getId(),
            studentId: r.getStudentId(),
            studentName: user ? user.getName() : 'Student',
            rollNo: isStudent ? (user as Student).getRollNo() : null,
            mobileNo: isStudent ? (user as Student).getMobileNo() : null,
            requestedItems: r.getRequestedItems(),
            status: r.getStatus(),
            createdAt: r.getCreatedAt().toISOString(),
            expiresAt: r.getExpiresAt().toISOString(),
            isExpired: r.isExpired()
          };
        })
      );
      return this.ok(res, enriched);
    } catch (err: any) {
      return this.fail(res, err);
    }
  };
}
