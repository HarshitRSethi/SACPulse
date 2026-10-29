import { User, Student, Guard, Admin, type UserRole } from '../../domain.entities/User.js';
import { DatabaseConnection } from '../DatabaseConnection.js';

export class UserRepository {
  private db: DatabaseConnection;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  private mapRowToEntity(row: any): User {
    const role: UserRole = row.role;
    if (role === 'GUARD') {
      return new Guard(row.id, row.name, row.email, 'DESK_1', row.mobile_no || null);
    }
    if (role === 'ADMIN') {
      return new Admin(row.id, row.name, row.email, row.mobile_no || null);
    }
    // Default to Student
    return new Student(
      row.id,
      row.name,
      row.email,
      row.roll_no || 'N/A',
      row.mobile_no || null,
      row.is_defaulter ?? false,
      row.penalty_until ? new Date(row.penalty_until) : null
    );
  }

  public async findById(id: string): Promise<User | null> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch user by id ${id}: ${error.message}`);
    }
    if (!data) return null;

    return this.mapRowToEntity(data);
  }

  public async findByEmail(email: string): Promise<User | null> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch user by email ${email}: ${error.message}`);
    }
    if (!data) return null;

    return this.mapRowToEntity(data);
  }

  public async findByRollNo(rollNo: string): Promise<Student | null> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('roll_no', rollNo)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch student by roll no ${rollNo}: ${error.message}`);
    }
    if (!data) return null;

    const user = this.mapRowToEntity(data);
    if (!(user instanceof Student)) {
      throw new Error(`User with roll no ${rollNo} is not a student.`);
    }
    return user;
  }

  public async setDefaulter(studentId: string, isDefaulter: boolean): Promise<void> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { error } = await supabase
      .from('users')
      .update({ is_defaulter: isDefaulter })
      .eq('id', studentId);

    if (error) {
      throw new Error(`Failed to update defaulter status for ${studentId}: ${error.message}`);
    }
  }

  public async setPenaltyUntil(studentId: string, penaltyUntil: Date | null): Promise<void> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { error } = await supabase
      .from('users')
      .update({ penalty_until: penaltyUntil ? penaltyUntil.toISOString() : null })
      .eq('id', studentId);

    if (error) {
      throw new Error(`Failed to update penalty cooldown for ${studentId}: ${error.message}`);
    }
  }

  public async updateRole(userId: string, role: UserRole): Promise<void> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to update user role for ${userId}: ${error.message}`);
    }
  }

  public async updateMobileNo(userId: string, mobileNo: string): Promise<void> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { error } = await supabase
      .from('users')
      .update({ mobile_no: mobileNo })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to update mobile number for ${userId}: ${error.message}`);
    }
  }

  public async findAll(): Promise<User[]> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('name');

    if (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }

    return (data || []).map((row) => this.mapRowToEntity(row));
  }

  public async findWhitelistedStaff(email: string): Promise<{ id: string; email: string; name: string; role: string } | null> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { data, error } = await supabase
      .from('whitelisted_staff')
      .select('*')
      .ilike('email', email.trim())
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to query whitelisted_staff for ${email}: ${error.message}`);
    }
    return data || null;
  }

  public async createUser(userData: {
    email: string;
    name: string;
    role: UserRole;
    rollNo?: string | null;
    mobileNo?: string | null;
  }): Promise<User> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const { data, error } = await supabase
      .from('users')
      .insert({
        email: userData.email,
        name: userData.name,
        role: userData.role,
        roll_no: userData.rollNo ?? null,
        mobile_no: userData.mobileNo ?? null,
        is_defaulter: false,
        penalty_until: null
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create user ${userData.email}: ${error.message}`);
    }
    return this.mapRowToEntity(data);
  }

  public async updateUser(
    userId: string,
    updates: { name?: string; role?: UserRole; rollNo?: string | null; mobileNo?: string | null }
  ): Promise<User> {
    const supabase = this.db.getSupabase();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const payload: any = {};
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
    return this.mapRowToEntity(data);
  }
}
