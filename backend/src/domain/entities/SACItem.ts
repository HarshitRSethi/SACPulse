import {
  InsufficientStockException,
  InvalidStateTransitionException,
  ValidationException
} from '../exceptions/DomainException.js';

export type ItemType = 'EQUIPMENT' | 'ROOM_KEY';

export interface SACItemInventoryDTO {
  id: string;
  name: string;
  category: string;
  itemType: ItemType;
  totalQty: number;
  availableQty: number;
  damagedQty?: number;
  isAvailable: boolean;
  occupiedSince?: string | null;
  hasActiveStudentCheckout?: boolean;
  isFacultySession?: boolean;
}

export interface SACItemPersistenceRecord {
  id: string;
  name: string;
  category: string;
  item_type: ItemType;
  total_qty: number;
  available_qty: number;
  damaged_qty: number;
  occupied_since: string | null;
}

/**
 * Abstract Base SACItem
 *
 * Implements the Gang-of-Four (GoF) Template Method Pattern:
 * - Concrete workflow skeletons `checkout()` and `checkin()` enforce invariant
 *   pre-checks, capacity rules, and post-mutation hooks.
 * - Subclasses (`SportsEquipment`, `RoomKey`) override protected primitive steps
 *   (`applyAllocation`, `applyRelease`, `applyDamage`) and polymorphic DTO/persistence
 *   projections, eliminating `instanceof` checks across upper layers.
 */
export abstract class SACItem {
  protected readonly id: string;
  protected name: string;
  protected category: string;
  protected readonly itemType: ItemType;
  protected totalQty: number;
  protected availableQty: number;
  protected lastMutatedAt: Date | null = null;

  protected constructor(
    id: string,
    name: string,
    category: string,
    itemType: ItemType,
    totalQty: number,
    availableQty: number
  ) {
    if (!id || !name.trim() || !category.trim()) {
      throw new ValidationException('SACItem requires a non-empty id, name, and category.');
    }
    if (totalQty < 0 || availableQty < 0) {
      throw new ValidationException('Quantities cannot be negative.');
    }
    if (availableQty > totalQty) {
      throw new ValidationException('Available quantity cannot exceed total quantity.');
    }
    this.id = id;
    this.name = name.trim();
    this.category = category.trim();
    this.itemType = itemType;
    this.totalQty = totalQty;
    this.availableQty = availableQty;
  }

  public getId(): string {
    return this.id;
  }

  public getName(): string {
    return this.name;
  }

  public getCategory(): string {
    return this.category;
  }

  public getItemType(): ItemType {
    return this.itemType;
  }

  public getTotalQty(): number {
    return this.totalQty;
  }

  public getAvailableQty(): number {
    return this.availableQty;
  }

  public getLastMutatedAt(): Date | null {
    return this.lastMutatedAt;
  }

  public isAvailable(): boolean {
    return this.availableQty > 0;
  }

  /**
   * Maximum units that can be requested in a single allocation operation.
   * Preserves Liskov Substitution Principle (LSP) by advertising capacity constraints explicitly.
   */
  public abstract getMaxAllocatablePerCheckout(): number;

  /**
   * GoF Template Method: Invariant checkout workflow skeleton.
   * Step 1: Validate requested quantity and per-checkout bounds.
   * Step 2: Assert stock / occupancy availability.
   * Step 3: Delegate polymorphic state mutation to subclass `applyAllocation`.
   * Step 4: Execute post-mutation hook.
   */
  public checkout(qty: number = 1, now: Date = new Date()): void {
    this.validateRequestedQuantity(qty);
    this.assertCanAllocate(qty);
    this.applyAllocation(qty, now);
    this.onInventoryMutated(now);
  }

  /**
   * GoF Template Method: Invariant return/check-in workflow skeleton.
   * Step 1: Validate returned quantity.
   * Step 2: Branch cleanly between intact release (`applyRelease`) vs damage recording (`applyDamage`).
   * Step 3: Execute post-mutation hook.
   */
  public checkin(qty: number = 1, isDamaged: boolean = false, now: Date = new Date()): void {
    if (qty <= 0 || !Number.isInteger(qty)) {
      throw new ValidationException('Return quantity must be a positive integer.');
    }
    if (isDamaged) {
      this.applyDamage(qty);
    } else {
      this.applyRelease(qty);
    }
    this.onInventoryMutated(now);
  }

