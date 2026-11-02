import { Student, type User, type UserRole } from '../../../domain/entities/User.js';
import { ValidationException } from '../../../domain/exceptions/DomainException.js';
import { UserFactory } from '../../../domain/factories/UserFactory.js';
import type {
  IUserRepository,
  WhitelistedStaffRecord,
  WhitelistRequestRecord
} from '../../../domain/repositories/IUserRepository.js';
import { DatabaseConnection } from '../DatabaseConnection.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SupabaseUserRepository implements IUserRepository {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection = DatabaseConnection.getInstance()) {
    this.db = db;
  }

  public async findById(id: string): Promise<User | null> {
    if (!UUID_REGEX.test(id)) {
      return null;
    }
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
    if (error) {
      throw new Error(`Failed to fetch user by id ${id}: ${error.message}`);
    }
    return data ? UserFactory.fromDatabaseRow(data) : null;
  }

  public async findByEmail(email: string): Promise<User | null> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to fetch user by email ${email}: ${error.message}`);
    }
    return data ? UserFactory.fromDatabaseRow(data) : null;
  }

  public async findByRollNo(rollNo: string): Promise<Student | null> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('roll_no', rollNo.trim())
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to fetch student by roll no ${rollNo}: ${error.message}`);
    }
    if (!data) return null;

    const user = UserFactory.fromDatabaseRow(data);
    if (user.getRole() !== 'STUDENT' || !(user instanceof Student)) {
      throw new ValidationException(`User with roll no ${rollNo} is not a student.`);
    }
    return user;
  }

  public async findAll(): Promise<User[]> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase.from('users').select('*').order('name');
    if (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }
    return (data || []).map((row) => UserFactory.fromDatabaseRow(row));
  }

  public async createUser(userData: {
    id?: string;
    email: string;
    name: string;
    role: UserRole;
    rollNo?: string | null;
    mobileNo?: string | null;
  }): Promise<User> {
    const supabase = this.db.requireSupabase();
    const insertPayload: Record<string, unknown> = {
      email: userData.email.toLowerCase().trim(),
      name: userData.name.trim(),
      role: userData.role,
      roll_no: userData.rollNo ?? null,
      mobile_no: userData.mobileNo ?? null,
      is_defaulter: false,
      penalty_until: null
    };
    if (userData.id) {
      insertPayload.id = userData.id;
    }

    const { data, error } = await supabase
      .from('users')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create user ${userData.email}: ${error.message}`);
    }
    return UserFactory.fromDatabaseRow(data);
  }

  public async updateUser(
    userId: string,
    updates: { name?: string; role?: UserRole; rollNo?: string | null; mobileNo?: string | null }
  ): Promise<User> {
    const supabase = this.db.requireSupabase();
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.role !== undefined) payload.role = updates.role;
    if (updates.rollNo !== undefined) payload.roll_no = updates.rollNo;
    if (updates.mobileNo !== undefined) payload.mobile_no = updates.mobileNo;

    const { data, error } = await supabase
      .from('users')
      .update(payload)
      .eq('id', userId)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update user ${userId}: ${error.message}`);
    }
    return UserFactory.fromDatabaseRow(data);
  }

  public async upsertUser(userData: {
    email: string;
    name: string;
    role: UserRole;
    mobileNo?: string | null;
    rollNo?: string | null;
  }): Promise<User> {
    const cleanEmail = userData.email.toLowerCase().trim();
    const existing = await this.findByEmail(cleanEmail);
    if (existing) {
      return this.updateUser(existing.getId(), {
        name: userData.name,
        role: userData.role,
        mobileNo: userData.mobileNo !== undefined ? userData.mobileNo : existing.getMobileNo(),
        rollNo:
          userData.rollNo !== undefined
            ? userData.rollNo
            : existing.toProfileDTO().rollNo
      });
    }
    return this.createUser({
      email: cleanEmail,
      name: userData.name,
      role: userData.role,
      mobileNo: userData.mobileNo,
      rollNo: userData.rollNo
    });
  }

  public async setDefaulter(studentId: string, isDefaulter: boolean): Promise<void> {
    const supabase = this.db.requireSupabase();
    const { error } = await supabase
      .from('users')
      .update({ is_defaulter: isDefaulter })
      .eq('id', studentId);
    if (error) {
      throw new Error(`Failed to update defaulter status for ${studentId}: ${error.message}`);
    }
  }

  public async setPenaltyUntil(studentId: string, penaltyUntil: Date | null): Promise<void> {
    const supabase = this.db.requireSupabase();
    const { error } = await supabase
      .from('users')
      .update({ penalty_until: penaltyUntil ? penaltyUntil.toISOString() : null })
      .eq('id', studentId);
    if (error) {
      throw new Error(`Failed to update penalty cooldown for ${studentId}: ${error.message}`);
    }
  }

  public async updateRole(userId: string, role: UserRole): Promise<void> {
    const supabase = this.db.requireSupabase();
    const { error } = await supabase.from('users').update({ role }).eq('id', userId);
    if (error) {
      throw new Error(`Failed to update user role for ${userId}: ${error.message}`);
    }
  }

  public async updateMobileNo(userId: string, mobileNo: string): Promise<void> {
    const supabase = this.db.requireSupabase();
    const { error } = await supabase
      .from('users')
      .update({ mobile_no: mobileNo })
      .eq('id', userId);
    if (error) {
      throw new Error(`Failed to update mobile number for ${userId}: ${error.message}`);
    }
  }

  public async findWhitelistedStaff(email: string): Promise<WhitelistedStaffRecord | null> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase
      .from('whitelisted_staff')
      .select('*')
      .ilike('email', email.trim())
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to query whitelisted_staff for ${email}: ${error.message}`);
    }
    return (data as WhitelistedStaffRecord) || null;
  }

  public async findWhitelistedStaffById(id: string): Promise<WhitelistedStaffRecord | null> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase
      .from('whitelisted_staff')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to query whitelisted staff by id ${id}: ${error.message}`);
    }
    return (data as WhitelistedStaffRecord) || null;
  }

  public async listWhitelistedStaff(): Promise<WhitelistedStaffRecord[]> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase
      .from('whitelisted_staff')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      throw new Error(`Failed to list whitelisted staff: ${error.message}`);
    }
    return (data as WhitelistedStaffRecord[]) || [];
  }

  public async addWhitelistedStaff(data: {
    email: string;
    name: string;
    mobileNo?: string | null;
    role: UserRole;
  }): Promise<WhitelistedStaffRecord> {
    const supabase = this.db.requireSupabase();
    const cleanEmail = data.email.toLowerCase().trim();
    const { data: result, error } = await supabase
      .from('whitelisted_staff')
      .upsert(
        {
          email: cleanEmail,
          name: data.name.trim(),
          mobile_no: data.mobileNo?.trim() || null,
          role: data.role
        },
        { onConflict: 'email' }
      )
      .select('*')
      .single();
    if (error) {
      throw new Error(`Failed to add whitelisted staff: ${error.message}`);
    }
    return result as WhitelistedStaffRecord;
  }

  public async removeWhitelistedStaff(id: string): Promise<void> {
    const supabase = this.db.requireSupabase();
    const { error } = await supabase.from('whitelisted_staff').delete().eq('id', id);
    if (error) {
      throw new Error(`Failed to remove whitelisted staff ${id}: ${error.message}`);
    }
  }

  public async createWhitelistRequest(data: {
    email: string;
    name: string;
    mobileNo: string;
    reason?: string;
  }): Promise<WhitelistRequestRecord> {
    const supabase = this.db.requireSupabase();
    const cleanEmail = data.email.toLowerCase().trim();
    const { data: result, error } = await supabase
      .from('whitelist_requests')
      .upsert(
        {
          email: cleanEmail,
          name: data.name.trim(),
          mobile_no: data.mobileNo.trim(),
          reason: data.reason?.trim() || null,
          status: 'PENDING',
          approved_role: null,
          created_at: new Date().toISOString()
        },
        { onConflict: 'email' }
      )
      .select('*')
      .single();
    if (error) {
      throw new Error(`Failed to create whitelist request: ${error.message}`);
    }
    return result as WhitelistRequestRecord;
  }

  public async findWhitelistRequestByEmail(email: string): Promise<WhitelistRequestRecord | null> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase
      .from('whitelist_requests')
      .select('*')
      .ilike('email', email.toLowerCase().trim())
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to query whitelist request for ${email}: ${error.message}`);
    }
    return (data as WhitelistRequestRecord) || null;
  }

  public async findWhitelistRequestById(id: string): Promise<WhitelistRequestRecord | null> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase
      .from('whitelist_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to query whitelist request ${id}: ${error.message}`);
    }
    return (data as WhitelistRequestRecord) || null;
  }

  public async listPendingWhitelistRequests(): Promise<WhitelistRequestRecord[]> {
    const supabase = this.db.requireSupabase();
    const { data, error } = await supabase
      .from('whitelist_requests')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false });
    if (error) {
      throw new Error(`Failed to list pending whitelist requests: ${error.message}`);
    }
    return (data as WhitelistRequestRecord[]) || [];
  }

  public async updateWhitelistRequestStatus(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    approvedRole?: string
  ): Promise<WhitelistRequestRecord> {
    const supabase = this.db.requireSupabase();
    const updatePayload: Record<string, unknown> = { status };
    if (approvedRole !== undefined) {
      updatePayload.approved_role = approvedRole;
    }

    const { data, error } = await supabase
      .from('whitelist_requests')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      throw new Error(`Failed to update whitelist request status: ${error.message}`);
    }
    return data as WhitelistRequestRecord;
  }
}
