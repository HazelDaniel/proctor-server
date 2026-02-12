import { AppError } from './app-error';

// Auth Errors
export class PassportAuthError extends AppError {
  constructor(message: string, cause?: string) {
    super(message, 401, cause, 'PASSPORT_AUTH_ERROR');
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message: string = 'User not authenticated', cause?: string) {
    super(message, 401, cause, 'UNAUTHENTICATED');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'User not authorized', cause?: string) {
    super(message, 403, cause, 'UNAUTHORIZED');
  }
}

export class PermissionDeniedError extends AppError {
  constructor(message: string = 'Permission denied', cause?: string) {
    super(message, 403, cause, 'PERMISSION_DENIED');
  }
}

// Resource Errors
export class NotFoundError extends AppError {
  constructor(resource: string, cause?: string) {
    super(`${resource} not found`, 404, cause, 'NOT_FOUND');
  }
}

export class ResourceConflictError extends AppError {
  constructor(message: string, cause?: string) {
    super(message, 409, cause, 'RESOURCE_CONFLICT');
  }
}

// Validation Errors
export class ValidationError extends AppError {
  constructor(message: string, cause?: string) {
    super(message, 400, cause, 'VALIDATION_ERROR');
  }
}

// External Service Errors
export class YjsGatewayError extends AppError {
  constructor(message: string, cause?: string) {
    super(message, 502, cause, 'YJS_GATEWAY_ERROR');
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, cause?: string) {
    super(message, 500, cause, 'DATABASE_ERROR');
  }
}
