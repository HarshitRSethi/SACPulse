export type ItemType = 'EQUIPMENT' | 'ROOM_KEY';

/**
 * Abstract Base SACItem
 * Employs the Template Method pattern: defines invariant properties and common interface,
 * while delegating polymorphic allocateUnit and releaseUnit logic to subclasses.
 */
export abstract class SACItem {
  protected readonly id: string;
  protected name: string;
  protected category: string;
  protected readonly itemType: ItemType;
  protected totalQty: number;
  protected availableQty: number;

  constructor(
    id: string,
    name: string,
    category: string,
    itemType: ItemType,
    totalQty: number,
    availableQty: number
  ) {
    if (!id || !name || !category) {
      throw new Error('SACItem requires id, name, and category.');
    }
    if (totalQty < 0 || availableQty < 0) {
      throw new Error('Quantities cannot be negative.');
    }
    if (availableQty > totalQty) {
      throw new Error('Available quantity cannot exceed total quantity.');
    }
    this.id = id;
    this.name = name;
    this.category = category;
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

  public isAvailable(): boolean {
    return this.availableQty > 0;
  }

  /**
   * Abstract Polymorphic allocation method.
   * SportsEquipment decrements available count.
   * RoomKey marks room as occupied with timestamp.
   */
  public abstract allocateUnit(qty?: number, now?: Date): void;

  /**
   * Abstract Polymorphic release method.
   * SportsEquipment increments available count.
   * RoomKey resets available to 1 and clears occupied timestamp.
   */
  public abstract releaseUnit(qty?: number): void;
}

/**
 * SportsEquipment Entity
 * Represents physical multi-unit gear (TT Rackets, Balls, Tennis Rackets, Board Games).
 * Tracks damaged units separately.
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
      throw new Error('Damaged quantity cannot be negative.');
    }
    if (availableQty + damagedQty > totalQty) {
      throw new Error('Sum of available and damaged quantities cannot exceed total quantity.');
    }
    this.damagedQty = damagedQty;
  }

  public getDamagedQty(): number {
    return this.damagedQty;
  }

  public override allocateUnit(qty: number = 1): void {
    if (qty <= 0) {
      throw new Error('Allocation quantity must be greater than zero.');
    }
    if (this.availableQty < qty) {
      throw new Error(
        `Insufficient stock for equipment '${this.name}'. Requested: ${qty}, Available: ${this.availableQty}`
      );
    }
    this.availableQty -= qty;
  }

  public override releaseUnit(qty: number = 1): void {
    if (qty <= 0) {
      throw new Error('Release quantity must be greater than zero.');
    }
    const functionalStock = this.totalQty - this.damagedQty;
    if (this.availableQty + qty > functionalStock) {
      throw new Error(
        `Cannot release ${qty} units of '${this.name}'. Resulting available (${this.availableQty + qty}) would exceed functional stock (${functionalStock}).`
      );
    }
    this.availableQty += qty;
  }

  /**
   * Blueprint Rule 7: Damaged return records damage without returning unit to available stock.
   */
  public recordDamage(qty: number = 1): void {
    if (qty <= 0) {
      throw new Error('Damaged quantity must be greater than zero.');
    }
    if (this.damagedQty + qty > this.totalQty) {
      throw new Error(`Damaged units cannot exceed total quantity (${this.totalQty}).`);
    }
    this.damagedQty += qty;
  }
}

/**
 * RoomKey Entity
 * Represents physical keys for campus activity rooms (Dance Room, Music Room).
 * Blueprint Rule 2: Occupied rooms show "Occupied since [Time]". Single occupancy (totalQty = 1).
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
      throw new Error('Room keys represent a single physical room key (totalQty must be 1).');
    }
    super(id, name, category, 'ROOM_KEY', totalQty, availableQty);
    this.occupiedSince = occupiedSince;
  }

  public getOccupiedSince(): Date | null {
    return this.occupiedSince;
  }

  public override allocateUnit(qty: number = 1, now: Date = new Date()): void {
    if (qty !== 1) {
      throw new Error('Room key can only be allocated 1 unit at a time.');
    }
    if (this.availableQty <= 0 || this.occupiedSince !== null) {
      throw new Error(`Room '${this.name}' is already occupied since ${this.occupiedSince?.toISOString() || 'earlier'}.`);
    }
    this.availableQty = 0;
    this.occupiedSince = now;
  }

  public override releaseUnit(qty: number = 1): void {
    if (qty !== 1) {
      throw new Error('Room key can only be released 1 unit at a time.');
    }
    this.availableQty = 1;
    this.occupiedSince = null;
  }
}
