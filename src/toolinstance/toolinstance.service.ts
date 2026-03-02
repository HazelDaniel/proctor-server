import { Injectable, Inject, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, inArray, isNotNull, isNull, count, or, sql, ilike } from 'drizzle-orm';
import { eq, desc } from 'drizzle-orm';
import {
  documents,
  toolInstanceMembers,
  toolInstances,
  toolAccess,
  users,
} from 'src/db/drivers/drizzle/schema';
import { ToolRegistry } from 'src/tools/registry';
import { NotFoundError, PermissionDeniedError } from '../common/errors/domain-errors';
import { DB_PROVIDER } from 'src/db/db.module';
import type { DB } from 'src/db/db.provider';

import { DocumentRegistry } from 'src/document-registry/document-registry.service';
import { NotificationService } from 'src/notifications/notification.service';

interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

function paginate<T>(items: T[], page: number, limit: number): PaginatedResult<T> {
  const totalCount = items.length;
  const totalPages = Math.ceil(totalCount / limit);
  const offset = (page - 1) * limit;
  const paginatedItems = items.slice(offset, offset + limit);

  return {
    items: paginatedItems,
    totalCount,
    totalPages,
    currentPage: page,
  };
}

@Injectable()
export class ToolInstanceService {
  private readonly logger: Logger;
  constructor(
    private readonly toolRegistry: ToolRegistry,
    @Inject(DB_PROVIDER) private readonly db: DB,
    private readonly documentRegistry: DocumentRegistry,
    private readonly notificationService: NotificationService,
  ) {
    this.logger = new Logger(ToolInstanceService.name);
  }

  async getMemberCount(instanceId: string): Promise<number> {
    const rows = await this.db
      .select({ count: count() })
      .from(toolInstanceMembers)
      .where(eq(toolInstanceMembers.instanceId, instanceId));

    return (rows[0]?.count ?? 0) + 1; // +1 for the owner
  }

  async list(toolType?: string) {
    if (toolType) {
      return this.db
        .select()
        .from(toolInstances)
        .where(eq(toolInstances.toolType, toolType));
    }

    return this.db.select().from(toolInstances);
  }

  async listMembers(instanceId: string, requesterUserId: string) {
    // gate: must have access
    const ok = await this.canAccess(instanceId, requesterUserId);
    if (!ok) throw new PermissionDeniedError('Forbidden');

    const instRows = await this.db
      .select({ ownerUserId: toolInstances.ownerUserId })
      .from(toolInstances)
      .where(eq(toolInstances.id, instanceId))
      .limit(1);

    if (instRows.length === 0) throw new NotFoundError('Tool instance');
    const ownerUserId = instRows[0].ownerUserId;

    const memberRows = await this.db
      .select({ userId: toolInstanceMembers.userId })
      .from(toolInstanceMembers)
      .where(eq(toolInstanceMembers.instanceId, instanceId));

    // de-dupe + ensure owner included
    const set = new Set<string>();
    set.add(ownerUserId);
    for (const m of memberRows) set.add(m.userId);

    return Array.from(set).map((userId) => ({
      userId,
      role: userId === ownerUserId ? ('owner' as const) : ('member' as const),
    }));
  }

  async leave(instanceId: string, userId: string): Promise<boolean> {
    const inst = await this.getById(instanceId);
    if (!inst) throw new NotFoundError('Tool instance');

    if (inst.ownerUserId === userId) {
      // Owner cannot 'leave'; must transfer ownership or delete/archive
      throw new PermissionDeniedError(
        'Owner cannot leave instance. You can transfer ownership or delete/archive',
      );
    }

    // Must be a member to leave
    const isMember = await this.db
      .select({ userId: toolInstanceMembers.userId })
      .from(toolInstanceMembers)
      .where(
        and(
          eq(toolInstanceMembers.instanceId, instanceId),
          eq(toolInstanceMembers.userId, userId),
        ),
      )
      .limit(1);

    if (isMember.length === 0) {
      throw new PermissionDeniedError('Forbidden');
    }

    await this.db
      .delete(toolInstanceMembers)
      .where(
        and(
          eq(toolInstanceMembers.instanceId, instanceId),
          eq(toolInstanceMembers.userId, userId),
        ),
      );

    return true;
  }

