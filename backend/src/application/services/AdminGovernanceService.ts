import { Admin, Student, type UserRole } from '../../domain/entities/User.js';
import {
  AccessRestrictedException,
  EntityNotFoundException,
  UnauthorizedRoleException,
  ValidationException
} from '../../domain/exceptions/DomainException.js';
import { SACItemFactory, type CreateSACItemParams } from '../../domain/factories/SACItemFactory.js';
import type {
  IRegisterLogRepository,
  MasterLogQueryOptions
} from '../../domain/repositories/IRegisterLogRepository.js';
import type { ISACItemRepository } from '../../domain/repositories/ISACItemRepository.js';
import type { IUserRepository } from '../../domain/repositories/IUserRepository.js';
import { CsvExportFormatter } from './CsvExportFormatter.js';
import { RealtimeEventHub } from './RealtimeEventHub.js';

export interface AuthenticatedAdminCaller {
  userId?: string;
  email: string;
  role: UserRole;
}

/**
 * AdminGovernanceService
 *
 * Encapsulates administrative governance operations (master register audit logs + RFC-4180 CSV export,
 * defaulter & cooldown overrides via `Admin` domain entity, catalog CRUD via `SACItemFactory` +
 * `IRegisterLogRepository.hasActiveHoldingsForItem()`, and Root-Admin-enforced staff whitelist hierarchy).
 */
export class AdminGovernanceService {
  private readonly registerLogRepo: IRegisterLogRepository;
  private readonly userRepo: IUserRepository;
  private readonly itemRepo: ISACItemRepository;
  private readonly hub: RealtimeEventHub;

  constructor(
    registerLogRepo: IRegisterLogRepository,
    userRepo: IUserRepository,
    itemRepo: ISACItemRepository,
    hub: RealtimeEventHub = RealtimeEventHub.getInstance()
  ) {
    this.registerLogRepo = registerLogRepo;
    this.userRepo = userRepo;
    this.itemRepo = itemRepo;
    this.hub = hub;
  }

  private isRootAdminEmail(email?: string | null): boolean {
    if (!email) return false;
    const normalized = email.toLowerCase().trim();
    const initialAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
    return Boolean(
      (initialAdminEmail && normalized === initialAdminEmail) ||
        normalized === 'admin@iiita.ac.in'
    );
  }

  private async resolveAdminActor(caller?: AuthenticatedAdminCaller): Promise<Admin | null> {
    if (!caller?.userId) return null;
    const user = await this.userRepo.findById(caller.userId);
    return user instanceof Admin ? user : null;
  }

  public async getRegisterLogs(options: MasterLogQueryOptions) {
    return this.registerLogRepo.getMasterLogs(options);
  }

  public async exportRegisterLogsCsv(options: MasterLogQueryOptions): Promise<string> {
    const result = await this.registerLogRepo.getMasterLogs({
      ...options,
      unpaginated: true
    });
    return CsvExportFormatter.formatMasterLogs(result.logs);
  }

  public async clearDefaulter(targetUserId: string, caller?: AuthenticatedAdminCaller) {
    const user = await this.userRepo.findById(targetUserId);
    if (!user) {
      throw new EntityNotFoundException('User', targetUserId);
    }

    const adminActor = await this.resolveAdminActor(caller);
    if (user instanceof Student) {
      if (adminActor) {
        adminActor.clearDefaulter(user);
      } else {
        user.clearDefaulterStatus();
      }
    }

    await this.userRepo.setDefaulter(targetUserId, false);

    this.hub.notifyStudent(targetUserId, 'RESTRICTION_CLEARED', {
      type: 'DEFAULTER_CLEARED',
      message: 'Your SAC defaulter restriction has been cleared by an Administrator.'
    });

    return {
      message: `Defaulter status cleared for student ${user.getName()}.`,
      userId: targetUserId,
      isDefaulter: false
    };
  }

  public async resetCooldown(targetUserId: string, caller?: AuthenticatedAdminCaller) {
    const user = await this.userRepo.findById(targetUserId);
    if (!user) {
      throw new EntityNotFoundException('User', targetUserId);
    }

    const adminActor = await this.resolveAdminActor(caller);
    if (user instanceof Student) {
      if (adminActor) {
        adminActor.resetCooldown(user);
      } else {
        user.clearCooldown();
      }
    }

    await this.userRepo.setPenaltyUntil(targetUserId, null);

    this.hub.notifyStudent(targetUserId, 'RESTRICTION_CLEARED', {
      type: 'COOLDOWN_RESET',
      message: 'Your SAC timeout cooldown has been reset by an Administrator.'
    });

    return {
      message: `Cooldown penalty reset for student ${user.getName()}.`,
      userId: targetUserId,
      penaltyUntil: null
    };
  }

