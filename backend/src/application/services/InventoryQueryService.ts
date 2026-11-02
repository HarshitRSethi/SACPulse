import { InventoryCatalog } from '../../domain/entities/InventoryCatalog.js';
import type { SACItemInventoryDTO } from '../../domain/entities/SACItem.js';
import type { IRegisterLogRepository } from '../../domain/repositories/IRegisterLogRepository.js';
import type { ISACItemRepository } from '../../domain/repositories/ISACItemRepository.js';

/**
 * InventoryQueryService
 *
 * Uses OOP Aggregation (`InventoryCatalog o-- SACItem`) and polymorphic `item.toInventoryDTO()`
 * to serve privacy-safe live campus inventory feeds without raw database queries in controllers.
 */
export class InventoryQueryService {
  private readonly itemRepo: ISACItemRepository;
  private readonly registerLogRepo: IRegisterLogRepository;

  constructor(itemRepo: ISACItemRepository, registerLogRepo: IRegisterLogRepository) {
    this.itemRepo = itemRepo;
    this.registerLogRepo = registerLogRepo;
  }

  public async getPrivacySafeCampusFeed(): Promise<SACItemInventoryDTO[]> {
    const [items, activeHeldItemIds] = await Promise.all([
      this.itemRepo.findAll(),
      this.registerLogRepo.getActiveHeldItemIds()
    ]);

    const catalog = new InventoryCatalog(items);
    return catalog.toPrivacySafeCampusFeed(activeHeldItemIds);
  }
}