  /**
   * Polymorphic convenience wrappers delegating directly to the Template Methods.
   */
  public allocateUnit(qty: number = 1, now: Date = new Date()): void {
    this.checkout(qty, now);
  }

  public releaseUnit(qty: number = 1, now: Date = new Date()): void {
    this.checkin(qty, false, now);
  }

  protected validateRequestedQuantity(qty: number): void {
    if (qty <= 0 || !Number.isInteger(qty)) {
      throw new ValidationException('Allocation quantity must be greater than zero.');
    }
  }

  protected onInventoryMutated(now: Date): void {
    this.lastMutatedAt = now;
  }

  protected abstract assertCanAllocate(qty: number): void;
  protected abstract applyAllocation(qty: number, now: Date): void;
  protected abstract applyRelease(qty: number): void;
  protected abstract applyDamage(qty: number): void;

  /**
   * Polymorphic projection methods eliminating `instanceof` checks in Controllers,
   * Repositories, and WebSocket broadcasters (Open/Closed Principle).
   */
  public abstract toInventoryDTO(activeHolderItemIds?: ReadonlySet<string>): SACItemInventoryDTO;
  public abstract toRealtimePayload(): Record<string, unknown>;
  public abstract toPersistenceRecord(): SACItemPersistenceRecord;
}

/**
 * SportsEquipment Entity
 * Represents multi-unit physical gear (TT Rackets, Balls, Tennis Rackets, Board Games).
 * Tracks damaged units independently from functional stock.
 */
export class SportsEquipment extends SACItem {
  private damagedQty: number;

  constructor(
    id: string,
    name: string,
    category: string,
    totalQty: number,
    availableQty: number,
    damagedQty: number = 0
  ) {
    super(id, name, category, 'EQUIPMENT', totalQty, availableQty);
    if (damagedQty < 0) {
      throw new ValidationException('Damaged quantity cannot be negative.');
    }
    if (availableQty + damagedQty > totalQty) {
      throw new ValidationException(
        'Sum of available and damaged quantities cannot exceed total quantity.'
      );
    }
    this.damagedQty = damagedQty;
  }

  public getDamagedQty(): number {
    return this.damagedQty;
  }

  public getFunctionalStock(): number {
    return this.totalQty - this.damagedQty;
  }

  public override getMaxAllocatablePerCheckout(): number {
    return Math.max(1, this.totalQty);
  }

  protected override assertCanAllocate(qty: number): void {
    if (this.availableQty < qty) {
      throw new InsufficientStockException(this.name, qty, this.availableQty);
    }
  }

  protected override applyAllocation(qty: number, _now: Date): void {
    this.availableQty -= qty;
  }

  protected override applyRelease(qty: number): void {
    const functionalStock = this.getFunctionalStock();
    if (this.availableQty + qty > functionalStock) {
      throw new InvalidStateTransitionException(
        `Cannot release ${qty} units of '${this.name}'. Resulting available (${this.availableQty + qty}) would exceed functional stock (${functionalStock}).`
      );
    }
    this.availableQty += qty;
  }

  protected override applyDamage(qty: number): void {
    if (this.damagedQty + qty > this.totalQty) {
      throw new InvalidStateTransitionException(
        `Damaged units cannot exceed total quantity (${this.totalQty}).`
      );
    }
    this.damagedQty += qty;
  }

  /**
   * Blueprint Rule 7: Damaged return records damage without returning unit to available stock.
   */
  public recordDamage(qty: number = 1, now: Date = new Date()): void {
    this.checkin(qty, true, now);
  }

