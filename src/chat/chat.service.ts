import { Injectable, Inject, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { eq, desc, and } from 'drizzle-orm';
import { chatMessages } from 'src/db/drivers/drizzle/schema';
import { DB_PROVIDER } from 'src/db/db.module';
import type { DB } from 'src/db/db.provider';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  // Will be injected by the module after gateway is available
  private gateway: { emitToInstance: (instanceId: string, message: any) => void } | null = null;

  constructor(@Inject(DB_PROVIDER) private readonly db: DB) {}

  setGateway(gw: { emitToInstance: (instanceId: string, message: any) => void }) {
    this.gateway = gw;
  }

  async createMessage(
    instanceId: string,
    senderId: string,
    content: string,
    type: string = 'normal',
    metadata: any = {},
  ) {
    const id = randomUUID();
    const now = new Date();

    const [msg] = await this.db
      .insert(chatMessages)
      .values({
        id,
        instanceId,
        senderId,
        content,
        type,
        metadata,
        createdAt: now,
      })
      .returning();

    // Push via gateway
    if (this.gateway) {
      this.gateway.emitToInstance(instanceId, {
        ...msg,
        createdAt: msg.createdAt.toISOString(),
      });
    }

    return msg;
  }

  async listMessages(
    instanceId: string,
    options: { limit?: number; offset?: number; before?: Date } = {},
  ) {
    const { limit = 50, offset = 0, before } = options;

    const conditions = [eq(chatMessages.instanceId, instanceId)];
    // if (before) {
    //   conditions.push(lt(chatMessages.createdAt, before));
    // }

    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(and(...conditions))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit)
      .offset(offset);

    // Return in chronological order for UI
    return rows.reverse();
  }
}