  async listForUser(
    userId: string,
    toolType?: string,
    includeArchived: boolean = false,
  ) {
    const ownedWhere = toolType
      ? and(
          eq(toolInstances.ownerUserId, userId),
          eq(toolInstances.toolType, toolType),
        )
      : eq(toolInstances.ownerUserId, userId);

    const owned = await this.db
      .select()
      .from(toolInstances)
      .where(
        includeArchived
          ? ownedWhere
          : and(ownedWhere, isNull(toolInstances.archivedAt)),
      );

    // member
    const memberRows = await this.db
      .select({ instanceId: toolInstanceMembers.instanceId })
      .from(toolInstanceMembers)
      .where(eq(toolInstanceMembers.userId, userId));

    const memberIds = memberRows.map((r) => r.instanceId);
    if (memberIds.length === 0) return owned;

    const memberInstances = await this.db
      .select()
      .from(toolInstances)
      .where(
        and(
          inArray(toolInstances.id, memberIds),
          toolType ? eq(toolInstances.toolType, toolType) : undefined,
          includeArchived ? undefined : isNull(toolInstances.archivedAt),
        ),
      );

    // combine unique
    const byId = new Map<string, any>();
    for (const x of owned) byId.set(x.id, x);
    for (const x of memberInstances) byId.set(x.id, x);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return Array.from(byId.values());
  }

  async listArchivedForUser(userId: string, toolType?: string) {
    const where = toolType
      ? and(
          eq(toolInstances.ownerUserId, userId),
          eq(toolInstances.toolType, toolType),
          isNotNull(toolInstances.archivedAt),
        )
      : and(
          eq(toolInstances.ownerUserId, userId),
          isNotNull(toolInstances.archivedAt),
        );

    return this.db.select().from(toolInstances).where(where);
  }

  async create(toolType: string, ownerUserId: string) {
    const id = randomUUID();
    const docId = randomUUID();

    const [row] = await this.db.insert(toolInstances).values({ id, toolType, docId, ownerUserId }).returning();
    
    // Record initial access for the owner so it shows up in "recent"
    await this.recordAccess(ownerUserId, id);

    return row;
  }

