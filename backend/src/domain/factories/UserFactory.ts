import crypto from 'crypto';
import { Admin, Guard, Student, User, type UserRole } from '../entities/User.js';
import { ValidationException } from '../exceptions/DomainException.js';

export interface CreateUserParams {
  id?: string;
  name: string;
  email: string;
  role: UserRole;
  rollNo?: string | null;
  mobileNo?: string | null;
  deskId?: string;
  isDefaulter?: boolean;
  penaltyUntil?: Date | string | null;
}

export interface UserRowRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  roll_no?: string | null;
  mobile_no?: string | null;
  is_defaulter?: boolean | null;
  penalty_until?: string | Date | null;
}

/**
 * GoF Factory Method Pattern: UserFactory
 *
 * Centralizes polymorphic instantiation of `Student`, `Guard`, and `Admin` domain entities.
 */
export class UserFactory {
  public static create(params: CreateUserParams): User {
    if (!params.name || !params.email || !params.role) {
      throw new ValidationException('UserFactory requires name, email, and role.');
    }

    const id = params.id || crypto.randomUUID();
    const role = params.role.toUpperCase() as UserRole;
    const mobile = params.mobileNo || null;

    switch (role) {
      case 'GUARD':
        return new Guard(id, params.name, params.email, params.deskId ?? 'DESK_1', mobile);
      case 'ADMIN':
        return new Admin(id, params.name, params.email, mobile);
      case 'STUDENT': {
        const penaltyDate = params.penaltyUntil
          ? params.penaltyUntil instanceof Date
            ? params.penaltyUntil
            : new Date(params.penaltyUntil)
          : null;
        const derivedRoll =
          params.rollNo || params.email.split('@')[0]?.toUpperCase() || 'N/A';
        return new Student(
          id,
          params.name,
          params.email,
          derivedRoll,
          mobile,
          params.isDefaulter ?? false,
          penaltyDate
        );
      }
      default:
        throw new ValidationException(
          `Unsupported UserRole '${String(params.role)}'. Expected STUDENT, GUARD, or ADMIN.`
        );
    }
  }

  public static fromDatabaseRow(row: UserRowRecord): User {
    return UserFactory.create({
      id: row.id,
      name: row.name,
      email: row.email,
      role: (row.role || 'STUDENT') as UserRole,
      rollNo: row.roll_no ?? null,
      mobileNo: row.mobile_no ?? null,
      isDefaulter: row.is_defaulter ?? false,
      penaltyUntil: row.penalty_until ?? null
    });
  }
}

