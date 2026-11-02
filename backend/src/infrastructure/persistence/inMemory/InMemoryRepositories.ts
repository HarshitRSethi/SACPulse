import crypto from 'crypto';
import { CheckoutBatch } from '../../../domain/entities/CheckoutBatch.js';
import { IssueRequest } from '../../../domain/entities/IssueRequest.js';
import { RegisterEntry } from '../../../domain/entities/RegisterEntry.js';
import type { SACItem } from '../../../domain/entities/SACItem.js';
import { Guard, Student, type User, type UserRole } from '../../../domain/entities/User.js';
import {
  EntityNotFoundException,
  InvalidStateTransitionException,
  ValidationException
} from '../../../domain/exceptions/DomainException.js';
import { SACItemFactory } from '../../../domain/factories/SACItemFactory.js';
import { UserFactory } from '../../../domain/factories/UserFactory.js';
import type { IIssueRequestRepository } from '../../../domain/repositories/IIssueRequestRepository.js';
import type {
  ApproveIssueTxResult,
  GuardBatchReturnTxResult,
  GuardReturnTxResult,
  IRegisterLogRepository,
  MasterLogQueryOptions,
  MasterLogRow,
  MasterLogsResult,
  TransferSplitTxResult
} from '../../../domain/repositories/IRegisterLogRepository.js';
import type { ISACItemRepository } from '../../../domain/repositories/ISACItemRepository.js';
import type {
  IUserRepository,
  WhitelistedStaffRecord,
  WhitelistRequestRecord
} from '../../../domain/repositories/IUserRepository.js';

/**
 * Shared In-Memory Persistence Store
 * Enables fast, deterministic, offline System & CI tests via SOLID Dependency Inversion (DIP)
 * without mutating shared cloud database rows.
 */
export class InMemoryDatabaseStore {
  public readonly users = new Map<string, User>();
  public readonly items = new Map<string, SACItem>();
  public readonly issueRequests = new Map<string, IssueRequest>();
  public readonly registerEntries = new Map<string, RegisterEntry>();
  public readonly whitelistedStaff = new Map<string, WhitelistedStaffRecord>();
  public readonly whitelistRequests = new Map<string, WhitelistRequestRecord>();

  public seedDefaults(): void {
    const seedUsers: User[] = [
      UserFactory.create({
        id: '0369ef9a-838b-4690-bf2c-6c8f0ba75576',
        email: 'studenta@iiita.ac.in',
        rollNo: 'IIT2023001',
        name: 'Student A',
        mobileNo: '9876543210',
        role: 'STUDENT'
      }),
      UserFactory.create({
        id: '15661c05-f5bb-413a-81db-6038ac42ff41',
        email: 'studentb@iiita.ac.in',
        rollNo: 'IIT2023002',
        name: 'Student B',
        mobileNo: '9876543211',
        role: 'STUDENT'
      }),
      UserFactory.create({
        id: '4088da13-39c6-4257-9880-6f17e55fec2b',
        email: 'guard@iiita.ac.in',
        name: 'SAC Guard Ramesh',
        mobileNo: '9876543212',
        role: 'GUARD'
      }),
      UserFactory.create({
        id: '1f1e9350-4a2e-40da-a076-799e8df1d422',
        email: 'admin@iiita.ac.in',
        name: 'SAC Admin Dr. Sharma',
        mobileNo: '9876543213',
        role: 'ADMIN'
      })
    ];

    for (const u of seedUsers) {
      this.users.set(u.getId(), u);
    }

    const seedItems: SACItem[] = [
      SACItemFactory.create({ id: 'item-tt-racket', name: 'TT Racket', category: 'Table Tennis', itemType: 'EQUIPMENT', totalQty: 6, availableQty: 6 }),
      SACItemFactory.create({ id: 'item-tt-ball', name: 'TT Ball', category: 'Table Tennis', itemType: 'EQUIPMENT', totalQty: 12, availableQty: 12 }),
      SACItemFactory.create({ id: 'item-tennis-racket', name: 'Tennis Racket', category: 'Lawn Tennis', itemType: 'EQUIPMENT', totalQty: 4, availableQty: 4 }),
      SACItemFactory.create({ id: 'item-tennis-ball', name: 'Tennis Ball', category: 'Lawn Tennis', itemType: 'EQUIPMENT', totalQty: 8, availableQty: 8 }),
      SACItemFactory.create({ id: 'item-chess', name: 'Chess Set', category: 'Board Games', itemType: 'EQUIPMENT', totalQty: 5, availableQty: 5 }),
      SACItemFactory.create({ id: 'item-carrom', name: 'Carrom Board Set', category: 'Board Games', itemType: 'EQUIPMENT', totalQty: 4, availableQty: 4 }),
      SACItemFactory.create({ id: 'room-dance', name: 'Dance Room Key', category: 'Activity Rooms', itemType: 'ROOM_KEY', totalQty: 1, availableQty: 1 }),
      SACItemFactory.create({ id: 'room-music', name: 'Music Room Key', category: 'Activity Rooms', itemType: 'ROOM_KEY', totalQty: 1, availableQty: 1 })
    ];

    for (const item of seedItems) {
      this.items.set(item.getId(), item);
    }

    const staffId = crypto.randomUUID();
    this.whitelistedStaff.set(staffId, {
      id: staffId,
      email: 'guard.sac.iiita@gmail.com',
      name: 'SAC Guard Ramesh',
      mobile_no: '9876543212',
      role: 'GUARD',
      created_at: new Date().toISOString()
    });
  }
}

