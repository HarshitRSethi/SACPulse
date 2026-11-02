import crypto from 'crypto';
import {
  RoomKey,
  SACItem,
  SportsEquipment,
  type ItemType
} from '../entities/SACItem.js';
import { ValidationException } from '../exceptions/DomainException.js';

export interface CreateSACItemParams {
  id?: string;
  name: string;
  category: string;
  itemType: ItemType;
  totalQty?: number;
  availableQty?: number;
  damagedQty?: number;
  occupiedSince?: Date | string | null;
}

export interface SACItemRowRecord {
  id: string;
  name: string;
  category: string;
  item_type: string;
  total_qty?: number | null;
  available_qty?: number | null;
  damaged_qty?: number | null;
  occupied_since?: string | Date | null;
}

/**
 * GoF Factory Method Pattern: SACItemFactory
 *
 * Centralizes polymorphic instantiation of `SportsEquipment` vs. `RoomKey`
 * so Controllers and Repositories never duplicate branching creation rules.
 */
export class SACItemFactory {
  public static create(params: CreateSACItemParams): SACItem {
    if (!params.name || !params.category || !params.itemType) {
      throw new ValidationException(
        'name, category, and itemType (EQUIPMENT | ROOM_KEY) are required.'
      );
    }

    const id = params.id || crypto.randomUUID();
    const normalizedType = params.itemType.toUpperCase() as ItemType;

    if (normalizedType === 'ROOM_KEY') {
      const available = params.availableQty ?? 1;
      const occupiedSince = params.occupiedSince
        ? params.occupiedSince instanceof Date
          ? params.occupiedSince
          : new Date(params.occupiedSince)
        : null;
      return new RoomKey(id, params.name, params.category, 1, available, occupiedSince);
    }

    if (normalizedType === 'EQUIPMENT') {
      const total = Number(params.totalQty ?? 1);
      const available = Number(params.availableQty ?? total);
      const damaged = Number(params.damagedQty ?? 0);
      return new SportsEquipment(id, params.name, params.category, total, available, damaged);
    }

    throw new ValidationException(
      `Unsupported SACItem type '${String(params.itemType)}'. Expected 'EQUIPMENT' or 'ROOM_KEY'.`
    );
  }

  public static fromDatabaseRow(row: SACItemRowRecord): SACItem {
    return SACItemFactory.create({
      id: row.id,
      name: row.name,
      category: row.category,
      itemType: row.item_type as ItemType,
      totalQty: row.total_qty ?? 1,
      availableQty: row.available_qty ?? (row.item_type === 'ROOM_KEY' ? 1 : (row.total_qty ?? 1)),
      damagedQty: row.damaged_qty ?? 0,
      occupiedSince: row.occupied_since ?? null
    });
  }
}

