export type UserRole = 'STUDENT' | 'GUARD' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  rollNo?: string | null;
  mobileNo?: string | null;
  isDefaulter?: boolean;
  penaltyUntil?: string | null;
  dashboardRoute?: string;
  requiresMobileSetup?: boolean;
  isRootAdmin?: boolean;
}

export type ItemType = 'EQUIPMENT' | 'ROOM_KEY';

export interface SACItem {
  id: string;
  name: string;
  category: string;
  itemType: ItemType;
  totalQty: number;
  availableQty: number;
  isAvailable: boolean;
  occupiedSince?: string | null;
  hasActiveStudentCheckout?: boolean;
  isFacultySession?: boolean;
}

export interface RequestedItem {
  itemId: string;
  name: string;
  qty: number;
}

export interface IssueRequest {
  id: string;
  studentId: string;
  studentName?: string;
  rollNo?: string;
  mobileNo?: string;
  requestedItems: RequestedItem[];
  status: 'PENDING' | 'APPROVED' | 'TIMED_OUT';
  createdAt: string;
  expiresAt: string;
  ttlSeconds?: number;
}

export type RegisterStatus =
  | 'ISSUED'
  | 'ISSUED_TRANSFER_PENDING'
  | 'RETURNED'
  | 'RETURNED_VIA_TRANSFER'
  | 'DAMAGED';

export interface RegisterEntryUnit {
  id: string;
  itemId: string;
  itemName: string;
  category: string;
  status: RegisterStatus;
  pendingTransferToId: string | null;
}

export interface ActiveBatch {
  batchId: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  mobileNo: string;
  arrivalTime: string;
  units: RegisterEntryUnit[];
}

export interface IncomingTransfer {
  entryId: string;
  batchId: string;
  itemId: string;
  itemName: string;
  category: string;
  fromStudentId: string;
  fromStudentName: string;
  fromRollNo: string;
  arrivalTime: string;
}