export class InMemoryUserRepository implements IUserRepository {
  constructor(private readonly store: InMemoryDatabaseStore) {}

  private cloneUser(u: User): User {
    const dto = u.toProfileDTO();
    return UserFactory.create({
      id: dto.id,
      name: dto.name,
      email: dto.email,
      role: dto.role,
      rollNo: dto.rollNo,
      mobileNo: dto.mobileNo,
      isDefaulter: dto.isDefaulter,
      penaltyUntil: dto.penaltyUntil
    });
  }

  public async findById(id: string): Promise<User | null> {
    const found = this.store.users.get(id);
    return found ? this.cloneUser(found) : null;
  }

  public async findByEmail(email: string): Promise<User | null> {
    const clean = email.toLowerCase().trim();
    for (const u of this.store.users.values()) {
      if (u.getEmail() === clean) {
        return this.cloneUser(u);
      }
    }
    return null;
  }

  public async findByRollNo(rollNo: string): Promise<Student | null> {
    const clean = rollNo.trim().toUpperCase();
    for (const u of this.store.users.values()) {
      const dto = u.toProfileDTO();
      if (dto.rollNo && dto.rollNo.toUpperCase() === clean) {
        const cloned = this.cloneUser(u);
        if (!(cloned instanceof Student)) {
          throw new ValidationException(`User with roll no ${rollNo} is not a student.`);
        }
        return cloned;
      }
    }
    return null;
  }

  public async findAll(): Promise<User[]> {
    return Array.from(this.store.users.values())
      .map((u) => this.cloneUser(u))
      .sort((a, b) => a.getName().localeCompare(b.getName()));
  }

  public async createUser(userData: {
    id?: string;
    email: string;
    name: string;
    role: UserRole;
    rollNo?: string | null;
    mobileNo?: string | null;
  }): Promise<User> {
    const created = UserFactory.create({
      id: userData.id ?? crypto.randomUUID(),
      email: userData.email,
      name: userData.name,
      role: userData.role,
      rollNo: userData.rollNo ?? null,
      mobileNo: userData.mobileNo ?? null
    });
    this.store.users.set(created.getId(), created);
    return this.cloneUser(created);
  }

  public async updateUser(
    userId: string,
    updates: { name?: string; role?: UserRole; rollNo?: string | null; mobileNo?: string | null }
  ): Promise<User> {
    const existing = this.store.users.get(userId);
    if (!existing) {
      throw new EntityNotFoundException('User', userId);
    }
    const dto = existing.toProfileDTO();
    const updated = UserFactory.create({
      id: dto.id,
      email: dto.email,
      name: updates.name !== undefined ? updates.name : dto.name,
      role: updates.role !== undefined ? updates.role : dto.role,
      rollNo: updates.rollNo !== undefined ? updates.rollNo : dto.rollNo,
      mobileNo: updates.mobileNo !== undefined ? updates.mobileNo : dto.mobileNo,
      isDefaulter: dto.isDefaulter,
      penaltyUntil: dto.penaltyUntil
    });
    this.store.users.set(userId, updated);
    return this.cloneUser(updated);
  }

  public async upsertUser(userData: {
    email: string;
    name: string;
    role: UserRole;
    mobileNo?: string | null;
    rollNo?: string | null;
  }): Promise<User> {
    const existing = await this.findByEmail(userData.email);
    if (existing) {
      return this.updateUser(existing.getId(), {
        name: userData.name,
        role: userData.role,
        mobileNo: userData.mobileNo !== undefined ? userData.mobileNo : existing.getMobileNo(),
        rollNo:
          userData.rollNo !== undefined
            ? userData.rollNo
            : existing.toProfileDTO().rollNo
      });
    }
    return this.createUser(userData);
  }

