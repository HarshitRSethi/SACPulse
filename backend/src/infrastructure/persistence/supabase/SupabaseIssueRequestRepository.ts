import {
  IssueRequest,
  type IssueRequestStatus,
  type RequestedItem
} from '../../../domain/entities/IssueRequest.js';
import type { IIssueRequestRepository } from '../../../domain/repositories/IIssueRequestRepository.js';
import { DatabaseConnection } from '../DatabaseConnection.js';

export class SupabaseIssueRequestRepository implements IIssueRequestRepository {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection = DatabaseConnection.getInstance()) {
    this.db = db;
  }

  private mapRowToEntity(row: any): IssueRequest {
    const rawItems: any[] = Array.isArray(row.requested_items) ? row.requested_items : [];
    const normalizedItems: RequestedItem[] = rawItems.map((i) => ({
      itemId: i.itemId || i.item_id,
      name: i.name,
      qty: Number(i.qty ?? 1)
    }));

    return new IssueRequest(
      row.id,
      row.student_id,
      normalizedItems,
      row.status as IssueRequestStatus,
      new Date(row.created_at),
      new Date(row.expires_at),
      row.approved_by_id || null
    );
  }

  public async create(request: IssueRequest): Promise<IssueRequest> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase
      .from('issue_requests')
      .insert({
        id: request.getId(),
        student_id: request.getStudentId(),
        requested_items: request.getRequestedItems(),
        status: request.getStatus(),
        created_at: request.getCreatedAt().toISOString(),
        expires_at: request.getExpiresAt().toISOString(),
        approved_by_id: request.getApprovedById()
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to insert issue request: ${error.message}`);
    }
    return this.mapRowToEntity(data);
  }

  public async findById(id: string): Promise<IssueRequest | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return null;
    }
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase
      .from('issue_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find issue request ${id}: ${error.message}`);
    }
    return data ? this.mapRowToEntity(data) : null;
  }

  public async findPending(): Promise<IssueRequest[]> {
    const supabase = this.db.requireSupabase();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('issue_requests')
      .select('*')
      .eq('status', 'PENDING')
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch pending requests: ${error.message}`);
    }
    return (data || []).map((row) => this.mapRowToEntity(row));
  }

  public async findAllPendingStatus(): Promise<IssueRequest[]> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase
      .from('issue_requests')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch all PENDING requests for recovery: ${error.message}`);
    }
    return (data || []).map((row) => this.mapRowToEntity(row));
  }

  public async findAllPendingUnexpiredOrOverdue(): Promise<IssueRequest[]> {
    return this.findAllPendingStatus();
  }

  public async markRequestTimedOut(requestId: string): Promise<boolean> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase
      .from('issue_requests')
      .update({ status: 'TIMED_OUT' })
      .eq('id', requestId)
      .eq('status', 'PENDING')
      .select('id');

    if (error) {
      console.error(`Error marking request ${requestId} timed out:`, error);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  }

  public async countTrailingTimeoutsLastHour(studentId: string): Promise<number> {
    const supabase = this.db.requireSupabase();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from('issue_requests')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('status', 'TIMED_OUT')
      .gte('created_at', oneHourAgo);

    if (error) {
      throw new Error(`Failed to count trailing strikes: ${error.message}`);
    }
    return count ?? 0;
  }

  public async applyStudentPenalty(studentId: string, penaltyUntil: Date): Promise<void> {
    const supabase = this.db.requireSupabase();
    const { error } = await supabase
      .from('users')
      .update({ penalty_until: penaltyUntil.toISOString() })
      .eq('id', studentId);

    if (error) {
      throw new Error(`Failed to apply cooldown penalty to ${studentId}: ${error.message}`);
    }
  }

  public async getRequestById(requestId: string): Promise<IssueRequest | null> {
    return this.findById(requestId);
  }
}
