import { CheckoutBatch, type ActiveBatchDTO } from '../../domain/entities/CheckoutBatch.js';
import type { SACItem } from '../../domain/entities/SACItem.js';
import { Guard, Student } from '../../domain/entities/User.js';
import {
  EntityNotFoundException,
  RequestExpiredException,
  UnauthorizedRoleException,
  ValidationException
} from '../../domain/exceptions/DomainException.js';
import type { IIssueRequestRepository } from '../../domain/repositories/IIssueRequestRepository.js';
import type { IRegisterLogRepository } from '../../domain/repositories/IRegisterLogRepository.js';
import type { ISACItemRepository } from '../../domain/repositories/ISACItemRepository.js';
import type { IUserRepository } from '../../domain/repositories/IUserRepository.js';
import { IssueRequestTTLScheduler } from './IssueRequestTTLScheduler.js';
import { RealtimeEventHub } from './RealtimeEventHub.js';

/**
 * GuardCounterService
 *
 * Orchestrates SAC Counter operations by hydrating Domain Entities (`Guard`, `IssueRequest`,
 * `SACItem`, `RegisterEntry`, `CheckoutBatch`, `Student`), executing OOP GoF State & Template
 * Method invariants first, committing ACID persistence transactions, and emitting real-time updates.
 */
export class GuardCounterService {
  private readonly userRepo: IUserRepository;
  private readonly itemRepo: ISACItemRepository;
  private readonly issueRequestRepo: IIssueRequestRepository;
  private readonly registerLogRepo: IRegisterLogRepository;
  private readonly scheduler: IssueRequestTTLScheduler;
  private readonly hub: RealtimeEventHub;

  constructor(
    userRepo: IUserRepository,
    itemRepo: ISACItemRepository,
    issueRequestRepo: IIssueRequestRepository,
    registerLogRepo: IRegisterLogRepository,
    scheduler: IssueRequestTTLScheduler = IssueRequestTTLScheduler.getInstance(),
    hub: RealtimeEventHub = RealtimeEventHub.getInstance()
  ) {
    this.userRepo = userRepo;
    this.itemRepo = itemRepo;
    this.issueRequestRepo = issueRequestRepo;
    this.registerLogRepo = registerLogRepo;
    this.scheduler = scheduler;
    this.hub = hub;
  }

  public async approveRequest(requestId: string, guardId: string, now: Date = new Date()) {
    if (!guardId) {
      throw new ValidationException('guardId is required.');
    }

    const [approver, issueRequest] = await Promise.all([
      this.userRepo.findById(guardId),
      this.issueRequestRepo.findById(requestId)
    ]);

    if (!approver) {
      throw new EntityNotFoundException('Guard', guardId);
    }
    if (approver.getRole() !== 'GUARD' && approver.getRole() !== 'ADMIN') {
      throw new UnauthorizedRoleException('Only Guard or Admin personnel can approve counter requests.');
    }
    if (!issueRequest) {
      throw new EntityNotFoundException('IssueRequest', requestId);
    }

    // Hydrate requested SACItems so Template Method `item.checkout(qty, now)` validates stock/occupancy
    const itemsMap = new Map<string, SACItem>();
    for (const line of issueRequest.getLineItems()) {
      if (!itemsMap.has(line.getItemId())) {
        const item = await this.itemRepo.findById(line.getItemId());
        if (!item) {
          throw new EntityNotFoundException('SACItem', line.getItemId());
        }
        itemsMap.set(item.getId(), item);
      }
    }

    // Execute OOP Domain Logic first (enforcing 120s TTL, PENDING state, and Template Method stock rules)
    try {
      if (approver instanceof Guard) {
        approver.approveRequest(issueRequest, now, itemsMap);
      } else {
        issueRequest.markApproved(guardId, now);
        for (const line of issueRequest.getLineItems()) {
          itemsMap.get(line.getItemId())!.checkout(line.getQty(), now);
        }
      }
    } catch (err) {
      if (err instanceof RequestExpiredException) {
        await this.issueRequestRepo.markRequestTimedOut(requestId);
        this.scheduler.cancelTimeout(requestId);
      }
      throw err;
    }

    // Commit ACID Row-Locking Persistence Transaction
    const result = await this.registerLogRepo.approveIssueRequestTx(requestId, guardId);

    this.scheduler.cancelTimeout(requestId);

    this.hub.emit('GUARD_QUEUE_UPDATED', {
      requestId,
      studentId: result.student_id,
      status: 'APPROVED',
      approvedById: guardId,
      timestamp: new Date().toISOString()
    });

    this.hub.notifyStudent(result.student_id, 'REQUEST_APPROVED', {
      requestId,
      batchId: result.batch_id,
      unitsIssued: result.units_issued,
      message: 'Your items have been issued at the SAC Counter!'
    });

    const updatedInventory = await this.itemRepo.findAll();
    for (const item of updatedInventory) {
      this.hub.broadcastInventoryUpdate(item);
    }

    return {
      message: 'Request approved successfully and units registered.',
      batchId: result.batch_id,
      unitsIssued: result.units_issued,
      studentId: result.student_id
    };
  }

