import type { SACItem } from '../../../domain/entities/SACItem.js';
import { SACItemFactory } from '../../../domain/factories/SACItemFactory.js';
import type { ISACItemRepository } from '../../../domain/repositories/ISACItemRepository.js';
import { DatabaseConnection } from '../DatabaseConnection.js';

export class SupabaseSACItemRepository implements ISACItemRepository {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection = DatabaseConnection.getInstance()) {
    this.db = db;
  }

  public async findAll(): Promise<SACItem[]> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase
      .from('sac_items')
      .select('*')
      .or('is_archived.is.null,is_archived.eq.false')
      .order('name');

    if (error) {
      throw new Error(`Failed to fetch inventory: ${error.message}`);
    }

    return (data || []).map((row) => SACItemFactory.fromDatabaseRow(row));
  }

  public async findById(id: string): Promise<SACItem | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return null;
    }
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase
      .from('sac_items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch SAC item ${id}: ${error.message}`);
    }
    return data ? SACItemFactory.fromDatabaseRow(data) : null;
  }

  public async save(item: SACItem): Promise<void> {
    const supabase = this.db.requireSupabase();
    // Polymorphic persistence projection — zero `instanceof` branching!
    const record = item.toPersistenceRecord();
    const { id: _omitId, ...updateFields } = record;

    const { error } = await supabase
      .from('sac_items')
      .update(updateFields)
      .eq('id', item.getId());

    if (error) {
      throw new Error(`Failed to update SAC item ${item.getId()}: ${error.message}`);
    }
  }

  public async create(item: SACItem): Promise<SACItem> {
    const supabase = this.db.requireSupabase();
    const record = item.toPersistenceRecord();

    const { data, error } = await supabase
      .from('sac_items')
      .insert(record)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to insert SAC item: ${error.message}`);
    }
    return SACItemFactory.fromDatabaseRow(data);
  }

  public async delete(id: string): Promise<void> {
    const supabase = this.db.requireSupabase();
    const { error: deleteError } = await supabase.from('sac_items').delete().eq('id', id);

    if (deleteError) {
      const { error: archiveError } = await supabase
        .from('sac_items')
        .update({ is_archived: true })
        .eq('id', id);

      if (archiveError) {
        throw new Error(`Failed to delete or archive SAC item ${id}: ${archiveError.message}`);
      }
    }
  }
}
