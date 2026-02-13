import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { ToolRegistry } from 'src/tools/registry';
import { DocumentRegistry } from 'src/document-registry/document-registry.service';
import { ToolInstanceService } from 'src/toolinstance/toolinstance.service';
import type { Doc } from 'yjs' with { 'resolution-mode': 'import' };
import {
  CreateInviteResult,
  CreateToolInstanceResult,
  MyInvite,
  SentInvite,
  ToolInstance,
  ToolInstanceInvite,
  ToolInstanceMember,
  ValidationResult,
} from '../types';
import { CurrentUserId } from 'src/api/v1/graphql/utils/decorators/current-user-id';
import { InvitesService } from 'src/invites/invites.service';
import { UsersService } from 'src/users/users.service';
import {
  NotFoundError,
  PermissionDeniedError,
  UnauthenticatedError,
} from 'src/common/errors/domain-errors';

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
    if (!userId) throw new UnauthenticatedError('Unauthorized');
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
    if (!userId) throw new UnauthenticatedError('Unauthorized');
    return this.invites.createInvite(instanceId, userId, email);
  }

  @Query(() => [ToolInstanceInvite])
  async toolInstanceInvites(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new UnauthenticatedError('Unauthorized');
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
    if (!userId) throw new UnauthenticatedError('Unauthorized');
    return this.invites.revokeInvite(inviteId, userId);
  }

  @Mutation(() => Boolean)
  async acceptToolInstanceInvite(
    @Args('token') token: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new UnauthenticatedError('Unauthorized');

    const email = await this.users.getEmailById(userId);
    if (!email) throw new NotFoundError('User email');

    return this.invites.acceptInvite(token, userId, email);
  }

  @Mutation(() => CreateToolInstanceResult)
  async createToolInstance(
    @Args('toolType') toolType: string,
    @CurrentUserId() ownerUserId: string,
  ) {
    if (!ownerUserId) throw new UnauthenticatedError('Unauthorized!');
    const instance = await this.toolInstanceService.create(
      toolType,
      ownerUserId,
    );
    return {
      instance: {
        ...instance,
        createdAt: String(instance.createdAt),
      },
    };
  }

  @Mutation(() => ValidationResult)
  async validateToolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new UnauthenticatedError('Unauthorized');
    const instance = await this.toolInstanceService.getById(instanceId);
    if (!instance) {
      throw new NotFoundError('Tool instance');
    }
    if (!(await this.toolInstanceService.canAccess(instanceId, userId)))
      throw new PermissionDeniedError('Forbidden');

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
    if (!userId) throw new UnauthenticatedError('Unauthorized');

    const isOwner = await this.toolInstanceService.isOwner(instanceId, userId);
    if (!isOwner) throw new PermissionDeniedError('Forbidden');

    if (invitedUserId === userId) return true;

    return this.toolInstanceService.addMember(instanceId, invitedUserId);
  }

  @Mutation(() => Boolean)
  async removeToolInstanceMember(
    @Args('instanceId') instanceId: string,
    @Args('userId') memberUserId: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new UnauthenticatedError('Unauthorized');
    if (!(await this.toolInstanceService.isOwner(instanceId, userId)))
      throw new PermissionDeniedError('Forbidden');
    return this.toolInstanceService.removeMember(instanceId, memberUserId);
  }

  @Mutation(() => ToolInstance)
  async transferToolInstanceOwnership(
    @Args('instanceId') instanceId: string,
    @Args('newOwnerUserId') newOwnerUserId: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new UnauthenticatedError('Unauthorized');
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
    if (!userId) throw new UnauthenticatedError('Unauthorized');

    const isOwner = await this.toolInstanceService.isOwner(instanceId, userId);
    if (!isOwner) throw new PermissionDeniedError('Forbidden');

    const inst = await this.toolInstanceService.getById(instanceId);
    if (!inst) throw new NotFoundError('Tool instance');

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
    if (!userId) throw new UnauthenticatedError('Unauthorized');
    return this.toolInstanceService.archive(instanceId, userId);
  }

  @Mutation(() => Boolean)
  async unarchiveToolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string | null,
  ) {
    await Promise.resolve();
    if (!userId) throw new UnauthenticatedError('Unauthorized');
    return this.toolInstanceService.unarchive(instanceId, userId);
  }

  @Mutation(() => Boolean)
  async deleteToolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string | null,
  ) {
    await Promise.resolve();
    if (!userId) throw new UnauthenticatedError('Unauthorized');
    return this.toolInstanceService.delete(instanceId, userId);
  }

  @Query(() => [ToolInstanceMember])
  async toolInstanceMembers(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string | null,
  ) {
    await Promise.resolve();
    if (!userId) throw new UnauthenticatedError('Unauthorized');
    return this.toolInstanceService.listMembers(instanceId, userId);
  }

  @Mutation(() => Boolean)
  async leaveToolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string | null,
  ) {
    await Promise.resolve();
    if (!userId) throw new UnauthenticatedError('Unauthorized');
    return this.toolInstanceService.leave(instanceId, userId);
  }

  @Query(() => [MyInvite])
  async myReceivedInvitations(@CurrentUserId() userId: string | null) {
    if (!userId) throw new UnauthenticatedError('Unauthorized');

    const email = await this.users.getEmailById(userId);
    if (!email) throw new NotFoundError('User email');

    const invites = await this.invites.myPendingInvites(email);

    const out: MyInvite[] = [];
    for (const inv of invites) {
      const inst = await this.toolInstanceService.getById(inv.instanceId);
      const inviterEmail = await this.users.getEmailById(inv.createdByUserId);

      out.push({
        inviteId: inv.id,
        instanceId: inv.instanceId,
        invitedEmail: inv.invitedEmail,
        status: inv.status,
        createdAt: String(inv.createdAt),
        expiresAt: String(inv.expiresAt),
        toolType: inst?.toolType,
        inviterEmail: inviterEmail ?? 'Unknown',
      });
    }
    return out;
  }

  @Query(() => [SentInvite])
  async myPendingInvites(@CurrentUserId() userId: string | null) {
    if (!userId) throw new UnauthenticatedError('Unauthorized');

    const invites = await this.invites.listSentPendingInvites(userId);

    const out: SentInvite[] = [];
    for (const inv of invites) {
      const inst = await this.toolInstanceService.getById(inv.instanceId);
      out.push({
        id: inv.id,
        instanceId: inv.instanceId,
        invitedEmail: inv.invitedEmail,
        status: inv.status,
        createdAt: String(inv.createdAt),
        expiresAt: String(inv.expiresAt),
        toolType: inst?.toolType,
      });
    }
    return out;
  }

  @Mutation(() => Boolean)
  async declineInvite(
    @Args('inviteId') inviteId: string,
    @CurrentUserId() userId: string | null,
  ) {
    if (!userId) throw new UnauthenticatedError('Unauthorized');

    const email = await this.users.getEmailById(userId);
    if (!email) throw new NotFoundError('User email');

    return this.invites.declineInvite(inviteId, email);
  }
}