  public async returnUnitIntact(entryId: string, now: Date = new Date()) {
    const entry = await this.registerLogRepo.findById(entryId);
    if (!entry) {
      throw new EntityNotFoundException('RegisterEntry', entryId);
    }

    const item = await this.itemRepo.findById(entry.getItemId());
    if (!item) {
      throw new EntityNotFoundException('SACItem', entry.getItemId());
    }

    const fromStudentId = entry.getStudentId();
    const toStudentId = entry.getPendingTransferToId();

    // Execute GoF State Pattern (`entry.closeOnGuardReturn`) + GoF Template Method (`item.checkin`)
    entry.closeOnGuardReturn(false, now);
    item.checkin(1, false, now);

    const result = await this.registerLogRepo.closeGuardReturnTx(entryId, false);

    this.hub.emit('TRANSFER_STATE_CHANGED', {
      entryId,
      fromStudentId,
      toStudentId,
      status: 'RETURNED',
      pendingTransferToId: null,
      timestamp: new Date().toISOString()
    });

    const updatedItem = await this.itemRepo.findById(result.item_id);
    if (updatedItem) {
      this.hub.broadcastInventoryUpdate(updatedItem);
    }

    return {
      message: 'Unit returned intact successfully.',
      entryId,
      status: 'RETURNED' as const
    };
  }

  public async returnBatchIntact(batchId: string, now: Date = new Date()) {
    const activeEntries = await this.registerLogRepo.findActive({ batchId });
    const involvedStudentIds = Array.from(
      new Set(
        activeEntries.flatMap((e) =>
          [e.getStudentId(), e.getPendingTransferToId()].filter(
            (id): id is string => typeof id === 'string' && id.length > 0
          )
        )
      )
    );

    if (activeEntries.length > 0) {
      const batch = new CheckoutBatch(batchId, activeEntries);
      const itemsMap = new Map<string, SACItem>();
      for (const entry of activeEntries) {
        if (!itemsMap.has(entry.getItemId())) {
          const item = await this.itemRepo.findById(entry.getItemId());
          if (!item) {
            throw new EntityNotFoundException('SACItem', entry.getItemId());
          }
          itemsMap.set(item.getId(), item);
        }
      }
      // Execute Composite batch intact return across all active RegisterEntries and SACItems
      batch.returnAllActiveIntact(itemsMap, now);
    }

    const result = await this.registerLogRepo.closeGuardBatchReturnTx(batchId);

    this.hub.emit('TRANSFER_STATE_CHANGED', {
      batchId,
      studentIds: involvedStudentIds,
      status: 'RETURNED',
      timestamp: new Date().toISOString()
    });

    const inventory = await this.itemRepo.findAll();
    for (const item of inventory) {
      this.hub.broadcastInventoryUpdate(item);
    }

    return {
      message: 'Entire batch returned intact successfully.',
      batchId: result.batch_id,
      returnedCount: result.returned_count
    };
  }

