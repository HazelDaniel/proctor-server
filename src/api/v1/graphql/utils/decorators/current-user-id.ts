import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GraphQLContext } from '../../types';

export const CurrentUserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const gqlCtx = ctx.getArgByIndex<GraphQLContext>(2);

    return gqlCtx?.userId ?? null;
  },
);