  public async setDefaulter(studentId: string, isDefaulter: boolean): Promise<void> {
    const existing = this.store.users.get(studentId);
    if (!existing) throw new EntityNotFoundException('User', studentId);
    if (existing instanceof Student) {
      existing.setIsDefaulter(isDefaulter);
    }
  }

  public async setPenaltyUntil(studentId: string, penaltyUntil: Date | null): Promise<void> {
    const existing = this.store.users.get(studentId);
    if (!existing) throw new EntityNotFoundException('User', studentId);
    if (existing instanceof Student) {
      existing.setPenaltyUntil(penaltyUntil);
    }
  }

  public async updateRole(userId: string, role: UserRole): Promise<void> {
    await this.updateUser(userId, { role });
  }

  public async updateMobileNo(userId: string, mobileNo: string): Promise<void> {
    await this.updateUser(userId, { mobileNo });
  }

  public async findWhitelistedStaff(email: string): Promise<WhitelistedStaffRecord | null> {
    const clean = email.toLowerCase().trim();
    for (const rec of this.store.whitelistedStaff.values()) {
      if (rec.email.toLowerCase() === clean) {
        return { ...rec };
      }
    }
    return null;
  }

  public async findWhitelistedStaffById(id: string): Promise<WhitelistedStaffRecord | null> {
    const found = this.store.whitelistedStaff.get(id);
    return found ? { ...found } : null;
  }

  public async listWhitelistedStaff(): Promise<WhitelistedStaffRecord[]> {
    return Array.from(this.store.whitelistedStaff.values()).map((r) => ({ ...r }));
  }

  public async addWhitelistedStaff(data: {
    email: string;
    name: string;
    mobileNo?: string | null;
    role: UserRole;
  }): Promise<WhitelistedStaffRecord> {
    const clean = data.email.toLowerCase().trim();
    let existingId: string | null = null;
    for (const [id, rec] of this.store.whitelistedStaff.entries()) {
      if (rec.email.toLowerCase() === clean) {
        existingId = id;
        break;
      }
    }
    const id = existingId ?? crypto.randomUUID();
    const record: WhitelistedStaffRecord = {
      id,
      email: clean,
      name: data.name.trim(),
      mobile_no: data.mobileNo?.trim() || null,
      role: data.role,
      created_at: new Date().toISOString()
    };
    this.store.whitelistedStaff.set(id, record);
    return { ...record };
  }

  public async removeWhitelistedStaff(id: string): Promise<void> {
    this.store.whitelistedStaff.delete(id);
  }

  public async createWhitelistRequest(data: {
    email: string;
    name: string;
    mobileNo: string;
    reason?: string;
  }): Promise<WhitelistRequestRecord> {
    const clean = data.email.toLowerCase().trim();
    let existingId: string | null = null;
    for (const [id, rec] of this.store.whitelistRequests.entries()) {
      if (rec.email.toLowerCase() === clean) {
        existingId = id;
        break;
      }
    }
    const id = existingId ?? crypto.randomUUID();
    const record: WhitelistRequestRecord = {
      id,
      email: clean,
      name: data.name.trim(),
      mobile_no: data.mobileNo.trim(),
      reason: data.reason?.trim() || null,
      status: 'PENDING',
      approved_role: null,
      created_at: new Date().toISOString()
    };
    this.store.whitelistRequests.set(id, record);
    return { ...record };
  }

  public async findWhitelistRequestByEmail(email: string): Promise<WhitelistRequestRecord | null> {
    const clean = email.toLowerCase().trim();
    for (const rec of this.store.whitelistRequests.values()) {
      if (rec.email.toLowerCase() === clean) {
        return { ...rec };
      }
    }
    return null;
  }

  public async findWhitelistRequestById(id: string): Promise<WhitelistRequestRecord | null> {
    const found = this.store.whitelistRequests.get(id);
    return found ? { ...found } : null;
  }

  public async listPendingWhitelistRequests(): Promise<WhitelistRequestRecord[]> {
    return Array.from(this.store.whitelistRequests.values())
      .filter((r) => r.status === 'PENDING')
      .map((r) => ({ ...r }));
  }

