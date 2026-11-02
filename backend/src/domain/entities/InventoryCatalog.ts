import type { SACItem, SACItemInventoryDTO } from './SACItem.js';

export interface CatalogSummaryMetrics {
  totalDistinctItems: number;
  totalPhysicalUnits: number;
  availablePhysicalUnits: number;
  occupiedRoomsCount: number;
  categories: string[];
}

/**
 * InventoryCatalog Domain Aggregate Helper
 *
 * Demonstrates OOP Aggregation (`InventoryCatalog o-- SACItem`):
 * `SACItem` instances have an independent persistence lifecycle in `ISACItemRepository`,
 * while `InventoryCatalog` aggregates a collection of `SACItem` references to perform
 * domain-level filtering, category discovery, and privacy-safe campus projections.
 */
export class InventoryCatalog {
  private readonly itemsById: Map<string, SACItem>;

  constructor(items: readonly SACItem[] = []) {
    this.itemsById = new Map();
    for (const item of items) {
      this.itemsById.set(item.getId(), item);
    }
  }

  public getAll(): SACItem[] {
    return Array.from(this.itemsById.values());
  }

  public findById(itemId: string): SACItem | undefined {
    return this.itemsById.get(itemId);
  }

  public getCategories(): string[] {
    const categories = new Set<string>();
    for (const item of this.itemsById.values()) {
      categories.add(item.getCategory());
    }
    return Array.from(categories).sort();
  }

  public filterByCategory(category: string): SACItem[] {
    if (!category || category === 'All') {
      return this.getAll();
    }
    return this.getAll().filter((item) => item.getCategory() === category);
  }

  public search(query: string): SACItem[] {
    const clean = query.trim().toLowerCase();
    if (!clean) {
      return this.getAll();
    }
    return this.getAll().filter(
      (item) =>
        item.getName().toLowerCase().includes(clean) ||
        item.getCategory().toLowerCase().includes(clean) ||
        item.getItemType().toLowerCase().includes(clean)
    );
  }

  public toPrivacySafeCampusFeed(activeHolderItemIds: ReadonlySet<string>): SACItemInventoryDTO[] {
    return this.getAll().map((item) => item.toInventoryDTO(activeHolderItemIds));
  }

  public computeMetrics(): CatalogSummaryMetrics {
    let totalPhysicalUnits = 0;
    let availablePhysicalUnits = 0;
    let occupiedRoomsCount = 0;

    for (const item of this.itemsById.values()) {
      totalPhysicalUnits += item.getTotalQty();
      availablePhysicalUnits += item.getAvailableQty();
      if (item.getItemType() === 'ROOM_KEY' && !item.isAvailable()) {
        occupiedRoomsCount += 1;
      }
    }

    return {
      totalDistinctItems: this.itemsById.size,
      totalPhysicalUnits,
      availablePhysicalUnits,
      occupiedRoomsCount,
      categories: this.getCategories()
    };
  }
}

