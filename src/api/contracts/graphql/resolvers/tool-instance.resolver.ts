import { Resolver, Query, Mutation, Args, Parent } from '@nestjs/graphql';
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
import { UseGuards } from '@nestjs/common';
import { SignedInGuard } from 'src/common/guards/signed-in.guard';
import { ToolInstanceAccessGuard } from 'src/common/guards/tool-instance-access.guard';
import { CheckUserOwnership, UserOwnershipGuard } from 'src/common/guards/user-ownership.guard';

@Resolver(() => ToolInstance)
export class ToolInstanceResolver {
  constructor(
    private readonly toolInstanceService: ToolInstanceService,
    private readonly toolRegistry: ToolRegistry,
    private readonly documentRegistry: DocumentRegistry,
    private readonly invites: InvitesService,
    private readonly users: UsersService,
  ) {}

  @Query(() => [ToolInstance])
  @UseGuards(SignedInGuard)
  async toolInstances(
    @Args('toolType', { nullable: true }) toolType: string,
    @CurrentUserId() userId: string,
  ) {
    const instances = await this.toolInstanceService.listForUser(userId, toolType);
    return instances.map((inst) => ({
      ...inst,
      ownerId: inst.ownerUserId,
      name: inst.name,
      lastModified: String(inst.lastModified),
    }));
  }

