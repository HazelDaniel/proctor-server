export interface IAppError {
  statusCode: number;
  message: string;
  cause?: string;
  errorCode?: string; // Optional: for machine-readable error codes
}

export abstract class AppError extends Error implements IAppError {
  public readonly statusCode: number;
  public readonly cause?: string;
  public readonly errorCode?: string;

  constructor(message: string, statusCode: number, cause?: string, errorCode?: string) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.cause = cause;
    this.errorCode = errorCode;
    Error.captureStackTrace(this, this.constructor);
  }
}
