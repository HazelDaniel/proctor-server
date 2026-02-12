import { AppError } from './app-error';

export class ServerError extends AppError {
  constructor(
    message: string = 'Internal Server Error',
    statusCode: number = 500,
    cause?: string,
    errorCode: string = 'INTERNAL_SERVER_ERROR',
  ) {
    super(message, statusCode, cause, errorCode);
  }

  static fromError(error: Error): ServerError {
    return new ServerError(error.message, 500, error.stack);
  }

  static fromAppError(error: AppError): ServerError {
    return new ServerError(
      error.message,
      error.statusCode,
      error.cause,
      error.errorCode,
    );
  }
}