  public async updateWhitelistRequestStatus(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    approvedRole?: string
  ): Promise<WhitelistRequestRecord> {
    const found = this.store.whitelistRequests.get(id);
    if (!found) {
      throw new EntityNotFoundException('WhitelistRequest', id);
    }
    const updated: WhitelistRequestRecord = {
      ...found,
      status,
      approved_role: approvedRole !== undefined ? approvedRole : found.approved_role
    };
    this.store.whitelistRequests.set(id, updated);
    return { ...updated };
  }
}

export class InMemorySACItemRepository implements ISACItemRepository {
  constructor(private readonly store: InMemoryDatabaseStore) {}

  private cloneItem(item: SACItem): SACItem {
    return SACItemFactory.fromDatabaseRow(item.toPersistenceRecord());
  }

  public async findAll(): Promise<SACItem[]> {
    return Array.from(this.store.items.values())
      .map((i) => this.cloneItem(i))
      .sort((a, b) => a.getName().localeCompare(b.getName()));
  }

  public async findById(id: string): Promise<SACItem | null> {
    const found = this.store.items.get(id);
    return found ? this.cloneItem(found) : null;
  }

  public async create(item: SACItem): Promise<SACItem> {
    const cloned = this.cloneItem(item);
    this.store.items.set(cloned.getId(), cloned);
    return this.cloneItem(cloned);
  }

  public async save(item: SACItem): Promise<void> {
    this.store.items.set(item.getId(), this.cloneItem(item));
  }

  public async delete(id: string): Promise<void> {
    this.store.items.delete(id);
  }
}

export class InMemoryIssueRequestRepository implements IIssueRequestRepository {
  constructor(private readonly store: InMemoryDatabaseStore) {}

  private cloneRequest(r: IssueRequest): IssueRequest {
    return new IssueRequest(
      r.getId(),
      r.getStudentId(),
      r.getRequestedItems(),
      r.getStatus(),
      r.getCreatedAt(),
      r.getExpiresAt(),
      r.getApprovedById()
    );
  }

  public async create(request: IssueRequest): Promise<IssueRequest> {
    const cloned = this.cloneRequest(request);
    this.store.issueRequests.set(cloned.getId(), cloned);
    return this.cloneRequest(cloned);
  }

  public async findById(id: string): Promise<IssueRequest | null> {
    const found = this.store.issueRequests.get(id);
    return found ? this.cloneRequest(found) : null;
  }

  public async findPending(): Promise<IssueRequest[]> {
    const now = new Date();
    return Array.from(this.store.issueRequests.values())
      .filter((r) => r.getStatus() === 'PENDING' && !r.isExpired(now))
      .sort((a, b) => a.getCreatedAt().getTime() - b.getCreatedAt().getTime())
      .map((r) => this.cloneRequest(r));
  }

  public async findAllPendingStatus(): Promise<IssueRequest[]> {
    return Array.from(this.store.issueRequests.values())
      .filter((r) => r.getStatus() === 'PENDING')
      .map((r) => this.cloneRequest(r));
  }

  public async findAllPendingUnexpiredOrOverdue(): Promise<IssueRequest[]> {
    return this.findAllPendingStatus();
  }

  public async markRequestTimedOut(requestId: string): Promise<boolean> {
    const found = this.store.issueRequests.get(requestId);
    if (!found || found.getStatus() !== 'PENDING') {
      return false;
    }
    found.markTimedOut();
    return true;
  }

  public async countTrailingTimeoutsLastHour(studentId: string): Promise<number> {
    const cutoff = Date.now() - 60 * 60 * 1000;
    let count = 0;
    for (const r of this.store.issueRequests.values()) {
      if (
        r.getStudentId() === studentId &&
        r.getStatus() === 'TIMED_OUT' &&
        r.getCreatedAt().getTime() >= cutoff
      ) {
        count += 1;
      }
    }
    return count;
  }

  public async applyStudentPenalty(studentId: string, penaltyUntil: Date): Promise<void> {
    const user = this.store.users.get(studentId);
    if (user instanceof Student) {
      user.imposeCooldown(penaltyUntil);
    }
  }

  public async getRequestById(requestId: string): Promise<IssueRequest | null> {
    return this.findById(requestId);
  }
}

export class InMemoryRegisterLogRepository implements IRegisterLogRepository {
  constructor(private readonly store: InMemoryDatabaseStore) {}

