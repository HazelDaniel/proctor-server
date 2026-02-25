import { Resolver, Query, Mutation, Args, Context, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { NotificationService } from 'src/notifications/notification.service';
import { Notification } from '../types';
import { UnauthenticatedError } from 'src/common/errors/domain-errors';

@Resolver(() => Notification)
export class NotificationResolver {
  constructor(private readonly notificationService: NotificationService) {}

  @Query(() => [Notification])
  async notifications(
    @Context() ctx: any,
    @Args('unreadOnly', { type: () => Boolean, nullable: true }) unreadOnly?: boolean,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ) {
    if (!ctx.userId) throw new UnauthenticatedError('User not authenticated');

    const items = await this.notificationService.listForUser(ctx.userId, {
      unreadOnly,
      limit,
      offset,
    });

    return items.map((n) => ({
      ...n,
      payload: JSON.stringify(n.payload),
      createdAt: n.createdAt.toISOString(),
      instanceId: n.instanceId ?? undefined,
    }));
  }

  @Query(() => Int)
  async unreadNotificationCount(@Context() ctx: any) {
    if (!ctx.userId) throw new UnauthenticatedError('User not authenticated');
    return this.notificationService.unreadCount(ctx.userId);
  }

  @Mutation(() => Boolean)
  async markNotificationRead(
    @Context() ctx: any,
    @Args('id', { type: () => String }) id: string,
  ) {
    if (!ctx.userId) throw new UnauthenticatedError('User not authenticated');
    await this.notificationService.markRead(id, ctx.userId);
    return true;
  }

  @Mutation(() => Boolean)
  async markAllNotificationsRead(@Context() ctx: any) {
    if (!ctx.userId) throw new UnauthenticatedError('User not authenticated');
    await this.notificationService.markAllRead(ctx.userId);
    return true;
  }
}
