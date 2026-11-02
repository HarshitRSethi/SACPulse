import { EntityNotFoundException, ValidationException } from '../exceptions/DomainException.js';
import type { RegisterEntry, RegisterStatus } from './RegisterEntry.js';
import type { SACItem } from './SACItem.js';

export interface ActiveBatchUnitDTO {
  id: string;
  itemId: string;
  itemName: string;
  category: string;
  status: RegisterStatus;
  pendingTransferToId: string | null;
}

export interface ActiveBatchDTO {
  batchId: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  mobileNo: string;
  arrivalTime: string;
  units: ActiveBatchUnitDTO[];
}

/**
 * CheckoutBatch Domain Composite
 *
 * Demonstrates OOP Composition (`CheckoutBatch *-- RegisterEntry`):
 * When a multi-unit bundle (e.g., 2x TT Racket + 1x TT Ball) is approved at the counter,
 * the physical unit holdings belong to one `CheckoutBatch` identified by `batchId`.
 */
export class CheckoutBatch {
  private readonly batchId: string;
  private readonly units: RegisterEntry[];

  constructor(batchId: string, units: RegisterEntry[]) {
    if (!batchId) {
      throw new ValidationException('CheckoutBatch requires a valid batchId.');
    }
    if (!units || units.length === 0) {
      throw new ValidationException('CheckoutBatch must contain at least one RegisterEntry unit.');
    }
    for (const unit of units) {
      if (unit.getBatchId() !== batchId) {
        throw new ValidationException(
          `RegisterEntry '${unit.getId()}' belongs to batch '${unit.getBatchId()}', expected '${batchId}'.`
        );
      }
    }
    this.batchId = batchId;
    this.units = [...units];
  }

  /**
   * Groups a flat list of active RegisterEntry rows into CheckoutBatch aggregates.
   * Note: If a single unit within a batch was peer-transferred to Student B, we group by
   * `(batchId, studentId)` when projecting per-holder cards, or strictly by `batchId` when requested.
   */
  public static groupEntriesByBatch(entries: readonly RegisterEntry[]): CheckoutBatch[] {
    const grouped = new Map<string, RegisterEntry[]>();
    for (const entry of entries) {
      const bId = entry.getBatchId();
      if (!grouped.has(bId)) {
        grouped.set(bId, []);
      }
      grouped.get(bId)!.push(entry);
    }
    return Array.from(grouped.entries()).map(([id, list]) => new CheckoutBatch(id, list));
  }

  /**
   * Groups active entries by `(batchId + holder studentId)` so if Student A transferred 1 racket
   * of a 2-racket batch to Student B, the Guard Desk shows Student A's remaining holding AND
   * Student B's new holding with accurate holder Name, Roll No, and clickable Mobile No!
   */
  public static groupActiveHoldingsForGuardDesk(entries: readonly RegisterEntry[]): ActiveBatchDTO[] {
    const grouped = new Map<string, ActiveBatchDTO>();

    for (const entry of entries) {
      if (!entry.isActiveHolding()) continue;
      // Group key ensures peer-transferred units immediately display the new holder's identity on Guard Desk
      const groupKey = `${entry.getBatchId()}::${entry.getStudentId()}`;
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          batchId: entry.getBatchId(),
          studentId: entry.getStudentId(),
          studentName: entry.getStudentName(),
          rollNo: entry.getRollNo(),
          mobileNo: entry.getMobileNo(),
          arrivalTime: entry.getArrivalTime().toISOString(),
          units: []
        });
      }
      grouped.get(groupKey)!.units.push({
        id: entry.getId(),
        itemId: entry.getItemId(),
        itemName: entry.getItemName(),
        category: entry.getCategory(),
        status: entry.getStatus(),
        pendingTransferToId: entry.getPendingTransferToId()
      });
    }

    return Array.from(grouped.values());
  }

  public getBatchId(): string {
    return this.batchId;
  }

  public getUnits(): RegisterEntry[] {
    return [...this.units];
  }

  public getActiveUnits(): RegisterEntry[] {
    return this.units.filter((u) => u.isActiveHolding());
  }

  /**
   * Closes all active units in the batch intact and releases corresponding inventory stock.
   */
  public returnAllActiveIntact(itemsById: ReadonlyMap<string, SACItem>, now: Date = new Date()): number {
    let returnedCount = 0;
    for (const unit of this.units) {
      if (unit.isActiveHolding()) {
        const item = itemsById.get(unit.getItemId());
        if (!item) {
          throw new EntityNotFoundException('SACItem', unit.getItemId());
        }
        unit.closeOnGuardReturn(false, now);
        item.checkin(1, false, now);
        returnedCount += 1;
      }
    }
    return returnedCount;
  }
}

