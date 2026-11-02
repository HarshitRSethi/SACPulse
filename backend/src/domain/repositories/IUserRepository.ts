import type { Student, User, UserRole } from '../entities/User.js';

export interface WhitelistedStaffRecord {
  id: string;
  email: string;
  name: string;
  mobile_no?: string | null;
  role: string;
  created_at?: string;
}

export interface WhitelistRequestRecord {
  id: string;
  email: string;
  name: string;
  mobile_no: string;
  reason?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_role?: string | null;
  created_at: string;
}

/**
 * SOLID Dependency Inversion Principle (DIP): Abstract User Repository Contract.
 */
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByRollNo(rollNo: string): Promise<Student | null>;
  findAll(): Promise<User[]>;

  createUser(userData: {
    id?: string;
    email: string;
    name: string;
    role: UserRole;
    rollNo?: string | null;
    mobileNo?: string | null;
  }): Promise<User>;

  updateUser(
    userId: string,
    updates: {
      name?: string;
      role?: UserRole;
      rollNo?: string | null;
      mobileNo?: string | null;
    }
  ): Promise<User>;

  upsertUser(userData: {
    email: string;
    name: string;
    role: UserRole;
    mobileNo?: string | null;
    rollNo?: string | null;
  }): Promise<User>;

  setDefaulter(studentId: string, isDefaulter: boolean): Promise<void>;
  setPenaltyUntil(studentId: string, penaltyUntil: Date | null): Promise<void>;
  updateRole(userId: string, role: UserRole): Promise<void>;
  updateMobileNo(userId: string, mobileNo: string): Promise<void>;

  // Staff Whitelist & Access Requests
  findWhitelistedStaff(email: string): Promise<WhitelistedStaffRecord | null>;
  findWhitelistedStaffById(id: string): Promise<WhitelistedStaffRecord | null>;
  listWhitelistedStaff(): Promise<WhitelistedStaffRecord[]>;
  addWhitelistedStaff(data: {
    email: string;
    name: string;
    mobileNo?: string | null;
    role: UserRole;
  }): Promise<WhitelistedStaffRecord>;
  removeWhitelistedStaff(id: string): Promise<void>;

  createWhitelistRequest(data: {
    email: string;
    name: string;
    mobileNo: string;
    reason?: string;
  }): Promise<WhitelistRequestRecord>;
  findWhitelistRequestByEmail(email: string): Promise<WhitelistRequestRecord | null>;
  findWhitelistRequestById(id: string): Promise<WhitelistRequestRecord | null>;
  listPendingWhitelistRequests(): Promise<WhitelistRequestRecord[]>;
  updateWhitelistRequestStatus(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    approvedRole?: string
  ): Promise<WhitelistRequestRecord>;
}

