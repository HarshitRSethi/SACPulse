import { IssueRequest, type RequestedItem, type IssueRequestStatus } from '../../domain.entities/IssueRequest.js';
import { DatabaseConnection } from '../DatabaseConnection.js';
import type { ITTLPersistenceDelegate } from '../../domain.services/IssueRequestTTLScheduler.js';

export class IssueRequestRepository implements ITTLPersistenceDelegate {
  private db: DatabaseConnection;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  private mapRowToEntity(row: any): IssueRequest {
    return new IssueRequest(
      row.id,
      row.student_id,
      (row.requested_items || []) as RequestedItem[],
      row.status as IssueRequestStatus,
      new Date(row.created_at),
      new Date(row.expires_at),
      row.approved_by_id || null
    );
  }

  public async create(request: IssueRequest): Promise<IssueRequest> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

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
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert issue request: ${error.message}`);
    }

    return this.mapRowToEntity(data);
  }

  public async findById(id: string): Promise<IssueRequest | null> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { data, error } = await supabase
      .from('issue_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find issue request ${id}: ${error.message}`);
    }
    if (!data) return null;

    return this.mapRowToEntity(data);
  }

  public async findPending(): Promise<IssueRequest[]> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

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

  public async markRequestTimedOut(requestId: string): Promise<boolean> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    // Only transition if currently PENDING
    const { data, error } = await supabase
      .from('issue_requests')
      .update({ status: 'TIMED_OUT' })
      .eq('id', requestId)
      .eq('status', 'PENDING')
      .select();

    if (error) {
      console.error(`Error marking request ${requestId} timed out:`, error);
      return false;
    }

    return Array.isArray(data) && data.length > 0;
  }

  public async countTrailingTimeoutsLastHour(studentId: string): Promise<number> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

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
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { error } = await supabase
      .from('users')
      .update({ penalty_until: penaltyUntil.toISOString() })
      .eq('id', studentId);

    if (error) {
      throw new Error(`Failed to apply 5h cooldown penalty to ${studentId}: ${error.message}`);
    }
  }

  public async getRequestById(requestId: string): Promise<IssueRequest | null> {
    return this.findById(requestId);
  }
}
