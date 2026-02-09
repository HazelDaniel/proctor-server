import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { ToolRegistry } from 'src/tools/registry';
import { DocumentRegistry } from 'src/document-registry/document-registry.service';
import { ToolInstanceService } from 'src/toolinstance/toolinstance.service';
import type { Doc } from 'yjs' with { 'resolution-mode': 'import' };
import {
  CreateInviteResult,
  CreateToolInstanceResult,
  ToolInstance,
  ToolInstanceInvite,
  ValidationResult,
} from '../types';
import { CurrentUserId } from 'src/api/v1/graphql/utils/decorators/current-user-id';
import { InvitesService } from 'src/invites/invites.service';
import { UsersService } from 'src/users/users.service';

@Resolver()
export class ToolInstanceResolver {
  constructor(
    private readonly toolInstanceService: ToolInstanceService,
    private readonly toolRegistry: ToolRegistry,
    private readonly documentRegistry: DocumentRegistry,
    private readonly invites: InvitesService,
    private readonly users: UsersService,
  ) {}

  @Query(() => [ToolInstance])
  async toolInstances(
    @Args('toolType', { nullable: true }) toolType: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new Error('Unauthorized');
    await Promise.resolve();

    // minimal approach: we list only owned instances for now
    // NOTE: (we can extend to include memberships)
    return this.toolInstanceService.listForUser(userId, toolType);
  }

  @Mutation(() => CreateInviteResult)
  async createToolInstanceInvite(
    @Args('instanceId') instanceId: string,
    @Args('email') email: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new Error('Unauthorized');
    return this.invites.createInvite(instanceId, userId, email);
  }

  @Query(() => [ToolInstanceInvite])
  async toolInstanceInvites(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new Error('Unauthorized');
    const rows = await this.invites.listInvites(instanceId, userId);
    return rows.map((r) => ({
      id: r.id,
      instanceId: r.instanceId,
      invitedEmail: r.invitedEmail,
      status: r.status,
      createdAt: String(r.createdAt),
      expiresAt: String(r.expiresAt),
      acceptedAt: r.acceptedAt ? String(r.acceptedAt) : undefined,
      revokedAt: r.revokedAt ? String(r.revokedAt) : undefined,
    }));
  }

  @Mutation(() => Boolean)
  async revokeToolInstanceInvite(
    @Args('inviteId') inviteId: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new Error('Unauthorized');
    return this.invites.revokeInvite(inviteId, userId);
  }

  @Mutation(() => Boolean)
  async acceptToolInstanceInvite(
    @Args('token') token: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new Error('Unauthorized');

    const email = await this.users.getEmailById(userId);
    if (!email) throw new Error('User email not found');

    return this.invites.acceptInvite(token, userId, email);
  }

  @Mutation(() => CreateToolInstanceResult)
  async createToolInstance(
    @Args('toolType') toolType: string,
    @CurrentUserId() ownerUserId: string,
  ) {
    if (!ownerUserId) throw new Error('Unauthorized!');
    const instance = await this.toolInstanceService.create(
      toolType,
      ownerUserId,
    );
    return { instance };
  }

  @Mutation(() => ValidationResult)
  async validateToolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new Error('Unauthorized');
    const instance = await this.toolInstanceService.getById(instanceId);
    if (!instance) {
      throw new Error('Tool instance not found');
    }
    if (!(await this.toolInstanceService.canAccess(instanceId, userId)))
      throw new Error('Forbidden');

    const tool = this.toolRegistry.get(instance.toolType);
    if (!tool.validate) {
      return { valid: true, errors: [] };
    }

    const acquisition = await this.documentRegistry.acquire(
      instance.docId,
      instance.toolType,
    );

    try {
      return tool.validate(acquisition.doc as Doc);
    } finally {
      this.documentRegistry.release(instance.docId);
    }
  }

  @Mutation(() => Boolean)
  async addToolInstanceMember(
    @Args('instanceId') instanceId: string,
    @Args('userId') invitedUserId: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new Error('Unauthorized');

    const isOwner = await this.toolInstanceService.isOwner(instanceId, userId);
    if (!isOwner) throw new Error('Forbidden');

    if (invitedUserId === userId) return true;

    return this.toolInstanceService.addMember(instanceId, invitedUserId);
  }

  @Mutation(() => Boolean)
  async removeToolInstanceMember(
    @Args('instanceId') instanceId: string,
    @Args('userId') memberUserId: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new Error('Unauthorized');
    if (!(await this.toolInstanceService.isOwner(instanceId, userId)))
      throw new Error('Forbidden');
    return this.toolInstanceService.removeMember(instanceId, memberUserId);
  }

  @Mutation(() => ToolInstance)
  async transferToolInstanceOwnership(
    @Args('instanceId') instanceId: string,
    @Args('newOwnerUserId') newOwnerUserId: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new Error('Unauthorized');
    const updated = await this.toolInstanceService.transferOwnership(
      instanceId,
      userId,
      newOwnerUserId,
    );
    return {
      id: updated.id,
      toolType: updated.toolType,
      docId: updated.docId,
      createdAt: String(updated.createdAt),
    };
  }

  @Mutation(() => String, { nullable: true })
  async compileToolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new Error('Unauthorized');

    const isOwner = await this.toolInstanceService.isOwner(instanceId, userId);
    if (!isOwner) throw new Error('Forbidden');

    const inst = await this.toolInstanceService.getById(instanceId);
    if (!inst) throw new Error('Tool instance not found');

    const tool = this.toolRegistry.get(inst.toolType);
    if (!tool.compile) return null;

    const acquisition = await this.documentRegistry.acquire(
      inst.docId,
      inst.toolType,
    );
    try {
      return JSON.stringify(tool.compile(acquisition.doc as Doc), null, 2);
    } finally {
      this.documentRegistry.release(inst.docId);
    }
  }

  @Mutation(() => Boolean)
  async archiveToolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string | null,
  ) {
    await Promise.resolve();
    if (!userId) throw new Error('Unauthorized');
    return this.toolInstanceService.archive(instanceId, userId);
  }

  @Mutation(() => Boolean)
  async unarchiveToolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string | null,
  ) {
    await Promise.resolve();
    if (!userId) throw new Error('Unauthorized');
    return this.toolInstanceService.unarchive(instanceId, userId);
  }

  @Mutation(() => Boolean)
  async deleteToolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string | null,
  ) {
    await Promise.resolve();
    if (!userId) throw new Error('Unauthorized');
    return this.toolInstanceService.delete(instanceId, userId);
  }
}