  public override toInventoryDTO(): SACItemInventoryDTO {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      itemType: this.itemType,
      totalQty: this.totalQty,
      availableQty: this.availableQty,
      damagedQty: this.damagedQty,
      isAvailable: this.isAvailable()
    };
  }

  public override toRealtimePayload(): Record<string, unknown> {
    return {
      itemId: this.id,
      name: this.name,
      category: this.category,
      itemType: this.itemType,
      totalQty: this.totalQty,
      availableQty: this.availableQty,
      damagedQty: this.damagedQty,
      occupiedSince: null,
      timestamp: new Date().toISOString()
    };
  }

  public override toPersistenceRecord(): SACItemPersistenceRecord {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      item_type: 'EQUIPMENT',
      total_qty: this.totalQty,
      available_qty: this.availableQty,
      damaged_qty: this.damagedQty,
      occupied_since: null
    };
  }
}

/**
 * RoomKey Entity
 * Represents physical keys for singleton campus activity spaces (Dance Room, Music Room).
 * Blueprint Rule 2: Occupied rooms expose "Occupied since [Time]" without leaking student PII.
 */
export class RoomKey extends SACItem {
  private occupiedSince: Date | null;

  constructor(
    id: string,
    name: string,
    category: string,
    totalQty: number = 1,
    availableQty: number = 1,
    occupiedSince: Date | null = null
  ) {
    if (totalQty !== 1) {
      throw new ValidationException(
        'Room keys represent a single physical room key (totalQty must be 1).'
      );
    }
    super(id, name, category, 'ROOM_KEY', totalQty, availableQty);
    this.occupiedSince = occupiedSince;
  }

  public getOccupiedSince(): Date | null {
    return this.occupiedSince;
  }

  public override getMaxAllocatablePerCheckout(): number {
    return 1;
  }

  protected override validateRequestedQuantity(qty: number): void {
    if (qty <= 0 || !Number.isInteger(qty)) {
      throw new ValidationException('Allocation quantity must be greater than zero.');
    }
    if (qty !== 1) {
      throw new ValidationException('Room key can only be allocated 1 unit at a time.');
    }
  }

  protected override assertCanAllocate(_qty: number): void {
    if (this.availableQty <= 0 || this.occupiedSince !== null) {
      throw new InvalidStateTransitionException(
        `Room '${this.name}' is already occupied since ${this.occupiedSince?.toISOString() || 'earlier'}.`
      );
    }
  }

  protected override applyAllocation(_qty: number, now: Date): void {
    this.availableQty = 0;
    this.occupiedSince = now;
  }

  protected override applyRelease(qty: number): void {
    if (qty !== 1) {
      throw new ValidationException('Room key can only be released 1 unit at a time.');
    }
    this.availableQty = 1;
    this.occupiedSince = null;
  }

  protected override applyDamage(_qty: number): void {
    // Even if a room key tag is damaged, clear active occupancy timestamp without restoring circulation
    this.availableQty = 0;
    this.occupiedSince = null;
  }

  public override toInventoryDTO(activeHolderItemIds?: ReadonlySet<string>): SACItemInventoryDTO {
    const occupiedSinceIso = this.occupiedSince ? this.occupiedSince.toISOString() : null;
    const hasActiveStudentCheckout = activeHolderItemIds ? activeHolderItemIds.has(this.id) : false;
    const isFacultySession = Boolean(occupiedSinceIso && !hasActiveStudentCheckout);

    return {
      id: this.id,
      name: this.name,
      category: this.category,
      itemType: this.itemType,
      totalQty: this.totalQty,
      availableQty: this.availableQty,
      isAvailable: this.isAvailable(),
      occupiedSince: occupiedSinceIso,
      hasActiveStudentCheckout,
      isFacultySession
    };
  }

  public override toRealtimePayload(): Record<string, unknown> {
    return {
      itemId: this.id,
      name: this.name,
      category: this.category,
      itemType: this.itemType,
      totalQty: this.totalQty,
      availableQty: this.availableQty,
      occupiedSince: this.occupiedSince ? this.occupiedSince.toISOString() : null,
      timestamp: new Date().toISOString()
    };
  }

  public override toPersistenceRecord(): SACItemPersistenceRecord {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      item_type: 'ROOM_KEY',
      total_qty: 1,
      available_qty: this.availableQty,
      damaged_qty: 0,
      occupied_since: this.occupiedSince ? this.occupiedSince.toISOString() : null
    };
  }
}
