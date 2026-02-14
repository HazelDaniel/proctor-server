import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { UnauthenticatedError } from '../errors/domain-errors';

@Injectable()
export class SignedInGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const ctx = GqlExecutionContext.create(context);
    const { userId } = ctx.getContext();

    if (!userId) {
      throw new UnauthenticatedError('Unauthorized');
    }

    return true;
  }
}
