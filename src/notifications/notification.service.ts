import { Injectable, Inject, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, eq, desc, sql, count } from 'drizzle-orm';
import { notifications } from 'src/db/drivers/drizzle/schema';
import { DB_PROVIDER } from 'src/db/db.module';
import type { DB } from 'src/db/db.provider';
import { EmailService } from './email.service';

export type NotificationType =
  | 'invite_received'
  | 'invite_accepted'
  | 'chat_message'
  | 'project_archived'
  | 'project_deleted';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  // Will be injected by the module after gateway is available
  private gateway: { emitToUser: (userId: string, notification: any) => void } | null = null;

  constructor(
    @Inject(DB_PROVIDER) private readonly db: DB,
    private readonly emailService: EmailService,
  ) {}

  /** Called by NotificationModule to wire the gateway after construction. */
  setGateway(gw: { emitToUser: (userId: string, notification: any) => void }) {
    this.gateway = gw;
  }

  async create(
    userId: string,
    type: NotificationType,
    payload: Record<string, any> = {},
    instanceId?: string,
    recipientEmail?: string,
  ) {
    const id = randomUUID();
    const now = new Date();

    await this.db.insert(notifications).values({
      id,
      userId,
      type,
      payload,
      instanceId: instanceId ?? null,
      createdAt: now,
    });

    const notification = {
      id,
      userId,
      type,
      payload,
      read: false,
      createdAt: now.toISOString(),
      instanceId: instanceId ?? null,
    };

    // Real-time push
    if (this.gateway) {
      this.gateway.emitToUser(userId, notification);
    }

    // Email delivery (fire-and-forget)
    if (recipientEmail && this.shouldEmail(type)) {
      const subject = this.emailSubject(type, payload);
      const body = this.emailBody(type, payload);
      this.emailService.send(recipientEmail, subject, body).catch((err) => {
        this.logger.warn(`Failed to send notification email: ${err.message}`);
      });
    }

    return notification;
  }

  async listForUser(
    userId: string,
    options: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
  ) {
    const { unreadOnly = false, limit = 20, offset = 0 } = options;

    const conditions = [eq(notifications.userId, userId)];
    if (unreadOnly) {
      conditions.push(eq(notifications.read, false));
    }

    return this.db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async markRead(notificationId: string, userId: string) {
    await this.db
      .update(notifications)
      .set({ read: true })
      .where(
        and(eq(notifications.id, notificationId), eq(notifications.userId, userId)),
      );
    return true;
  }

  async markAllRead(userId: string) {
    await this.db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return true;
  }

  async unreadCount(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return row?.value ?? 0;
  }

  async deleteForInstance(instanceId: string) {
    await this.db
      .delete(notifications)
      .where(eq(notifications.instanceId, instanceId));
  }

  private shouldEmail(type: NotificationType): boolean {
    return ['invite_received', 'project_archived', 'project_deleted'].includes(type);
  }

  private emailSubject(type: NotificationType, payload: Record<string, any>): string {
    switch (type) {
      case 'invite_received':
        return `You've been invited to collaborate on "${payload.projectName ?? 'a project'}"`;
      case 'project_archived':
        return `Project "${payload.projectName ?? 'a project'}" has been archived`;
      case 'project_deleted':
        return `Project "${payload.projectName ?? 'a project'}" has been deleted`;
      default:
        return 'Proctor Notification';
    }
  }

  private emailBody(type: NotificationType, payload: Record<string, any>): string {
    switch (type) {
      case 'invite_received':
        return `${payload.inviterEmail ?? 'Someone'} invited you to collaborate on "${payload.projectName ?? 'a project'}". Log in to Proctor to accept or decline.`;
      case 'project_archived':
        return `The project "${payload.projectName ?? 'a project'}" that you collaborate on has been archived by its owner.`;
      case 'project_deleted':
        return `The project "${payload.projectName ?? 'a project'}" that you collaborate on has been deleted by its owner.`;
      default:
        return 'You have a new notification on Proctor.';
    }
  }
}
