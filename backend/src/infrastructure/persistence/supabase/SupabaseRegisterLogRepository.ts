import { RegisterEntry, type RegisterStatus } from '../../../domain/entities/RegisterEntry.js';
import {
  InsufficientStockException,
  InvalidStateTransitionException,
  RequestExpiredException
} from '../../../domain/exceptions/DomainException.js';
import type {
  ApproveIssueTxResult,
  GuardBatchReturnTxResult,
  GuardReturnTxResult,
  IRegisterLogRepository,
  MasterLogQueryOptions,
  MasterLogRow,
  MasterLogsResult,
  TransferSplitTxResult
} from '../../../domain/repositories/IRegisterLogRepository.js';
import { DatabaseConnection } from '../DatabaseConnection.js';

export class SupabaseRegisterLogRepository implements IRegisterLogRepository {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection = DatabaseConnection.getInstance()) {
    this.db = db;
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

  private translateRpcError(prefix: string, message: string): never {
    if (message.toLowerCase().includes('insufficient stock')) {
      throw new InsufficientStockException('SAC Item', 1, 0);
    }
    if (message.toLowerCase().includes('expired')) {
      throw new RequestExpiredException(`${prefix}: ${message}`);
    }
    if (
      message.toLowerCase().includes('status') ||
      message.toLowerCase().includes('mismatch') ||
      message.toLowerCase().includes('pending')
    ) {
      throw new InvalidStateTransitionException(`${prefix}: ${message}`);
    }
    throw new Error(`${prefix}: ${message}`);
  }

  public async findById(id: string): Promise<RegisterEntry | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return null;
    }
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase
      .from('register_logs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch register entry ${id}: ${error.message}`);
    }
    return data ? this.mapRowToEntity(data) : null;
  }

  public async findByBatchId(batchId: string): Promise<RegisterEntry[]> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId)) {
      return [];
    }
    const supabase = this.db.requireSupabase();
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

  public async findActive(filter?: {
    studentId?: string;
    batchId?: string;
    itemId?: string;
  }): Promise<RegisterEntry[]> {
    const supabase = this.db.requireSupabase();
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
    if (filter?.itemId) {
      query = query.eq('item_id', filter.itemId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch active register entries: ${error.message}`);
    }
    return (data || []).map((row) => this.mapRowToEntity(row));
  }

  public async getActiveHeldItemIds(): Promise<Set<string>> {
    const supabase = this.db.getSupabase();
    if (!supabase) return new Set<string>();

    const { data, error } = await supabase
      .from('register_logs')
      .select('item_id')
      .in('status', ['ISSUED', 'ISSUED_TRANSFER_PENDING']);

    if (error || !data) {
      return new Set<string>();
    }
    return new Set(data.map((r: any) => String(r.item_id)));
  }

  public async hasActiveHoldingsForItem(itemId: string): Promise<boolean> {
    const supabase = this.db.requireSupabase();
    const { count, error } = await supabase
      .from('register_logs')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', itemId)
      .in('status', ['ISSUED', 'ISSUED_TRANSFER_PENDING']);

    if (error) {
      throw new Error(`Failed to check active holdings: ${error.message}`);
    }
    return (count ?? 0) > 0;
  }

  public async findPendingIncomingTransfers(recipientStudentId: string): Promise<RegisterEntry[]> {
    const supabase = this.db.requireSupabase();
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
    const supabase = this.db.requireSupabase();
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
    const supabase = this.db.requireSupabase();
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

  public async approveIssueRequestTx(
    requestId: string,
    guardId: string
  ): Promise<ApproveIssueTxResult> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase.rpc('approve_issue_request_tx', {
      p_request_id: requestId,
      p_guard_id: guardId
    });

    if (error) {
      this.translateRpcError('Approval transaction failed', error.message);
    }
    return data as ApproveIssueTxResult;
  }

  public async executeTransferSplitTx(
    entryId: string,
    recipientId: string
  ): Promise<TransferSplitTxResult> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase.rpc('execute_transfer_split_tx', {
      p_entry_id: entryId,
      p_recipient_id: recipientId
    });

    if (error) {
      this.translateRpcError('Transfer atomic split failed', error.message);
    }
    return data as TransferSplitTxResult;
  }

  public async closeGuardReturnTx(
    entryId: string,
    isDamaged: boolean
  ): Promise<GuardReturnTxResult> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase.rpc('close_guard_return_tx', {
      p_entry_id: entryId,
      p_is_damaged: isDamaged
    });

    if (error) {
      this.translateRpcError('Guard return transaction failed', error.message);
    }
    return data as GuardReturnTxResult;
  }

  public async closeGuardBatchReturnTx(batchId: string): Promise<GuardBatchReturnTxResult> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase.rpc('close_guard_batch_return_tx', {
      p_batch_id: batchId
    });

    if (error) {
      this.translateRpcError('Guard batch return failed', error.message);
    }
    return data as GuardBatchReturnTxResult;
  }

  public async getMasterLogs(options?: MasterLogQueryOptions): Promise<MasterLogsResult> {
    const supabase = this.db.requireSupabase();
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

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayIso = startOfToday.toISOString();

    const todayQuery = supabase
      .from('register_logs')
      .select('*', { count: 'exact', head: true })
      .gte('arrival_time', todayIso);

    const [{ data, count, error }, { count: todayCountVal, error: todayError }] =
      await Promise.all([query, todayQuery]);

    if (error) {
      throw new Error(`Failed to query master register logs: ${error.message}`);
    }
    if (todayError) {
      console.warn('Failed to query todayCount for register logs:', todayError.message);
    }

    const logs = ((data || []) as MasterLogRow[]);
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
}