  @Query(() => ToolInstance, { nullable: true })
  @UseGuards(SignedInGuard, ToolInstanceAccessGuard)
  async toolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string,
  ) {
    const instance = await this.toolInstanceService.getById(instanceId);
    if (!instance) throw new NotFoundError('Tool instance');
    return {
      ...instance,
      ownerId: instance.ownerUserId,
      name: instance.name,
      lastModified: String(instance.lastModified),
    };
  }


  @Query(() => [ToolInstance])
  @UseGuards(SignedInGuard)
  async myArchivedToolInstances(
    @Args('toolType', { nullable: true }) toolType: string,
    @CurrentUserId() userId: string,
  ) {
    const instances = await this.toolInstanceService.listArchivedForUser(
      userId,
      toolType,
    );
    return instances.map((inst) => ({
      ...inst,
      createdAt: String(inst.createdAt),
      archivedAt: inst.archivedAt ? String(inst.archivedAt) : undefined,
      ownerId: inst.ownerUserId,
      name: inst.name,
      lastModified: String(inst.lastModified),
    }));
  }

  @Mutation(() => CreateInviteResult)
  @UseGuards(SignedInGuard, ToolInstanceAccessGuard)
  async createToolInstanceInvite(
    @Args('instanceId') instanceId: string,
    @Args('email') email: string,
    @CurrentUserId() userId: string,
  ) {
    
    return this.invites.createInvite(instanceId, userId, email);
  }

  @Query(() => [ToolInstanceInvite])
  @UseGuards(SignedInGuard, ToolInstanceAccessGuard)
  async toolInstanceInvites(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string,
  ) {
    const rows = await this.invites.listInvites(instanceId, userId);
    const memberCount = await this.toolInstanceService.getMemberCount(instanceId);
    return rows.map((r) => ({
      id: r.id,
      instanceId: r.instanceId,
      inviteeEmail: r.inviteeEmail,
      inviterEmail: r.inviterEmail,
      status: r.status,
      createdAt: String(r.createdAt),
      expiresAt: String(r.expiresAt),
      acceptedAt: r.acceptedAt ? String(r.acceptedAt) : undefined,
      revokedAt: r.revokedAt ? String(r.revokedAt) : undefined,
      memberCount,
    }));
  }

  @Mutation(() => Boolean)
  @UseGuards(SignedInGuard)
  async revokeToolInstanceInvite(
    @Args('inviteId') inviteId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.invites.revokeInvite(inviteId, userId);
  }

  @Mutation(() => Boolean)
  @UseGuards(SignedInGuard)
  async acceptToolInstanceInvite(
    @Args('token') token: string,
    @CurrentUserId() userId: string,
  ) {

    const email = await this.users.getEmailById(userId);
    if (!email) throw new NotFoundError('User email');

    return this.invites.acceptInvite(token, userId, email);
  }

  @Mutation(() => Boolean)
  @UseGuards(SignedInGuard)
  async acceptToolInstanceInviteById(
    @Args('inviteId') inviteId: string,
    @CurrentUserId() userId: string,
  ) {
    const email = await this.users.getEmailById(userId);
    if (!email) throw new NotFoundError('User email');

    return this.invites.acceptInviteById(inviteId, userId, email);
  }


  @Mutation(() => CreateToolInstanceResult)
  @UseGuards(SignedInGuard)
  async createToolInstance(
    @Args('toolType') toolType: string,
    @CurrentUserId() ownerUserId: string,
  ) {
    const instance = await this.toolInstanceService.create(
      toolType,
      ownerUserId,
    );
    return {
      instance: {
        ...instance,
        createdAt: String(instance.createdAt),
        ownerId: instance.ownerUserId,
      },
    };
  }

  @Mutation(() => ValidationResult)
  @UseGuards(SignedInGuard, ToolInstanceAccessGuard)
  async validateToolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string,
  ) {
    const instance = await this.toolInstanceService.getById(instanceId);
    if (!instance) {
      throw new NotFoundError('Tool instance');
    }

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
  @UseGuards(SignedInGuard)
  async addToolInstanceMember(
    @Args('instanceId') instanceId: string,
    @Args('userId') invitedUserId: string,
    @CurrentUserId() userId: string,
  ) {
    const isOwner = await this.toolInstanceService.isOwner(instanceId, userId);
    if (!isOwner) throw new PermissionDeniedError('Forbidden');

    if (invitedUserId === userId) return true;

    return this.toolInstanceService.addMember(instanceId, invitedUserId);
  }

  @Mutation(() => Boolean)
  @UseGuards(SignedInGuard)
  async removeToolInstanceMember(
    @Args('instanceId') instanceId: string,
    @Args('userId') memberUserId: string,
    @CurrentUserId() userId: string,
  ) {
    if (!(await this.toolInstanceService.isOwner(instanceId, userId)))
      throw new PermissionDeniedError('Forbidden');
    return this.toolInstanceService.removeMember(instanceId, memberUserId);
  }

  @Mutation(() => ToolInstance)
  @UseGuards(SignedInGuard)
  async transferToolInstanceOwnership(
    @Args('instanceId') instanceId: string,
    @Args('newOwnerUserId') newOwnerUserId: string,
    @CurrentUserId() userId: string,
  ) {
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
      ownerId: updated.ownerUserId,
    };
  }

  @Mutation(() => String, { nullable: true })
  @UseGuards(SignedInGuard, ToolInstanceAccessGuard)
  async compileToolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string,
  ) {
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
  @UseGuards(SignedInGuard)
  async archiveToolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string,
  ) {
    await Promise.resolve();
    return this.toolInstanceService.archive(instanceId, userId);
  }

  @Mutation(() => Boolean)
  @UseGuards(SignedInGuard)
  async unarchiveToolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string,
  ) {
    await Promise.resolve();
    return this.toolInstanceService.unarchive(instanceId, userId);
  }

  @Mutation(() => ToolInstance)
  @UseGuards(SignedInGuard)
  async renameToolInstance(
    @Args('instanceId') instanceId: string,
    @Args('name') name: string,
    @CurrentUserId() userId: string,
  ) {
    const updated = await this.toolInstanceService.rename(instanceId, userId, name);
    return {
      ...updated,
      ownerId: updated.ownerUserId,
      name: updated.name,
      lastModified: String(updated.lastModified),
    };
  }

  @Mutation(() => Boolean)
  @UseGuards(SignedInGuard)
  async deleteToolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string,
  ) {
    await Promise.resolve();
    return this.toolInstanceService.delete(instanceId, userId);
  }

  @Query(() => [ToolInstanceMember])
  @UseGuards(SignedInGuard, ToolInstanceAccessGuard)
  async toolInstanceMembers(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string,
  ) {
    await Promise.resolve();
    return this.toolInstanceService.listMembers(instanceId, userId);
  }

  @Mutation(() => Boolean)
  @UseGuards(SignedInGuard)
  async leaveToolInstance(
    @Args('instanceId') instanceId: string,
    @CurrentUserId() userId: string,
  ) {
    await Promise.resolve();
    return this.toolInstanceService.leave(instanceId, userId);
  }

  @Query(() => [MyInvite])
  @UseGuards(SignedInGuard)
  async myReceivedInvitations(@CurrentUserId() userId: string) {

    const email = await this.users.getEmailById(userId);
    if (!email) throw new NotFoundError('User email');

    const invites = await this.invites.myReceivedInvitations(email);

    const out: MyInvite[] = [];
    for (const inv of invites) {
      const inst = await this.toolInstanceService.getById(inv.instanceId);
      const memberCount = await this.toolInstanceService.getMemberCount(inv.instanceId);

      out.push({
        inviteId: inv.id,
        instanceId: inv.instanceId,
        inviteeEmail: inv.inviteeEmail,
        status: inv.status,
        createdAt: String(inv.createdAt),
        expiresAt: String(inv.expiresAt),
        toolType: inst?.toolType,
        inviterEmail: inv.inviterEmail,
        memberCount,
      });
    }
    return out;
  }

  @Query(() => [SentInvite])
  @UseGuards(SignedInGuard)
  async myPendingInvites(@CurrentUserId() userId: string) {

    const invites = await this.invites.listSentPendingInvites(userId);

    const out: SentInvite[] = [];
    for (const inv of invites) {
      const inst = await this.toolInstanceService.getById(inv.instanceId);
      const memberCount = await this.toolInstanceService.getMemberCount(inv.instanceId);
      out.push({
        id: inv.id,
        instanceId: inv.instanceId,
        inviteeEmail: inv.inviteeEmail,
        status: inv.status,
        createdAt: String(inv.createdAt),
        expiresAt: String(inv.expiresAt),
        toolType: inst?.toolType,
        memberCount,
      });
    }
    return out;
  }

  @Mutation(() => Boolean)
  @UseGuards(SignedInGuard)
  async declineInvite(
    @Args('inviteId') inviteId: string,
    @CurrentUserId() userId: string,
  ) {

    const email = await this.users.getEmailById(userId);
    if (!email) throw new NotFoundError('User email');

    return this.invites.declineInvite(inviteId, email);
  }
}


