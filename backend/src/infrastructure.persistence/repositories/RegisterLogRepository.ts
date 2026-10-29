import { RegisterEntry, type RegisterStatus } from '../../domain.entities/RegisterEntry.js';
import { DatabaseConnection } from '../DatabaseConnection.js';

export class RegisterLogRepository {
  private db: DatabaseConnection;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  private mapRowToEntity(row: any): RegisterEntry {
    return new RegisterEntry(
      row.id,
      row.batch_id,
      row.student_id,
      row.student_name,
      row.roll_no,
      row.mobile_no,
      row.item_id,
      row.item_name,
      row.category,
      new Date(row.arrival_time),
      row.departure_time ? new Date(row.departure_time) : null,
      row.status as RegisterStatus,
      row.pending_transfer_to_id || null
    );
  }

  public async findById(id: string): Promise<RegisterEntry | null> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { data, error } = await supabase
      .from('register_logs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch register entry ${id}: ${error.message}`);
    }
    if (!data) return null;

    return this.mapRowToEntity(data);
  }

  public async findByBatchId(batchId: string): Promise<RegisterEntry[]> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { data, error } = await supabase
      .from('register_logs')
      .select('*')
      .eq('batch_id', batchId)
      .order('arrival_time', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch entries for batch ${batchId}: ${error.message}`);
    }

    return (data || []).map((row) => this.mapRowToEntity(row));
  }

  public async findActive(filter?: { studentId?: string; batchId?: string }): Promise<RegisterEntry[]> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    let query = supabase
      .from('register_logs')
      .select('*')
      .in('status', ['ISSUED', 'ISSUED_TRANSFER_PENDING'])
      .order('arrival_time', { ascending: false });

    if (filter?.studentId) {
      query = query.eq('student_id', filter.studentId);
    }
    if (filter?.batchId) {
      query = query.eq('batch_id', filter.batchId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch active register entries: ${error.message}`);
    }

    return (data || []).map((row) => this.mapRowToEntity(row));
  }

  public async findPendingIncomingTransfers(recipientStudentId: string): Promise<RegisterEntry[]> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { data, error } = await supabase
      .from('register_logs')
      .select('*')
      .eq('status', 'ISSUED_TRANSFER_PENDING')
      .eq('pending_transfer_to_id', recipientStudentId);

    if (error) {
      throw new Error(`Failed to fetch incoming transfers for ${recipientStudentId}: ${error.message}`);
    }

    return (data || []).map((row) => this.mapRowToEntity(row));
  }

  public async initiateTransfer(entryId: string, peerId: string): Promise<void> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { error } = await supabase
      .from('register_logs')
      .update({
        status: 'ISSUED_TRANSFER_PENDING',
        pending_transfer_to_id: peerId
      })
      .eq('id', entryId)
      .eq('status', 'ISSUED');

    if (error) {
      throw new Error(`Failed to initiate transfer: ${error.message}`);
    }
  }

  public async cancelTransfer(entryId: string): Promise<void> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { error } = await supabase
      .from('register_logs')
      .update({
        status: 'ISSUED',
        pending_transfer_to_id: null
      })
      .eq('id', entryId)
      .eq('status', 'ISSUED_TRANSFER_PENDING');

    if (error) {
      throw new Error(`Failed to cancel transfer: ${error.message}`);
    }
  }

  /**
   * Stored Procedure Transaction: Approve Issue Request
   * Allocates equipment/room, decrements stock, inserts 1 row per physical unit sharing batch_id.
   */
  public async approveIssueRequestTx(
    requestId: string,
    guardId: string
  ): Promise<{ batch_id: string; units_issued: number; student_id: string }> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { data, error } = await supabase.rpc('approve_issue_request_tx', {
      p_request_id: requestId,
      p_guard_id: guardId
    });

    if (error) {
      throw new Error(`Approval transaction failed: ${error.message}`);
    }

    return data;
  }

  /**
   * Stored Procedure Transaction: Atomic P2P Transfer Split
   * Closes original row (RETURNED_VIA_TRANSFER), inserts new row for peer (ISSUED) with same batch_id.
   */
  public async executeTransferSplitTx(
    entryId: string,
    recipientId: string
  ): Promise<{ old_entry_id: string; new_entry_id: string; batch_id: string; recipient_name: string }> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { data, error } = await supabase.rpc('execute_transfer_split_tx', {
      p_entry_id: entryId,
      p_recipient_id: recipientId
    });

    if (error) {
      throw new Error(`Transfer atomic split failed: ${error.message}`);
    }

    return data;
  }

  /**
   * Stored Procedure Transaction: Guard Unit Return (Intact or Damaged)
   * Wipes pending_transfer_to_id, sets departure_time, updates inventory stock,
   * and sets is_defaulter=TRUE if damaged.
   */
  public async closeGuardReturnTx(
    entryId: string,
    isDamaged: boolean
  ): Promise<{ entry_id: string; status: string; item_id: string; student_id: string }> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { data, error } = await supabase.rpc('close_guard_return_tx', {
      p_entry_id: entryId,
      p_is_damaged: isDamaged
    });

    if (error) {
      throw new Error(`Guard return transaction failed: ${error.message}`);
    }

    return data;
  }

  /**
   * Stored Procedure Transaction: Guard Batch Return Intact
   * Returns all active items in batch intact.
   */
  public async closeGuardBatchReturnTx(
    batchId: string
  ): Promise<{ batch_id: string; returned_count: number }> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { data, error } = await supabase.rpc('close_guard_batch_return_tx', {
      p_batch_id: batchId
    });

    if (error) {
      throw new Error(`Guard batch return failed: ${error.message}`);
    }

    return data;
  }

  /**
   * Master Log Query for Admin Console & CSV Export
   * Supports pagination: LIMIT limit OFFSET (page - 1) * limit
   */
  public async getMasterLogs(options?: {
    startDate?: string;
    endDate?: string;
    status?: string;
    page?: number;
    limit?: number;
    unpaginated?: boolean;
  }): Promise<{ logs: any[]; totalCount: number; todayCount: number; totalPages: number; currentPage: number }> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const page = options?.page && options.page > 0 ? options.page : 1;
    const limit = options?.limit && options.limit > 0 ? options.limit : 25;
    const unpaginated = options?.unpaginated ?? false;

    let query = supabase
      .from('register_logs')
      .select('*', { count: 'exact' })
      .order('arrival_time', { ascending: false });

    if (options?.status && options.status !== 'ALL') {
      query = query.eq('status', options.status);
    }
    if (options?.startDate) {
      query = query.gte('arrival_time', options.startDate);
    }
    if (options?.endDate) {
      query = query.lte('arrival_time', options.endDate);
    }

    if (!unpaginated) {
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);
    }

    // Today's activity count: arrival_time >= local start of day
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayIso = startOfToday.toISOString();

    const todayQuery = supabase
      .from('register_logs')
      .select('*', { count: 'exact', head: true })
      .gte('arrival_time', todayIso);

    const [{ data, count, error }, { count: todayCountVal, error: todayError }] = await Promise.all([
      query,
      todayQuery
    ]);

    if (error) {
      throw new Error(`Failed to query master register logs: ${error.message}`);
    }
    if (todayError) {
      console.warn('Failed to query todayCount for register logs:', todayError.message);
    }

    const logs = data || [];
    const totalCount = count !== null && count !== undefined ? count : logs.length;
    const todayCount = todayCountVal !== null && todayCountVal !== undefined ? todayCountVal : 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    return {
      logs,
      totalCount,
      todayCount,
      totalPages,
      currentPage: page
    };
  }

  public generateCSV(logs: any[]): string {
    const headers = [
      'Entry ID',
      'Batch ID',
      'Student Name',
      'Roll Number',
      'Mobile Number',
      'Item Name',
      'Category',
      'Status',
      'Arrival Time',
      'Departure Time'
    ];

    const rows = logs.map((log) => [
      `"${log.id}"`,
      `"${log.batch_id}"`,
      `"${log.student_name}"`,
      `"${log.roll_no}"`,
      `"${log.mobile_no}"`,
      `"${log.item_name}"`,
      `"${log.category}"`,
      `"${log.status}"`,
      `"${log.arrival_time ? new Date(log.arrival_time).toISOString() : ''}"`,
      `"${log.departure_time ? new Date(log.departure_time).toISOString() : ''}"`
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}