  private cloneEntry(e: RegisterEntry): RegisterEntry {
    return new RegisterEntry(
      e.getId(),
      e.getBatchId(),
      e.getStudentId(),
      e.getStudentName(),
      e.getRollNo(),
      e.getMobileNo(),
      e.getItemId(),
      e.getItemName(),
      e.getCategory(),
      e.getArrivalTime(),
      e.getDepartureTime(),
      e.getStatus(),
      e.getPendingTransferToId()
    );
  }

  private toMasterRow(e: RegisterEntry): MasterLogRow {
    return {
      id: e.getId(),
      batch_id: e.getBatchId(),
      student_id: e.getStudentId(),
      student_name: e.getStudentName(),
      roll_no: e.getRollNo(),
      mobile_no: e.getMobileNo(),
      item_id: e.getItemId(),
      item_name: e.getItemName(),
      category: e.getCategory(),
      arrival_time: e.getArrivalTime().toISOString(),
      departure_time: e.getDepartureTime() ? e.getDepartureTime()!.toISOString() : null,
      status: e.getStatus(),
      pending_transfer_to_id: e.getPendingTransferToId()
    };
  }

  public async findById(id: string): Promise<RegisterEntry | null> {
    const found = this.store.registerEntries.get(id);
    return found ? this.cloneEntry(found) : null;
  }

  public async findByBatchId(batchId: string): Promise<RegisterEntry[]> {
    return Array.from(this.store.registerEntries.values())
      .filter((e) => e.getBatchId() === batchId)
      .sort((a, b) => a.getArrivalTime().getTime() - b.getArrivalTime().getTime())
      .map((e) => this.cloneEntry(e));
  }

  public async findActive(filter?: {
    studentId?: string;
    batchId?: string;
    itemId?: string;
  }): Promise<RegisterEntry[]> {
    return Array.from(this.store.registerEntries.values())
      .filter((e) => {
        if (!e.isActiveHolding()) return false;
        if (filter?.studentId && e.getStudentId() !== filter.studentId) return false;
        if (filter?.batchId && e.getBatchId() !== filter.batchId) return false;
        if (filter?.itemId && e.getItemId() !== filter.itemId) return false;
        return true;
      })
      .sort((a, b) => b.getArrivalTime().getTime() - a.getArrivalTime().getTime())
      .map((e) => this.cloneEntry(e));
  }

  public async getActiveHeldItemIds(): Promise<Set<string>> {
    const set = new Set<string>();
    for (const e of this.store.registerEntries.values()) {
      if (e.isActiveHolding()) {
        set.add(e.getItemId());
      }
    }
    return set;
  }

  public async hasActiveHoldingsForItem(itemId: string): Promise<boolean> {
    for (const e of this.store.registerEntries.values()) {
      if (e.getItemId() === itemId && e.isActiveHolding()) {
        return true;
      }
    }
    return false;
  }

  public async findPendingIncomingTransfers(recipientStudentId: string): Promise<RegisterEntry[]> {
    return Array.from(this.store.registerEntries.values())
      .filter(
        (e) =>
          e.getStatus() === 'ISSUED_TRANSFER_PENDING' &&
          e.getPendingTransferToId() === recipientStudentId
      )
      .map((e) => this.cloneEntry(e));
  }

  public async initiateTransfer(entryId: string, peerId: string): Promise<void> {
    const entry = this.store.registerEntries.get(entryId);
    if (!entry) throw new EntityNotFoundException('RegisterEntry', entryId);
    entry.lockForTransfer(peerId);
  }

  public async cancelTransfer(entryId: string): Promise<void> {
    const entry = this.store.registerEntries.get(entryId);
    if (!entry) throw new EntityNotFoundException('RegisterEntry', entryId);
    entry.cancelTransfer();
  }

  public async approveIssueRequestTx(
    requestId: string,
    guardId: string
  ): Promise<ApproveIssueTxResult> {
    const req = this.store.issueRequests.get(requestId);
    if (!req) throw new EntityNotFoundException('IssueRequest', requestId);

    const student = this.store.users.get(req.getStudentId());
    if (!student || !(student instanceof Student)) {
      throw new EntityNotFoundException('Student', req.getStudentId());
    }

    const guardUser = this.store.users.get(guardId);
    const guard =
      guardUser instanceof Guard
        ? guardUser
        : new Guard(guardId, 'SAC Guard', 'guard@iiita.ac.in', 'DESK_1');

    const now = new Date();
    // Execute OOP Guard.approveRequest (validates status, 120s TTL, and allocates stock via Template Method)
    guard.approveRequest(req, now, this.store.items);

    const batchId = crypto.randomUUID();
    let unitsIssued = 0;

    for (const line of req.getLineItems()) {
      const item = this.store.items.get(line.getItemId())!;
      for (let i = 0; i < line.getQty(); i += 1) {
        const entry = new RegisterEntry(
          crypto.randomUUID(),
          batchId,
          student.getId(),
          student.getName(),
          student.getRollNo(),
          student.getMobileNo() || '0000000000',
          item.getId(),
          item.getName(),
          item.getCategory(),
          now,
          null,
          'ISSUED',
          null
        );
        this.store.registerEntries.set(entry.getId(), entry);
        unitsIssued += 1;
      }
    }

    return {
      batch_id: batchId,
      units_issued: unitsIssued,
      student_id: student.getId()
    };
  }

