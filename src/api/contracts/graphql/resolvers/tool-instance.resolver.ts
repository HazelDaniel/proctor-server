import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { ToolRegistry } from 'src/tools/registry';
import { DocumentRegistry } from 'src/document-registry/document-registry.service';
import { ToolInstanceService } from 'src/toolinstance/toolinstance.service';
import type { Doc } from 'yjs' with { 'resolution-mode': 'import' };
import {
  CreateToolInstanceResult,
  ToolInstance,
  ValidationResult,
} from '../types';
import { CurrentUserId } from 'src/api/v1/graphql/utils/decorators/current-user-id';

@Resolver()
export class ToolInstanceResolver {
  constructor(
    private readonly toolInstanceService: ToolInstanceService,
    private readonly toolRegistry: ToolRegistry,
    private readonly documentRegistry: DocumentRegistry,
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

  @Mutation(() => String, { nullable: true })
  async compileToolInstance(@Args('instanceId') instanceId: string) {
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
}
