import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ToolInstanceService } from 'src/toolinstance/toolinstance.service';
import { PermissionDeniedError, UnauthenticatedError } from '../errors/domain-errors';

@Injectable()
export class ToolInstanceOwnershipGuard implements CanActivate {
  constructor(private readonly toolInstanceService: ToolInstanceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> | never {
    const ctx = GqlExecutionContext.create(context);
    const { userId } = ctx.getContext();

    if (!userId) {
      throw new UnauthenticatedError('Unauthorized');
    }

    const args = ctx.getArgs();
    const instanceId = args.instanceId;

    if (!instanceId) {
      // If instanceId is not provided, we can't check ownership.
      // This guard should be used on resolvers that have instanceId arg.
      return true;
    }

    const isOwner = await this.toolInstanceService.isOwner(instanceId, userId);
    if (!isOwner) {
      throw new PermissionDeniedError('Forbidden');
    }

    return true;
  }
}
