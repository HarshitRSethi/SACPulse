import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AccessRestrictedException,
  AuthenticationException,
  DomainException,
  EntityNotFoundException,
  IneligibleBorrowerException,
  InsufficientStockException,
  InvalidStateTransitionException,
  RequestExpiredException,
  UnauthorizedRoleException,
  ValidationException
} from '../../src/domain/exceptions/DomainException.js';
import {
  DamagedState,
  IssuedState,
  ReturnedState,
  ReturnedViaTransferState,
  TransferPendingState,
  createRegisterEntryState
} from '../../src/domain/states/IRegisterEntryState.js';
import { RegisterEntry } from '../../src/domain/entities/RegisterEntry.js';
import { CheckoutBatch } from '../../src/domain/entities/CheckoutBatch.js';
import { InventoryCatalog } from '../../src/domain/entities/InventoryCatalog.js';
import { IssueRequest, RequestLineItem } from '../../src/domain/entities/IssueRequest.js';
import { RoomKey, SportsEquipment, type SACItem } from '../../src/domain/entities/SACItem.js';
import { Admin, Guard, Student } from '../../src/domain/entities/User.js';
import {
  PenaltyAndEligibilityPolicy,
  SlidingWindowCooldownStrategy,
  StrictPeakHoursPenaltyStrategy
} from '../../src/domain/strategies/IPenaltyStrategy.js';
import { SACItemFactory } from '../../src/domain/factories/SACItemFactory.js';
import { UserFactory } from '../../src/domain/factories/UserFactory.js';
import { JwtTokenService } from '../../src/application/services/JwtTokenService.js';
import {
  IssueRequestTTLScheduler,
  type ITTLPersistenceDelegate
} from '../../src/application/services/IssueRequestTTLScheduler.js';

