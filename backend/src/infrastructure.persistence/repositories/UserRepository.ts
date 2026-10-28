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
      return new Guard(row.id, row.name, row.email, 'DESK_1');
    }
    if (role === 'ADMIN') {
      return new Admin(row.id, row.name, row.email);
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
}
