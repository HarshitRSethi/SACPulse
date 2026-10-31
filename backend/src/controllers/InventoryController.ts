import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { SACItemRepository } from '../infrastructure.persistence/repositories/SACItemRepository.js';
import { RoomKey } from '../domain.entities/SACItem.js';
import { DatabaseConnection } from '../infrastructure.persistence/DatabaseConnection.js';

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

      // Check active holdings in register_logs
      let activeRoomIds = new Set<string>();
      const supabase = DatabaseConnection.getInstance().getSupabase();
      if (supabase) {
        const { data: activeLogs } = await supabase
          .from('register_logs')
          .select('item_id')
          .in('status', ['ISSUED', 'ISSUED_TRANSFER_PENDING']);
        if (activeLogs) {
          activeRoomIds = new Set(activeLogs.map((l: any) => l.item_id));
        }
      }

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
          const occupiedSince = item.getOccupiedSince() ? item.getOccupiedSince()!.toISOString() : null;
          const hasActiveStudentCheckout = activeRoomIds.has(item.getId());
          const isFacultySession = Boolean(occupiedSince && !hasActiveStudentCheckout);

          return {
            ...base,
            occupiedSince,
            hasActiveStudentCheckout,
            isFacultySession
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