  public async upsertInventoryItem(params: Partial<CreateSACItemParams> & { id?: string }) {
    if (!params.name || !params.category || !params.itemType) {
      throw new ValidationException(
        'name, category, and itemType (EQUIPMENT | ROOM_KEY) are required.'
      );
    }

    const entity = SACItemFactory.create({
      id: params.id,
      name: params.name,
      category: params.category,
      itemType: params.itemType,
      totalQty: params.totalQty,
      availableQty: params.availableQty,
      damagedQty: params.damagedQty ?? 0
    });

    if (params.id) {
      await this.itemRepo.save(entity);
    } else {
      await this.itemRepo.create(entity);
    }

    this.hub.emit('INVENTORY_UPDATED', {
      action: 'UPSERTED',
      itemId: entity.getId(),
      timestamp: new Date().toISOString()
    });
    this.hub.broadcastInventoryUpdate(entity);

    return {
      message: 'SAC Item upserted successfully.',
      item: {
        id: entity.getId(),
        name: entity.getName(),
        category: entity.getCategory(),
        itemType: entity.getItemType(),
        totalQty: entity.getTotalQty(),
        availableQty: entity.getAvailableQty()
      }
    };
  }

  /**
   * Uses `IRegisterLogRepository.hasActiveHoldingsForItem(id)` (SOLID DIP — zero raw Supabase imports!).
   */
  public async deleteInventoryItem(itemId: string) {
    if (!itemId) {
      throw new ValidationException('Item ID is required.');
    }

    const item = await this.itemRepo.findById(itemId);
    if (!item) {
      throw new EntityNotFoundException('Item', itemId);
    }

    const hasActiveHoldings = await this.registerLogRepo.hasActiveHoldingsForItem(itemId);
    if (hasActiveHoldings) {
      throw new ValidationException(
        'Cannot delete item while units are currently checked out'
      );
    }

    await this.itemRepo.delete(itemId);

    this.hub.emit('INVENTORY_UPDATED', {
      action: 'DELETED',
      itemId,
      itemName: item.getName(),
      timestamp: new Date().toISOString()
    });

    return {
      message: `Item "${item.getName()}" deleted successfully.`,
      deletedItemId: itemId
    };
  }

  public async listUsers() {
    const initialAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
    const users = await this.userRepo.findAll();
    return users.map((u) => {
      const dto = u.toProfileDTO(initialAdminEmail);
      return {
        id: dto.id,
        name: dto.name,
        email: dto.email,
        role: dto.role,
        rollNo: dto.rollNo,
        mobileNo: dto.mobileNo,
        isDefaulter: dto.isDefaulter,
        penaltyUntil: dto.penaltyUntil
      };
    });
  }

  public async getWhitelistOverview() {
    const initialAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
    const [pendingRequests, activeUsers] = await Promise.all([
      this.userRepo.listPendingWhitelistRequests(),
      this.userRepo.listWhitelistedStaff()
    ]);
    return {
      pendingRequests,
      activeUsers,
      initialAdminEmail
    };
  }

  public async approveWhitelistRequest(params: {
    requestId: string;
    role: string;
    caller: AuthenticatedAdminCaller;
  }) {
    const { requestId, role, caller } = params;
    if (!requestId) {
      throw new ValidationException('requestId is required.');
    }

    const validRoles = ['STUDENT', 'GUARD', 'ADMIN'];
    if (!role || !validRoles.includes(role.toUpperCase())) {
      throw new ValidationException('role must be STUDENT, GUARD, or ADMIN.');
    }

    const approvedRole = role.toUpperCase() as UserRole;

    if (approvedRole === 'ADMIN' && !this.isRootAdminEmail(caller.email)) {
      throw new UnauthorizedRoleException(
        'Only the primary institutional administrator can grant ADMIN role'
      );
    }

    const request = await this.userRepo.findWhitelistRequestById(requestId);
    if (!request) {
      throw new EntityNotFoundException('Whitelist request', requestId);
    }

    const updatedReq = await this.userRepo.updateWhitelistRequestStatus(
      requestId,
      'APPROVED',
      approvedRole
    );

    await this.userRepo.addWhitelistedStaff({
      email: request.email,
      name: request.name,
      mobileNo: request.mobile_no,
      role: approvedRole
    });

    const user = await this.userRepo.upsertUser({
      email: request.email,
      name: request.name,
      role: approvedRole,
      mobileNo: request.mobile_no,
      rollNo: approvedRole === 'STUDENT' ? request.email.split('@')[0].toUpperCase() : null
    });

    return {
      message: `Request approved as ${approvedRole} and access granted`,
      request: updatedReq,
      user: {
        id: user.getId(),
        email: user.getEmail(),
        name: user.getName(),
        role: user.getRole(),
        mobileNo: user.getMobileNo()
      }
    };
  }

