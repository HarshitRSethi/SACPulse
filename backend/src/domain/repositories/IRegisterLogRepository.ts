import type { RegisterEntry } from '../entities/RegisterEntry.js';

export interface MasterLogQueryOptions {
  startDate?: string;
  endDate?: string;
  status?: string;
  page?: number;
  limit?: number;
  unpaginated?: boolean;
}

export interface MasterLogRow {
  id: string;
  batch_id: string;
  student_id: string;
  student_name: string;
  roll_no: string;
  mobile_no: string;
  item_id: string;
  item_name: string;
  category: string;
  arrival_time: string;
  departure_time: string | null;
  status: string;
  pending_transfer_to_id: string | null;
}

export interface MasterLogsResult {
  logs: MasterLogRow[];
  totalCount: number;
  todayCount: number;
  totalPages: number;
  currentPage: number;
}

export interface ApproveIssueTxResult {
  batch_id: string;
  units_issued: number;
  student_id: string;
}

export interface TransferSplitTxResult {
  old_entry_id: string;
  new_entry_id: string;
  batch_id: string;
  recipient_name: string;
}

export interface GuardReturnTxResult {
  entry_id: string;
  status: string;
  item_id: string;
  student_id: string;
}

export interface GuardBatchReturnTxResult {
  batch_id: string;
  returned_count: number;
}

/**
 * SOLID Dependency Inversion Principle (DIP): Abstract RegisterLog Repository Contract.
 * Eliminates raw Supabase table queries inside Controllers (`hasActiveHoldingsForItem`, `getActiveItemIds`).
 */
export interface IRegisterLogRepository {
  findById(id: string): Promise<RegisterEntry | null>;
  findByBatchId(batchId: string): Promise<RegisterEntry[]>;
  findActive(filter?: { studentId?: string; batchId?: string; itemId?: string }): Promise<RegisterEntry[]>;
  getActiveHeldItemIds(): Promise<Set<string>>;
  hasActiveHoldingsForItem(itemId: string): Promise<boolean>;
  findPendingIncomingTransfers(recipientStudentId: string): Promise<RegisterEntry[]>;

  initiateTransfer(entryId: string, peerId: string): Promise<void>;
  cancelTransfer(entryId: string): Promise<void>;

  approveIssueRequestTx(requestId: string, guardId: string): Promise<ApproveIssueTxResult>;
  executeTransferSplitTx(entryId: string, recipientId: string): Promise<TransferSplitTxResult>;
  closeGuardReturnTx(entryId: string, isDamaged: boolean): Promise<GuardReturnTxResult>;
  closeGuardBatchReturnTx(batchId: string): Promise<GuardBatchReturnTxResult>;

  getMasterLogs(options?: MasterLogQueryOptions): Promise<MasterLogsResult>;
}

