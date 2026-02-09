import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, inArray } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { db } from 'src/db/db.provider';
import {
  toolInstanceMembers,
  toolInstances,
} from 'src/db/drivers/drizzle/schema';
import { ToolRegistry } from 'src/tools/registry';

@Injectable()
export class ToolInstanceService {
  constructor(private readonly toolRegistry: ToolRegistry) {}

  async list(toolType?: string) {
    if (toolType) {
      return db
        .select()
        .from(toolInstances)
        .where(eq(toolInstances.toolType, toolType));
    }

    return db.select().from(toolInstances);
  }

  async listForUser(userId: string, toolType?: string) {
    // owned
    const owned = await db
      .select()
      .from(toolInstances)
      .where(
        toolType
          ? and(
              eq(toolInstances.ownerUserId, userId),
              eq(toolInstances.toolType, toolType),
            )
          : eq(toolInstances.ownerUserId, userId),
      );

    // member
    const memberRows = await db
      .select({ instanceId: toolInstanceMembers.instanceId })
      .from(toolInstanceMembers)
      .where(eq(toolInstanceMembers.userId, userId));

    const memberIds = memberRows.map((r) => r.instanceId);
    if (memberIds.length === 0) return owned;

    const memberInstances = await db
      .select()
      .from(toolInstances)
      .where(
        toolType
          ? and(
              inArray(toolInstances.id, memberIds),
              eq(toolInstances.toolType, toolType),
            )
          : inArray(toolInstances.id, memberIds),
      );

    // combine unique
    const byId = new Map<string, any>();
    for (const x of owned) byId.set(x.id, x);
    for (const x of memberInstances) byId.set(x.id, x);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return Array.from(byId.values());
  }

  async create(toolType: string, ownerUserId: string) {
    const id = randomUUID();
    const docId = randomUUID();

    await db.insert(toolInstances).values({ id, toolType, docId, ownerUserId });
    return { id, toolType, docId, ownerUserId };
  }

  async canAccess(instanceId: string, userId: string): Promise<boolean> {
    const rows = await db
      .select({ id: toolInstances.id })
      .from(toolInstances)
      .leftJoin(
        toolInstanceMembers,
        and(
          eq(toolInstanceMembers.instanceId, toolInstances.id),
          eq(toolInstanceMembers.userId, userId),
        ),
      )
      .where(eq(toolInstances.id, instanceId))
      .limit(1);

    if (rows.length === 0) return false;

    const inst = await this.getById(instanceId);
    if (!inst) return false;

    if (inst.ownerUserId === userId) return true;

    const mem = await db
      .select()
      .from(toolInstanceMembers)
      .where(
        and(
          eq(toolInstanceMembers.instanceId, instanceId),
          eq(toolInstanceMembers.userId, userId),
        ),
      )
      .limit(1);

    return mem.length > 0;
  }

  async getDocByInstanceId(instanceId: string) {
    const inst = await this.getById(instanceId);
    if (!inst) return null;
    return {
      docId: inst.docId,
      toolType: inst.toolType,
      ownerUserId: inst.ownerUserId,
    };
  }

  async isOwner(instanceId: string, userId: string): Promise<boolean> {
    const rows = await db
      .select({ ownerUserId: toolInstances.ownerUserId })
      .from(toolInstances)
      .where(eq(toolInstances.id, instanceId))
      .limit(1);

    return rows.length > 0 && rows[0].ownerUserId === userId;
  }

  async transferOwnership(
    instanceId: string,
    currentOwnerId: string,
    newOwnerUserId: string,
  ) {
    const inst = await this.getById(instanceId);
    if (!inst) throw new Error('Tool instance not found');
    if (inst.ownerUserId !== currentOwnerId) throw new Error('Forbidden');

    // ensure new owner can access after transfer (make them a member if needed)
    if (newOwnerUserId !== currentOwnerId) {
      const isMember = await this.canAccess(instanceId, newOwnerUserId);
      if (!isMember) {
        await this.addMember(instanceId, newOwnerUserId);
      }
    }

    await db
      .update(toolInstances)
      .set({ ownerUserId: newOwnerUserId })
      .where(eq(toolInstances.id, instanceId));

    return { ...inst, ownerUserId: newOwnerUserId };
  }

  async addMember(instanceId: string, userId: string): Promise<boolean> {
    // idempotent insert: try/catch on unique constraint
    try {
      await db.insert(toolInstanceMembers).values({ instanceId, userId });
      return true;
    } catch {
      return false;
    }
  }

  async removeMember(instanceId: string, userId: string): Promise<boolean> {
    const inst = await this.getById(instanceId);
    if (!inst) return false;
    if (inst.ownerUserId === userId) return false;

    await db
      .delete(toolInstanceMembers)
      .where(
        and(
          eq(toolInstanceMembers.instanceId, instanceId),
          eq(toolInstanceMembers.userId, userId),
        ),
      );
    return true;
  }

  async getById(instanceId: string) {
    const [instance] = await db
      .select()
      .from(toolInstances)
      .where(eq(toolInstances.id, instanceId))
      .limit(1);

    return instance ?? null;
  }
}
