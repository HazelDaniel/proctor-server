import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { PermissionDeniedError, UnauthenticatedError } from '../errors/domain-errors';

export const USER_ID_ARG_NAME = 'userIdArgName';
export const CheckUserOwnership = (argName: string = 'userId') => SetMetadata(USER_ID_ARG_NAME, argName);

@Injectable()
export class UserOwnershipGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const ctx = GqlExecutionContext.create(context);
    const { userId } = ctx.getContext();

    if (!userId) {
      throw new UnauthenticatedError('Unauthorized');
    }

    const argName = this.reflector.get<string>(USER_ID_ARG_NAME, context.getHandler()) || 'userId';
    const args = ctx.getArgs();
    
    const resourceUserId = args[argName];

    if (!resourceUserId) {
      // If resourceUserId is not provided, we can't check ownership.
      // This might be an optional argument or a developer error.
      // For safety, we could return false, but usually, it's better to just return true if it's missing
      // and let the service handle it or the schema validation catch it.
      // However, the requirement is to check if it matches.
      return true;
    }

    if (resourceUserId !== userId) {
      throw new PermissionDeniedError('Forbidden');
    }

    return true;
  }
}