  public async rejectWhitelistRequest(requestId: string) {
    if (!requestId) {
      throw new ValidationException('requestId is required.');
    }

    const request = await this.userRepo.findWhitelistRequestById(requestId);
    if (!request) {
      throw new EntityNotFoundException('Whitelist request', requestId);
    }

    const updatedReq = await this.userRepo.updateWhitelistRequestStatus(requestId, 'REJECTED');
    return {
      message: 'Whitelist request rejected',
      request: updatedReq
    };
  }

  public async directAddWhitelist(params: {
    email: unknown;
    name: unknown;
    mobileNo?: unknown;
    role: unknown;
    caller: AuthenticatedAdminCaller;
  }) {
    const { email, name, mobileNo, role, caller } = params;

    if (!email || typeof email !== 'string') {
      throw new ValidationException('Email is required.');
    }
    if (!name || typeof name !== 'string') {
      throw new ValidationException('Name is required.');
    }

    const validRoles = ['STUDENT', 'GUARD', 'ADMIN'];
    if (!role || typeof role !== 'string' || !validRoles.includes(role.toUpperCase())) {
      throw new ValidationException('Role must be STUDENT, GUARD, or ADMIN.');
    }

    const assignedRole = role.toUpperCase() as UserRole;

    if (assignedRole === 'ADMIN' && !this.isRootAdminEmail(caller.email)) {
      throw new UnauthorizedRoleException(
        'Only the primary institutional administrator can grant ADMIN role'
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanMobile = mobileNo ? String(mobileNo).trim() : null;

    const staff = await this.userRepo.addWhitelistedStaff({
      email: cleanEmail,
      name: name.trim(),
      mobileNo: cleanMobile,
      role: assignedRole
    });

    await this.userRepo.upsertUser({
      email: cleanEmail,
      name: name.trim(),
      role: assignedRole,
      mobileNo: cleanMobile,
      rollNo: assignedRole === 'STUDENT' ? cleanEmail.split('@')[0].toUpperCase() : null
    });

    return staff;
  }

  public async revokeWhitelist(staffId: string, caller: AuthenticatedAdminCaller) {
    if (!staffId) {
      throw new ValidationException('Whitelist record ID is required.');
    }

    const target = await this.userRepo.findWhitelistedStaffById(staffId);
    if (!target) {
      throw new EntityNotFoundException('Whitelisted staff record', staffId);
    }

    const initialAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
    const targetEmail = target.email.toLowerCase().trim();

    if (initialAdminEmail && targetEmail === initialAdminEmail) {
      throw new AccessRestrictedException(
        'The primary institutional administrator cannot be modified or revoked'
      );
    }

    if (caller.email.toLowerCase().trim() === targetEmail) {
      throw new ValidationException('You cannot revoke your own account access');
    }

    const isTargetAdmin = target.role?.toUpperCase() === 'ADMIN';
    if (isTargetAdmin && !this.isRootAdminEmail(caller.email)) {
      throw new UnauthorizedRoleException(
        'Only the primary institutional administrator can revoke an ADMIN account'
      );
    }

    await this.userRepo.removeWhitelistedStaff(staffId);

    const existingReq = await this.userRepo.findWhitelistRequestByEmail(targetEmail);
    if (existingReq && existingReq.status === 'APPROVED') {
      await this.userRepo.updateWhitelistRequestStatus(existingReq.id, 'REJECTED');
    }

    return {
      message: 'Access revoked successfully and user removed from whitelist'
    };
  }
}

