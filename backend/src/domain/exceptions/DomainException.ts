export type DomainErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'ACCESS_RESTRICTED'
  | 'UNAUTHORIZED_ROLE'
  | 'INELIGIBLE_BORROWER'
  | 'ENTITY_NOT_FOUND'
  | 'INSUFFICIENT_STOCK'
  | 'INVALID_STATE_TRANSITION'
  | 'REQUEST_EXPIRED'
  | 'CONFLICT_ERROR';

/**
 * Abstract root of the SACPulse OOP Domain Exception Hierarchy.
 * Encapsulates HTTP-agnostic semantic error codes alongside canonical status mappings
 * so presentation middleware can translate domain failures cleanly without string matching.
 */
export abstract class DomainException extends Error {
  public readonly statusCode: number;
  public readonly code: DomainErrorCode;
  public readonly details?: Record<string, unknown>;

  protected constructor(
    message: string,
    statusCode: number,
    code: DomainErrorCode,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationException extends DomainException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationException extends DomainException {
  constructor(message: string = 'Unauthorized: Missing or invalid authentication credentials.') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AccessRestrictedException extends DomainException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 403, 'ACCESS_RESTRICTED', details);
  }
}

export class UnauthorizedRoleException extends DomainException {
  constructor(message: string = 'Forbidden: Insufficient role permissions for this operation.') {
    super(message, 403, 'UNAUTHORIZED_ROLE');
  }
}

export class IneligibleBorrowerException extends DomainException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 403, 'INELIGIBLE_BORROWER', details);
  }
}

export class EntityNotFoundException extends DomainException {
  constructor(entityName: string, identifier?: string) {
    const msg = identifier
      ? `${entityName} with identifier '${identifier}' was not found.`
      : `${entityName} not found.`;
    super(msg, 404, 'ENTITY_NOT_FOUND', { entityName, identifier });
  }
}

export class InsufficientStockException extends DomainException {
  constructor(itemName: string, requested: number, available: number) {
    super(
      `Insufficient stock for '${itemName}'. Requested: ${requested}, Available: ${available}.`,
      409,
      'INSUFFICIENT_STOCK',
      { itemName, requested, available }
    );
  }
}

export class InvalidStateTransitionException extends DomainException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 409, 'INVALID_STATE_TRANSITION', details);
  }
}

export class RequestExpiredException extends DomainException {
  constructor(
    message: string = 'Cannot approve request: Authoritative 2-minute server TTL has expired.'
  ) {
    super(message, 409, 'REQUEST_EXPIRED');
  }
}

