import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { GqlContextType } from '@nestjs/graphql';
import { Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import { ServerError } from '../errors/server-error';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    let serverError: ServerError;

    if (exception instanceof AppError) {
      serverError = ServerError.fromAppError(exception);
    } else if (exception instanceof HttpException) {
      serverError = new ServerError(
        exception.message,
        exception.getStatus(),
        undefined,
        'HTTP_EXCEPTION',
      );
      // HttpException might have a JSON response body, but here we standardize to ServerError structure
      // You could extract more details from exception.getResponse() if needed
    } else if (exception instanceof Error) {
      this.logger.error(`Unexpected error: ${exception.message}`, exception.stack);
      serverError = ServerError.fromError(exception);
    } else {
      this.logger.error(`Unknown error type: ${JSON.stringify(exception)}`);
      serverError = new ServerError('Unknown server error', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Handle GraphQL Context
    if (host.getType<GqlContextType>() === 'graphql') {
      // In GraphQL, we return the error (or a mapped version) to let the driver handle it.
      // We can create a GraphQLError here if we want more control, but returning ServerError 
      // (which extends Error) is a good start. The GraphQL driver will serialize it.
      // Optionally, we can attach the code to extensions if needed, but AppError has properties.
      // Note: NestJS GraphQL driver typically expects the exception to be thrown or returned.
      // Since this is a Catch-all, returning it is appropriate for the filter pipeline.
      return serverError;
    }

    // Handle HTTP Context
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const responseBody = {
      statusCode: serverError.statusCode,
      message: serverError.message,
      errorCode: serverError.errorCode,
      timestamp: new Date().toISOString(),
      path: request.url,
      // Only show cause in non-production environments
      cause: process.env.NODE_ENV !== 'production' ? serverError.cause : undefined,
    };

    response.status(serverError.statusCode).json(responseBody);
  }
}