  async canAccess(instanceId: string, userId: string): Promise<boolean> {
    if (!this.isValidUuid(instanceId)) return false;

    const rows = await this.db
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

    // Archived instances are ONLY accessible to the owner
    if (inst.archivedAt) return false;

    const mem = await this.db
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
      archivedAt: inst.archivedAt ?? null,
    };
  }

  async isOwner(instanceId: string, userId: string): Promise<boolean> {
    const rows = await this.db
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
    if (!inst) throw new NotFoundError('Tool instance');
    if (inst.ownerUserId !== currentOwnerId) throw new PermissionDeniedError('Forbidden');

    // ensure new owner can access after transfer (make them a member if needed)
    if (newOwnerUserId !== currentOwnerId) {
      const isMember = await this.canAccess(instanceId, newOwnerUserId);
      if (!isMember) {
        await this.addMember(instanceId, newOwnerUserId);
      }
    }

    await this.db
      .update(toolInstances)
      .set({ ownerUserId: newOwnerUserId })
      .where(eq(toolInstances.id, instanceId));

    return { ...inst, ownerUserId: newOwnerUserId };
  }

  async rename(instanceId: string, userId: string, newName: string) {
    const inst = await this.getById(instanceId);
    if (!inst) throw new NotFoundError('Tool instance');
    if (inst.ownerUserId !== userId) throw new PermissionDeniedError('Forbidden');

    const [updated] = await this.db
      .update(toolInstances)
      .set({ name: newName, lastModified: new Date() })
      .where(eq(toolInstances.id, instanceId))
      .returning();

    return updated;
  }

  async addMember(instanceId: string, userId: string): Promise<boolean> {
    // idempotent insert: try/catch on unique constraint
    try {
      await this.db.insert(toolInstanceMembers).values({ instanceId, userId });
      return true;
    } catch {
      return false;
    }
  }

  async removeMember(instanceId: string, userId: string): Promise<boolean> {
    const inst = await this.getById(instanceId);
    if (!inst) return false;
    if (inst.ownerUserId === userId) return false;

    await this.db
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
    if (!this.isValidUuid(instanceId)) return null;
    const [instance] = await this.db
      .select()
      .from(toolInstances)
      .where(eq(toolInstances.id, instanceId))
      .limit(1);

    return instance ?? null;
  }

  private isValidUuid(id: string): boolean {
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(id);
  }

  async archive(instanceId: string, ownerUserId: string) {
    const inst = await this.getById(instanceId);
    if (!inst) throw new NotFoundError('Tool instance');
    if (inst.ownerUserId !== ownerUserId) throw new PermissionDeniedError('Forbidden');

    await this.db
      .update(toolInstances)
      .set({ archivedAt: new Date(), lastModified: new Date() })
      .where(eq(toolInstances.id, instanceId));

    // Notify members
    const memberRows = await this.db.select({ userId: toolInstanceMembers.userId }).from(toolInstanceMembers).where(eq(toolInstanceMembers.instanceId, instanceId));
    for (const mem of memberRows) {
      await this.notificationService.create(mem.userId, 'project_archived', { projectName: inst.name }, instanceId);
    }

    return true;
  }

  async unarchive(instanceId: string, ownerUserId: string) {
    const inst = await this.getById(instanceId);
    if (!inst) throw new NotFoundError('Tool instance');
    if (inst.ownerUserId !== ownerUserId) throw new PermissionDeniedError('Forbidden');

    await this.db
      .update(toolInstances)
      .set({ archivedAt: null, lastModified: new Date() })
      .where(eq(toolInstances.id, instanceId));

    return true;
  }

  async delete(instanceId: string, ownerUserId: string) {
    const inst = await this.getById(instanceId);
    if (!inst) throw new NotFoundError('Tool instance');
    if (inst.ownerUserId !== ownerUserId) throw new PermissionDeniedError('Forbidden');

    // Fetch members before deletion so we can notify them
    const memberRows = await this.db.select({ userId: toolInstanceMembers.userId }).from(toolInstanceMembers).where(eq(toolInstanceMembers.instanceId, instanceId));

    // Hard delete tool instance (invites/members cascade via FK)
    await this.db.delete(toolInstances).where(eq(toolInstances.id, instanceId));

    // Also delete the document row so snapshots/updates cascade
    // (Assumes documentSnapshots/documentUpdates reference documents with ON DELETE CASCADE)
    await this.db.delete(documents).where(eq(documents.id, inst.docId));

    // immediately forget from registry to prevent eviction race
    this.documentRegistry.forget(inst.docId);

    // Notify members (use instanceId = undefined since the DB row is gone, and cascading would delete the notification if we attached it)
    for (const mem of memberRows) {
      await this.notificationService.create(mem.userId, 'project_deleted', { projectName: inst.name });
    }

    return true;
  }

  async recordAccess(userId: string, instanceId: string) {
    const existing = await this.db
      .select()
      .from(toolAccess)
      .where(
        and(
          eq(toolAccess.userId, userId),
          eq(toolAccess.instanceId, instanceId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(toolAccess)
        .set({
          lastAccessedAt: new Date(),
          accessCount: existing[0].accessCount + 1,
        })
        .where(
          and(
            eq(toolAccess.userId, userId),
            eq(toolAccess.instanceId, instanceId),
          ),
        );
    } else {
      await this.db.insert(toolAccess).values({
        userId,
        instanceId,
        lastAccessedAt: new Date(),
        accessCount: 1,
      });
    }
  }

  async searchForUser(userId: string, query: string) {
    const memberRows = await this.db
      .select({ instanceId: toolInstanceMembers.instanceId })
      .from(toolInstanceMembers)
      .where(eq(toolInstanceMembers.userId, userId));

    const memberInstanceIds = memberRows.map(r => r.instanceId);

    const instances = await this.db
      .select({
        id: toolInstances.id,
        toolType: toolInstances.toolType,
        docId: toolInstances.docId,
        ownerUserId: toolInstances.ownerUserId,
        name: toolInstances.name,
        createdAt: toolInstances.createdAt,
        lastModified: toolInstances.lastModified,
        archivedAt: toolInstances.archivedAt,
        lastAccessedAt: toolAccess.lastAccessedAt,
        accessCount: toolAccess.accessCount,
      })
      .from(toolInstances)
      .leftJoin(
        toolAccess,
        and(
          eq(toolAccess.instanceId, toolInstances.id),
          eq(toolAccess.userId, userId)
        )
      )
      .where(
        and(
          isNull(toolInstances.archivedAt),
          ilike(toolInstances.name, `%${query}%`),
          or(
            eq(toolInstances.ownerUserId, userId),
            memberInstanceIds.length > 0 ? inArray(toolInstances.id, memberInstanceIds) : undefined
          )
        )
      )
      .orderBy(sql`${toolAccess.lastAccessedAt} desc nulls last`, desc(toolInstances.createdAt))
      .limit(20);

    return instances;
  }

  async listForUserPaginated(
    userId: string,
    sortBy: 'recent' | 'popular' = 'recent',
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    items: (typeof toolInstances.$inferSelect & { lastAccessedAt: Date; accessCount: number })[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
  }> {
    const offset = (page - 1) * limit;

    const memberRows = await this.db
      .select({ instanceId: toolInstanceMembers.instanceId })
      .from(toolInstanceMembers)
      .where(eq(toolInstanceMembers.userId, userId));

    const memberInstanceIds = memberRows.map(r => r.instanceId);
    
    // Get all instance IDs (only active ones)
    const allInstanceIds = await this.db
      .select({ id: toolInstances.id })
      .from(toolInstances)
      .where(
        and(
          isNull(toolInstances.archivedAt),
          or(
            eq(toolInstances.ownerUserId, userId),
            memberInstanceIds.length > 0 ? inArray(toolInstances.id, memberInstanceIds) : undefined
          )
        )
      );

    const instanceIdList = allInstanceIds.map(i => i.id);

    if (instanceIdList.length === 0) {
      return paginate([], page, limit);
    }

    // Get total count
    const totalCount = instanceIdList.length;
    const totalPages = Math.ceil(totalCount / limit);

    // Build the orderBy clause
    const orderByClause = sortBy === 'popular' 
      ? [sql`${toolAccess.accessCount} desc nulls last`, desc(toolInstances.createdAt)]
      : [sql`${toolAccess.lastAccessedAt} desc nulls last`, desc(toolInstances.createdAt)];

    // Query with LEFT JOIN to toolAccess and users
    const items = await this.db
      .select({
        id: toolInstances.id,
        toolType: toolInstances.toolType,
        docId: toolInstances.docId,
        ownerUserId: toolInstances.ownerUserId,
        name: toolInstances.name,
        createdAt: toolInstances.createdAt,
        lastModified: toolInstances.lastModified,
        archivedAt: toolInstances.archivedAt,
        lastAccessedAt: toolAccess.lastAccessedAt,
        accessCount: toolAccess.accessCount,
      })
      .from(toolInstances)
      .leftJoin(
        toolAccess,
        and(
          eq(toolAccess.instanceId, toolInstances.id),
          eq(toolAccess.userId, userId)
        )
      )
      .where(inArray(toolInstances.id, instanceIdList))
      .orderBy(...orderByClause)
      .limit(limit)
      .offset(offset);

    const formattedItems = items.map(item => ({
      ...item,
      lastAccessedAt: item.lastAccessedAt ?? item.createdAt,
      accessCount: item.accessCount ?? 0,
    }));

    // this.logger.warn('[Tool instance Resolver]: items are', formattedItems);

    return {
      items: formattedItems,
      totalCount,
      totalPages,
      currentPage: page,
    };
  }
}