  public async executeTransferSplitTx(
    entryId: string,
    recipientId: string
  ): Promise<TransferSplitTxResult> {
    const entry = this.store.registerEntries.get(entryId);
    if (!entry) throw new EntityNotFoundException('RegisterEntry', entryId);

    const recipient = this.store.users.get(recipientId);
    if (!recipient || !(recipient instanceof Student)) {
      throw new EntityNotFoundException('Student', recipientId);
    }

    const now = new Date();
    // Execute OOP Student.acceptTransfer -> RegisterEntry.completeAtomicTransfer (GoF State Pattern)
    const spawned = recipient.acceptTransfer(entry, now);
    this.store.registerEntries.set(spawned.getId(), spawned);

    return {
      old_entry_id: entry.getId(),
      new_entry_id: spawned.getId(),
      batch_id: spawned.getBatchId(),
      recipient_name: recipient.getName()
    };
  }

  public async closeGuardReturnTx(
    entryId: string,
    isDamaged: boolean
  ): Promise<GuardReturnTxResult> {
    const entry = this.store.registerEntries.get(entryId);
    if (!entry) throw new EntityNotFoundException('RegisterEntry', entryId);

    const item = this.store.items.get(entry.getItemId());
    if (!item) throw new EntityNotFoundException('SACItem', entry.getItemId());

    const holder = this.store.users.get(entry.getStudentId());
    if (!holder || !(holder instanceof Student)) {
      throw new EntityNotFoundException('Student', entry.getStudentId());
    }

    const guard = new Guard('guard-system', 'SAC Guard', 'guard@iiita.ac.in');
    const now = new Date();

    if (isDamaged) {
      guard.markUnitDamaged(entry, item, holder, now);
    } else {
      guard.markUnitReturned(entry, item, now);
    }

    return {
      entry_id: entry.getId(),
      status: entry.getStatus(),
      item_id: item.getId(),
      student_id: holder.getId()
    };
  }

  public async closeGuardBatchReturnTx(batchId: string): Promise<GuardBatchReturnTxResult> {
    const batchEntries = Array.from(this.store.registerEntries.values()).filter(
      (e) => e.getBatchId() === batchId
    );
    if (batchEntries.length === 0) {
      throw new InvalidStateTransitionException(`No entries found for batch '${batchId}'.`);
    }

    const batch = new CheckoutBatch(batchId, batchEntries);
    const returnedCount = batch.returnAllActiveIntact(this.store.items, new Date());

    return {
      batch_id: batchId,
      returned_count: returnedCount
    };
  }

  public async getMasterLogs(options?: MasterLogQueryOptions): Promise<MasterLogsResult> {
    const page = options?.page && options.page > 0 ? options.page : 1;
    const limit = options?.limit && options.limit > 0 ? options.limit : 25;
    const unpaginated = options?.unpaginated ?? false;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const allEntries = Array.from(this.store.registerEntries.values()).sort(
      (a, b) => b.getArrivalTime().getTime() - a.getArrivalTime().getTime()
    );

    const todayCount = allEntries.filter(
      (e) => e.getArrivalTime().getTime() >= startOfToday.getTime()
    ).length;

    const filtered = allEntries.filter((e) => {
      if (options?.status && options.status !== 'ALL' && e.getStatus() !== options.status) {
        return false;
      }
      if (options?.startDate && e.getArrivalTime() < new Date(options.startDate)) {
        return false;
      }
      if (options?.endDate && e.getArrivalTime() > new Date(options.endDate)) {
        return false;
      }
      return true;
    });

    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const sliced = unpaginated
      ? filtered
      : filtered.slice((page - 1) * limit, (page - 1) * limit + limit);

    return {
      logs: sliced.map((e) => this.toMasterRow(e)),
      totalCount,
      todayCount,
      totalPages,
      currentPage: page
    };
  }
}

