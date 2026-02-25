import { Resolver, Query, Mutation, Args, Context, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ChatService } from 'src/chat/chat.service';
import { ChatMessage } from '../types';
import { UnauthenticatedError, PermissionDeniedError } from 'src/common/errors/domain-errors';
import { ToolInstanceService } from 'src/toolinstance/toolinstance.service';

@Resolver(() => ChatMessage)
export class ChatResolver {
  constructor(
    private readonly chatService: ChatService,
    private readonly toolInstanceService: ToolInstanceService,
  ) {}

  @Query(() => [ChatMessage])
  async chatMessages(
    @Context() ctx: any,
    @Args('instanceId', { type: () => String }) instanceId: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ) {
    if (!ctx.userId) throw new UnauthenticatedError('User not authenticated');

    const canAccess = await this.toolInstanceService.canAccess(instanceId, ctx.userId);
    if (!canAccess) throw new PermissionDeniedError('Forbidden');

    const items = await this.chatService.listMessages(instanceId, { limit, offset });

    return items.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  @Mutation(() => ChatMessage)
  async sendChatMessage(
    @Context() ctx: any,
    @Args('instanceId', { type: () => String }) instanceId: string,
    @Args('content', { type: () => String }) content: string,
  ) {
    if (!ctx.userId) throw new UnauthenticatedError('User not authenticated');

    const canAccess = await this.toolInstanceService.canAccess(instanceId, ctx.userId);
    if (!canAccess) throw new PermissionDeniedError('Forbidden');

    const msg = await this.chatService.createMessage(instanceId, ctx.userId, content);

    return {
      ...msg,
      createdAt: msg.createdAt.toISOString(),
    };
  }
}
