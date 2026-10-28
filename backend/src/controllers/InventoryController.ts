import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { SACItemRepository } from '../infrastructure.persistence/repositories/SACItemRepository.js';
import { RoomKey } from '../domain.entities/SACItem.js';

export class InventoryController extends BaseController {
  private itemRepo: SACItemRepository;

  constructor() {
    super();
    this.itemRepo = new SACItemRepository();
  }

  /**
   * GET /api/inventory
   * Blueprint Rule 2 (Privacy-Safe):
   * All logged-in students can view live stock. Occupied rooms show
   * "Occupied since [Time]" only—never expose holder Name/Phone to students.
   */
  public getInventory = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const items = await this.itemRepo.findAll();

      const responseDto = items.map((item) => {
        const base = {
          id: item.getId(),
          name: item.getName(),
          category: item.getCategory(),
          itemType: item.getItemType(),
          totalQty: item.getTotalQty(),
          availableQty: item.getAvailableQty(),
          isAvailable: item.isAvailable()
        };

        if (item instanceof RoomKey) {
          return {
            ...base,
            occupiedSince: item.getOccupiedSince() ? item.getOccupiedSince()!.toISOString() : null
          };
        }

        return base;
      });

      return this.ok(res, responseDto);
    } catch (err: any) {
      return this.fail(res, err);
    }
  };
}