describe('Phase 1 & 2 OOP Unit Verification: 6 GoF Patterns, Relationships & Security', () => {
  afterEach(() => {
    vi.useRealTimers();
    IssueRequestTTLScheduler.getInstance().clearAll();
    IssueRequestTTLScheduler.getInstance().setPenaltyStrategy(new SlidingWindowCooldownStrategy());
  });

  describe('1. Custom DomainException Hierarchy & HTTP Status Semantics', () => {
    it('maps every concrete DomainException subclass to its deterministic HTTP status and error code', () => {
      const cases: Array<[DomainException, number, string]> = [
        [new ValidationException('bad input'), 400, 'VALIDATION_ERROR'],
        [new AuthenticationException('bad token'), 401, 'AUTHENTICATION_ERROR'],
        [
          new AccessRestrictedException('restricted', { whitelistStatus: 'PENDING' }),
          403,
          'ACCESS_RESTRICTED'
        ],
        [new UnauthorizedRoleException('forbidden role'), 403, 'UNAUTHORIZED_ROLE'],
        [new IneligibleBorrowerException('defaulter'), 403, 'INELIGIBLE_BORROWER'],
        [new EntityNotFoundException('SACItem', 'id-1'), 404, 'ENTITY_NOT_FOUND'],
        [new InsufficientStockException('TT Racket', 3, 1), 409, 'INSUFFICIENT_STOCK'],
        [new InvalidStateTransitionException('illegal transition'), 409, 'INVALID_STATE_TRANSITION'],
        [new RequestExpiredException('expired'), 409, 'REQUEST_EXPIRED']
      ];

      for (const [err, expectedStatus, expectedCode] of cases) {
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(DomainException);
        expect(err.statusCode).toBe(expectedStatus);
        expect(err.code).toBe(expectedCode);
      }

      const restricted = cases[2][0] as AccessRestrictedException;
      expect(restricted.details?.whitelistStatus).toBe('PENDING');
    });
  });

  describe('2. GoF State Pattern: IRegisterEntryState & RegisterEntry Lifecycle', () => {
    const studentA = new Student('s-a', 'Student A', 'a@iiita.ac.in', 'IIT2023001', '9876543210');
    const studentB = new Student('s-b', 'Student B', 'b@iiita.ac.in', 'IIT2023002', '9876543211');

    it('resolves concrete state objects and enforces legal vs illegal transitions', () => {
      expect(createRegisterEntryState('ISSUED')).toBeInstanceOf(IssuedState);
      expect(createRegisterEntryState('ISSUED_TRANSFER_PENDING', 's-b')).toBeInstanceOf(
        TransferPendingState
      );
      expect(createRegisterEntryState('RETURNED')).toBeInstanceOf(ReturnedState);
      expect(createRegisterEntryState('RETURNED_VIA_TRANSFER')).toBeInstanceOf(
        ReturnedViaTransferState
      );
      expect(createRegisterEntryState('DAMAGED')).toBeInstanceOf(DamagedState);

      const entry = new RegisterEntry(
        'e-1',
        'b-1',
        studentA.getId(),
        studentA.getName(),
        studentA.getRollNo(),
        studentA.getMobileNo()!,
        'i-1',
        'TT Racket',
        'Table Tennis'
      );

      // Illegal: cannot cancel or accept transfer while in IssuedState
      expect(() => entry.cancelTransfer()).toThrow(InvalidStateTransitionException);
      expect(() => entry.completeAtomicTransfer(studentB)).toThrow(InvalidStateTransitionException);

      // Legal: IssuedState -> TransferPendingState
      entry.lockForTransfer(studentB.getId());
      expect(entry.getState()).toBeInstanceOf(TransferPendingState);
      expect(entry.isActiveHolding()).toBe(true);

      // Illegal: cannot re-initiate transfer while already TransferPendingState
      expect(() => entry.lockForTransfer('s-c')).toThrow(InvalidStateTransitionException);

      // Legal: TransferPendingState -> ReturnedState (Guard physical return overrides pending P2P)
      entry.closeOnGuardReturn(false);
      expect(entry.getState()).toBeInstanceOf(ReturnedState);
      expect(entry.isActiveHolding()).toBe(false);
      expect(entry.getPendingTransferToId()).toBeNull();

      // Terminal State: all further mutations throw InvalidStateTransitionException (409)
      expect(() => entry.lockForTransfer(studentB.getId())).toThrow(
        InvalidStateTransitionException
      );
      expect(() => entry.cancelTransfer()).toThrow(InvalidStateTransitionException);
      expect(() => entry.completeAtomicTransfer(studentB)).toThrow(InvalidStateTransitionException);
      expect(() => entry.closeOnGuardReturn(true)).toThrow(InvalidStateTransitionException);
    });
  });

  describe('3. GoF Template Method Pattern & Polymorphism: SACItem -> SportsEquipment | RoomKey', () => {
    it('executes invariant checkout()/checkin() skeletons and polymorphic projections without instanceof', () => {
      const now = new Date('2026-10-31T10:00:00.000Z');
      const eq = new SportsEquipment('eq-1', 'Badminton Racket', 'Badminton', 6, 6, 0);
      const rk = new RoomKey('rk-1', 'Music Room Key', 'Activity Rooms', 1, 1, null);

      const catalogItems: SACItem[] = [eq, rk];

      expect(eq.getMaxAllocatablePerCheckout()).toBe(6);
      expect(rk.getMaxAllocatablePerCheckout()).toBe(1);

      // Polymorphic checkout() template method
      eq.checkout(2, now);
      rk.checkout(1, now);

      expect(eq.getAvailableQty()).toBe(4);
      expect(eq.getLastMutatedAt()).toEqual(now);
      expect(rk.getAvailableQty()).toBe(0);
      expect(rk.getOccupiedSince()).toEqual(now);

      // Polymorphic DTO & persistence projections
      const activeIds = new Set<string>(); // Room occupied without student checkout => faculty session!
      const dtos = catalogItems.map((item) => item.toInventoryDTO(activeIds));
      expect(dtos[0].damagedQty).toBe(0);
      expect(dtos[1].isFacultySession).toBe(true);
      expect(dtos[1].hasActiveStudentCheckout).toBe(false);

      const realtimePayloads = catalogItems.map((item) => item.toRealtimePayload());
      expect(realtimePayloads[0].availableQty).toBe(4);
      expect(realtimePayloads[1].occupiedSince).toBe(now.toISOString());

      const records = catalogItems.map((item) => item.toPersistenceRecord());
      expect(records[0].item_type).toBe('EQUIPMENT');
      expect(records[1].item_type).toBe('ROOM_KEY');

      // Polymorphic checkin() template method: damage vs intact
      eq.checkin(1, true, now);
      expect(eq.getDamagedQty()).toBe(1);
      expect(eq.getAvailableQty()).toBe(4); // Damaged unit does not re-enter available pool

      // RoomKey rejects multi-unit release via ValidationException and restores single-unit release
      expect(() => rk.checkin(2, false, now)).toThrow(ValidationException);
      rk.checkin(1, false, now);
      expect(rk.getAvailableQty()).toBe(1);
      expect(rk.getOccupiedSince()).toBeNull();
    });
  });

  describe('4. GoF Strategy Pattern: IPenaltyStrategy Runtime Swapping', () => {
    it('supports runtime substitution between SlidingWindowCooldownStrategy and StrictPeakHoursPenaltyStrategy', () => {
      const now = new Date('2026-10-31T14:00:00.000Z');
      const studentA = new Student('s-1', 'Student 1', 's1@iiita.ac.in', 'IIT2023010', '9876543210');
      const studentB = new Student('s-2', 'Student 2', 's2@iiita.ac.in', 'IIT2023011', '9876543211');

      const standardStrategy = new SlidingWindowCooldownStrategy();
      const strictStrategy = new StrictPeakHoursPenaltyStrategy();

      expect(standardStrategy.getRequestTtlSeconds()).toBe(120);
      expect(strictStrategy.getRequestTtlSeconds()).toBe(90);

      const policy = new PenaltyAndEligibilityPolicy(standardStrategy);

      // Under standard strategy, 2 strikes in 1 hour does NOT trigger a cooldown (max is 3)
      const resStandard = policy.evaluateTimeoutPenalty(studentA, 2, now);
      expect(resStandard.penaltyApplied).toBe(false);

      // Swap strategy at runtime to StrictPeakHoursPenaltyStrategy (>1 strike -> 12h cooldown)
      policy.setStrategy(strictStrategy);
      expect(policy.getStrategy().getStrategyName()).toBe('StrictPeakHoursPenaltyStrategy');

      const resStrict = policy.evaluateTimeoutPenalty(studentB, 2, now);
      expect(resStrict.penaltyApplied).toBe(true);
      expect(resStrict.penaltyUntil).toEqual(
        new Date(now.getTime() + 12 * 60 * 60 * 1000)
      );
      expect(() => policy.assertEligible(studentB, now)).toThrow(IneligibleBorrowerException);
    });
  });

  describe('5. GoF Factory Method Pattern: SACItemFactory & UserFactory', () => {
    it('instantiates concrete SACItem and User subclasses and rejects unknown discriminators', () => {
      const eq = SACItemFactory.create({
        name: 'Carrom Striker',
        category: 'Carrom',
        itemType: 'EQUIPMENT',
        totalQty: 4,
        availableQty: 4
      });
      const rk = SACItemFactory.fromDatabaseRow({
        id: 'rk-99',
        name: 'Drama Room Key',
        category: 'Activity Rooms',
        item_type: 'ROOM_KEY',
        total_qty: 1,
        available_qty: 1,
        occupied_since: null
      });

      expect(eq).toBeInstanceOf(SportsEquipment);
      expect(rk).toBeInstanceOf(RoomKey);
      expect(() =>
        SACItemFactory.create({
          name: 'Invalid',
          category: 'Misc',
          itemType: 'DRONE' as any
        })
      ).toThrow(ValidationException);

      const student = UserFactory.fromDatabaseRow({
        id: 'u-1',
        name: 'Student',
        email: 'iit2024001@iiita.ac.in',
        role: 'STUDENT'
      });
      const guard = UserFactory.create({
        name: 'Guard',
        email: 'guard@iiita.ac.in',
        role: 'GUARD'
      });
      const admin = UserFactory.create({
        name: 'Admin',
        email: 'admin@iiita.ac.in',
        role: 'ADMIN'
      });

      expect(student).toBeInstanceOf(Student);
      expect(student.getDashboardRoute()).toBe('/student');
      expect(guard).toBeInstanceOf(Guard);
      expect(guard.getDashboardRoute()).toBe('/guard');
      expect(admin).toBeInstanceOf(Admin);
      expect(admin.getDashboardRoute()).toBe('/admin');

      expect(() =>
        UserFactory.create({
          name: 'Unknown',
          email: 'x@iiita.ac.in',
          role: 'SUPERUSER' as any
        })
      ).toThrow(ValidationException);
    });
  });

  describe('6. OOP Composition (*--) & Aggregation (o--)', () => {
    it('Composition: CheckoutBatch groups peer-transferred splits accurately and returns active units intact', () => {
      const racket = new SportsEquipment('eq-tt', 'TT Racket', 'Table Tennis', 6, 4, 0);
      const entryA = new RegisterEntry(
        'e-a',
        'batch-500',
        's-a',
        'Student A',
        'IIT2023001',
        '9876543210',
        racket.getId(),
        racket.getName(),
        racket.getCategory()
      );
      const entryB = new RegisterEntry(
        'e-b',
        'batch-500',
        's-b',
        'Student B',
        'IIT2023002',
        '9876543211',
        racket.getId(),
        racket.getName(),
        racket.getCategory()
      );

      const deskCards = CheckoutBatch.groupActiveHoldingsForGuardDesk([entryA, entryB]);
      expect(deskCards).toHaveLength(2);
      expect(deskCards[0].studentName).toBe('Student A');
      expect(deskCards[1].studentName).toBe('Student B');

      const batch = new CheckoutBatch('batch-500', [entryA, entryB]);
      const returnedCount = batch.returnAllActiveIntact(new Map([[racket.getId(), racket]]));
      expect(returnedCount).toBe(2);
      expect(racket.getAvailableQty()).toBe(6);
      expect(batch.getActiveUnits()).toHaveLength(0);
    });

    it('Composition: IssueRequest owns immutable RequestLineItem value objects', () => {
      const req = new IssueRequest('req-1', 's-a', [
        { itemId: 'i-1', name: 'TT Racket', qty: 2 },
        { itemId: 'i-2', name: 'TT Ball', qty: 1 }
      ]);
      const lineItems = req.getLineItems();
      expect(lineItems).toHaveLength(2);
      expect(lineItems[0]).toBeInstanceOf(RequestLineItem);
      expect(req.getTotalRequestedUnits()).toBe(3);

      expect(() => new IssueRequest('req-bad', 's-a', [])).toThrow(ValidationException);
      expect(() => new RequestLineItem('i-1', 'TT Racket', 0)).toThrow(ValidationException);
    });

    it('Aggregation: InventoryCatalog aggregates independent SACItem instances for search & metrics', () => {
      const eq = new SportsEquipment('eq-1', 'Chess Set', 'Board Games', 5, 3, 0);
      const rk = new RoomKey(
        'rk-1',
        'Dance Room Key',
        'Activity Rooms',
        1,
        0,
        new Date('2026-10-31T08:00:00Z')
      );

      let catalog: InventoryCatalog | null = new InventoryCatalog([eq, rk]);
      expect(catalog.search('chess')).toHaveLength(1);
      expect(catalog.filterByCategory('Activity Rooms')).toHaveLength(1);

      const metrics = catalog.computeMetrics();
      expect(metrics.totalDistinctItems).toBe(2);
      expect(metrics.totalPhysicalUnits).toBe(6);
      expect(metrics.availablePhysicalUnits).toBe(3);
      expect(metrics.occupiedRoomsCount).toBe(1);

      catalog = null;
      expect(eq.getName()).toBe('Chess Set');
      expect(rk.getName()).toBe('Dance Room Key');
    });
  });

  describe('7. Security & Crash Recovery: JwtTokenService & Boot-Time TTL Sweep', () => {
    it('signs and verifies HMAC-SHA256 JWTs and rejects tampered or expired tokens', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));

      const jwt = new JwtTokenService('unit-test-256-bit-hmac-secret-key');
      const token = jwt.sign(
        {
          userId: 'u-100',
          email: 'studenta@iiita.ac.in',
          role: 'STUDENT'
        },
        60 // 60-second expiry
      );

      const verified = jwt.verify(token);
      expect(verified.userId).toBe('u-100');
      expect(verified.role).toBe('STUDENT');

      // Tamper payload (attempt privilege escalation STUDENT -> ADMIN)
      const [header, , signature] = token.split('.');
      const forgedPayload = Buffer.from(
        JSON.stringify({
          userId: 'u-100',
          email: 'studenta@iiita.ac.in',
          role: 'ADMIN',
          exp: 9999999999
        })
      ).toString('base64url');
      expect(() => jwt.verify(`${header}.${forgedPayload}.${signature}`)).toThrow(
        AuthenticationException
      );

      // Advance past 60s expiry
      vi.advanceTimersByTime(61 * 1000);
      expect(() => jwt.verify(token)).toThrow(/expired/i);
    });

    it('recovers pending IssueRequests on server restart: immediately expires overdue & reschedules active', async () => {
      vi.useFakeTimers();
      const bootTime = new Date('2026-10-31T15:00:00.000Z');
      vi.setSystemTime(bootTime);

      const overdueReq = new IssueRequest(
        'req-overdue',
        's-1',
        [{ itemId: 'i-1', name: 'TT Racket', qty: 1 }],
        'PENDING',
        new Date(bootTime.getTime() - 180 * 1000),
        new Date(bootTime.getTime() - 60 * 1000)
      );

      const activeReq = new IssueRequest(
        'req-active',
        's-2',
        [{ itemId: 'i-1', name: 'TT Racket', qty: 1 }],
        'PENDING',
        new Date(bootTime.getTime() - 30 * 1000),
        new Date(bootTime.getTime() + 90 * 1000)
      );

      const expiredIds: string[] = [];
      const delegate: ITTLPersistenceDelegate = {
        markRequestTimedOut: vi.fn(async (id: string) => {
          expiredIds.push(id);
          return true;
        }),
        countTrailingTimeoutsLastHour: vi.fn(async () => 1),
        applyStudentPenalty: vi.fn(async () => {}),
        getRequestById: vi.fn(async (id: string) =>
          id === 'req-overdue' ? overdueReq : activeReq
        ),
        findAllPendingUnexpiredOrOverdue: vi.fn(async () => [overdueReq, activeReq])
      };

      const scheduler = IssueRequestTTLScheduler.getInstance();
      scheduler.setPersistenceDelegate(delegate);

      const recovery = await scheduler.recoverPendingRequests();
      expect(recovery.expiredImmediately).toBe(1);
      expect(recovery.rescheduled).toBe(1);
      expect(expiredIds).toContain('req-overdue');
      expect(expiredIds).not.toContain('req-active');

      // Advance 91s: rescheduled active request now expires cleanly
      await vi.advanceTimersByTimeAsync(91 * 1000);
      expect(expiredIds).toContain('req-active');
    });
  });
});
