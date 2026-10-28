import { SACItem, SportsEquipment, RoomKey, type ItemType } from '../../domain.entities/SACItem.js';
import { DatabaseConnection } from '../DatabaseConnection.js';

export class SACItemRepository {
  private db: DatabaseConnection;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  private mapRowToEntity(row: any): SACItem {
    if (row.item_type === 'ROOM_KEY') {
      return new RoomKey(
        row.id,
        row.name,
        row.category,
        row.total_qty ?? 1,
        row.available_qty ?? 1,
        row.occupied_since ? new Date(row.occupied_since) : null
      );
    }
    return new SportsEquipment(
      row.id,
      row.name,
      row.category,
      row.total_qty,
      row.available_qty,
      row.damaged_qty ?? 0
    );
  }

  public async findAll(): Promise<SACItem[]> {
    const supabase = this.db.getSupabase();
    if (!supabase) {
      throw new Error('Supabase client is not initialized.');
    }
    const { data, error } = await supabase
      .from('sac_items')
      .select('*')
      .order('name');

    if (error) {
      throw new Error(`Failed to fetch inventory: ${error.message}`);
    }

    return (data || []).map((row) => this.mapRowToEntity(row));
  }

  public async findById(id: string): Promise<SACItem | null> {
    const supabase = this.db.getSupabase();
    if (!supabase) {
      throw new Error('Supabase client is not initialized.');
    }
    const { data, error } = await supabase
      .from('sac_items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch SAC item ${id}: ${error.message}`);
    }
    if (!data) return null;

    return this.mapRowToEntity(data);
  }

  public async save(item: SACItem): Promise<void> {
    const supabase = this.db.getSupabase();
    if (!supabase) {
      throw new Error('Supabase client is not initialized.');
    }

    const payload: any = {
      name: item.getName(),
      category: item.getCategory(),
      item_type: item.getItemType(),
      total_qty: item.getTotalQty(),
      available_qty: item.getAvailableQty()
    };

    if (item instanceof SportsEquipment) {
      payload.damaged_qty = item.getDamagedQty();
      payload.occupied_since = null;
    } else if (item instanceof RoomKey) {
      payload.damaged_qty = 0;
      payload.occupied_since = item.getOccupiedSince()?.toISOString() || null;
    }

    const { error } = await supabase
      .from('sac_items')
      .update(payload)
      .eq('id', item.getId());

    if (error) {
      throw new Error(`Failed to update SAC item ${item.getId()}: ${error.message}`);
    }
  }

  public async create(item: SACItem): Promise<SACItem> {
    const supabase = this.db.getSupabase();
    if (!supabase) {
      throw new Error('Supabase client is not initialized.');
    }

    const payload: any = {
      id: item.getId(),
      name: item.getName(),
      category: item.getCategory(),
      item_type: item.getItemType(),
      total_qty: item.getTotalQty(),
      available_qty: item.getAvailableQty(),
      damaged_qty: item instanceof SportsEquipment ? item.getDamagedQty() : 0,
      occupied_since: item instanceof RoomKey ? item.getOccupiedSince()?.toISOString() : null
    };

    const { data, error } = await supabase
      .from('sac_items')
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert SAC item: ${error.message}`);
    }

    return this.mapRowToEntity(data);
  }
}
