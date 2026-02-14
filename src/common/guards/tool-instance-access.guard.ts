import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ToolInstanceService } from 'src/toolinstance/toolinstance.service';
import { PermissionDeniedError, UnauthenticatedError } from '../errors/domain-errors';

@Injectable()
export class ToolInstanceAccessGuard implements CanActivate {
  constructor(private readonly toolInstanceService: ToolInstanceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = GqlExecutionContext.create(context);
    const { userId } = ctx.getContext();

    if (!userId) {
      throw new UnauthenticatedError('Unauthorized');
    }

    const args = ctx.getArgs();
    const instanceId = args.instanceId;

    if (!instanceId) {
      // If instanceId is not provided, we can't check access.
      // This guard should be used on resolvers that have instanceId arg.
      return true;
    }

    const canAccess = await this.toolInstanceService.canAccess(instanceId, userId);
    if (!canAccess) {
      throw new PermissionDeniedError('Forbidden');
    }

    return true;
  }
}