  public async returnUnitDamaged(entryId: string, now: Date = new Date()) {
    const entry = await this.registerLogRepo.findById(entryId);
    if (!entry) {
      throw new EntityNotFoundException('RegisterEntry', entryId);
    }

    const [item, holder] = await Promise.all([
      this.itemRepo.findById(entry.getItemId()),
      this.userRepo.findById(entry.getStudentId())
    ]);

    if (!item) {
      throw new EntityNotFoundException('SACItem', entry.getItemId());
    }

    const fromStudentId = entry.getStudentId();
    const toStudentId = entry.getPendingTransferToId();

    // Execute GoF State Pattern + polymorphic Template Method (`item.checkin(1, true, now)`) + Defaulter lock
    entry.closeOnGuardReturn(true, now);
    item.checkin(1, true, now);
    if (holder instanceof Student) {
      holder.flagAsDefaulter();
    }

    const result = await this.registerLogRepo.closeGuardReturnTx(entryId, true);

    this.hub.emit('TRANSFER_STATE_CHANGED', {
      entryId,
      fromStudentId,
      toStudentId,
      status: 'DAMAGED',
      pendingTransferToId: null,
      timestamp: new Date().toISOString()
    });

    this.hub.notifyStudent(result.student_id, 'DEFAULTER_LOCKED', {
      message:
        'You have been marked as a DEFAULTER due to returning damaged SAC property. Admin approval is required to unblock.',
      entryId
    });

    const updatedItem = await this.itemRepo.findById(result.item_id);
    if (updatedItem) {
      this.hub.broadcastInventoryUpdate(updatedItem);
    }

    return {
      message: 'Unit marked as DAMAGED. Student holder is now locked as a DEFAULTER.',
      entryId,
      status: 'DAMAGED' as const,
      studentId: result.student_id
    };
  }

  public async getActiveRegister(): Promise<ActiveBatchDTO[]> {
    const activeEntries = await this.registerLogRepo.findActive();
    return CheckoutBatch.groupActiveHoldingsForGuardDesk(activeEntries);
  }

  public async facultyOccupyRoom(itemId: string, now: Date = new Date()) {
    const item = await this.itemRepo.findById(itemId);
    if (!item) {
      throw new EntityNotFoundException('Item', itemId);
    }
    if (item.getItemType() !== 'ROOM_KEY') {
      throw new ValidationException('Item is not an activity room key.');
    }

    // Executes GoF Template Method `RoomKey.checkout(1, now)` (throws 409 InvalidStateTransitionException if already occupied)
    item.checkout(1, now);
    await this.itemRepo.save(item);

    this.hub.broadcastInventoryUpdate(item);

    const dto = item.toInventoryDTO();
    return {
      message: `Room '${item.getName()}' occupied for faculty / event.`,
      item: {
        id: dto.id,
        name: dto.name,
        category: dto.category,
        itemType: dto.itemType,
        availableQty: dto.availableQty,
        occupiedSince: dto.occupiedSince ?? null
      }
    };
  }

  public async releaseRoom(itemId: string, now: Date = new Date()) {
    const item = await this.itemRepo.findById(itemId);
    if (!item) {
      throw new EntityNotFoundException('Item', itemId);
    }
    if (item.getItemType() !== 'ROOM_KEY') {
      throw new ValidationException('Item is not an activity room key.');
    }

    // Executes GoF Template Method `RoomKey.checkin(1, false, now)`
    item.checkin(1, false, now);
    await this.itemRepo.save(item);

    this.hub.broadcastInventoryUpdate(item);

    return {
      message: `Room '${item.getName()}' released successfully.`,
      item: {
        id: item.getId(),
        name: item.getName(),
        category: item.getCategory(),
        itemType: item.getItemType(),
        availableQty: item.getAvailableQty(),
        occupiedSince: null
      }
    };
  }
}
