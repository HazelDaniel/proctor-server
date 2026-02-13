import { startPostgres } from '../utils/postgres.js';
import { runMigrations } from '../utils/migrate.js';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { ToolInstanceResolver } from '../../src/api/contracts/graphql/resolvers/tool-instance.resolver.js';
import { randomUUID } from 'crypto';

describe('Feature Flow: Authentication, Life Cycle, and Collaboration', () => {
  let container: StartedPostgreSqlContainer;
  let resolver: ToolInstanceResolver;
  let ownerId: string;
  let ownerEmail: string;
  let memberId: string;
  let memberEmail: string;

  beforeAll(async () => {
    const pg = await startPostgres();
    container = pg.container;

    process.env.DATABASE_URL = pg.url;
    
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-secret-key-for-integration-tests';
    }

    runMigrations();

    const { createTestingModule } = await import('../utils/test-app.js');
    const { ToolInstanceResolver: ResolverClass } = await import(
      '../../src/api/contracts/graphql/resolvers/tool-instance.resolver.js'
    );

    const moduleRef = await createTestingModule();
    resolver = moduleRef.get(ResolverClass);

    // Register tools manually since we are not using ToolModule.onModuleInit
    const { ToolRegistry } = await import('../../src/tools/registry.js');
    const { SchemaDesignTool: ToolClass } = await import('../../src/tools/implementations/schema-design/tool.js');
    const registry = moduleRef.get(ToolRegistry);
    const tool = moduleRef.get(ToolClass);
    registry.register(tool.definition);

    // Dynamic import for DB to ensure it uses the test DATABASE_URL
    const { db } = await import('../../src/db/db.provider.js');
    const { users } = await import('../../src/db/drivers/drizzle/schema.js');

    // Setup test users in the database
    ownerId = randomUUID();
    ownerEmail = `owner-${ownerId}@example.com`;
    memberId = randomUUID();
    memberEmail = `member-${memberId}@example.com`;

    await db.insert(users).values([
      { id: ownerId, email: ownerEmail },
      { id: memberId, email: memberEmail },
    ]);
  });

  afterAll(async () => {
    const { pool } = await import('../../src/db/db.provider.js');
    await pool.end();
    await container.stop();
  });

  describe('Basic Flow', () => {
    test('should create and list tool instances', async () => {
      const createResult = await resolver.createToolInstance(
        'schema-design',
        ownerId
      );

      expect(createResult.instance.toolType).toBe('schema-design');
      const instanceId = createResult.instance.id;

      const instances = await resolver.toolInstances(undefined as any, ownerId);
      expect(instances.some(i => i.id === instanceId)).toBe(true);
    });

    test('should isolate instances between users', async () => {
      const ownerInstance = await resolver.createToolInstance('schema-design', ownerId);
      const memberInstance = await resolver.createToolInstance('schema-design', memberId);

      const ownerList = await resolver.toolInstances(undefined as any, ownerId);
      const memberList = await resolver.toolInstances(undefined as any, memberId);

      expect(ownerList.some(i => i.id === ownerInstance.instance.id)).toBe(true);
      expect(ownerList.some(i => i.id === memberInstance.instance.id)).toBe(false);
      expect(memberList.some(i => i.id === memberInstance.instance.id)).toBe(true);
      expect(memberList.some(i => i.id === ownerInstance.instance.id)).toBe(false);
    });

    test('should correctly reflect ownership via iOwn field', async () => {
      const ownerInstance = await resolver.createToolInstance('schema-design', ownerId);
      
      // Owner check
      const ownerList = await resolver.toolInstances(undefined as any, ownerId);
      const myInst = ownerList.find(i => i.id === ownerInstance.instance.id);
      expect(myInst).toBeDefined();
      expect(resolver.iOwn(myInst as any, ownerId)).toBe(true);
      
      // Share with member (add as member)
      await resolver.addToolInstanceMember(ownerInstance.instance.id, memberId, ownerId);
      
      // Member check
      const memberList = await resolver.toolInstances(undefined as any, memberId);
      const sharedInst = memberList.find(i => i.id === ownerInstance.instance.id);
      expect(sharedInst).toBeDefined();
      expect(resolver.iOwn(sharedInst as any, memberId)).toBe(false);
    });
  });

  describe('Invitation Flow', () => {
    let instanceId: string;

    beforeEach(async () => {
      const res = await resolver.createToolInstance('schema-design', ownerId);
      instanceId = res.instance.id;
    });

    test('should create, list and accept an invite', async () => {
      // Create invite
      const inviteRes = await resolver.createToolInstanceInvite(instanceId, memberEmail, ownerId);
      expect(inviteRes.token).toBeDefined();
      expect(inviteRes.invitedEmail).toBe(memberEmail);

      // List invites as owner
      const invites = await resolver.toolInstanceInvites(instanceId, ownerId);
      expect(invites.some(inv => inv.invitedEmail === memberEmail)).toBe(true);

      // Check pending invites for member
      const myInvites = await resolver.myReceivedInvitations(memberId);
      expect(myInvites.some(inv => inv.instanceId === instanceId)).toBe(true);

      // Accept invite
      const acceptRes = await resolver.acceptToolInstanceInvite(inviteRes.token, memberId);
      expect(acceptRes).toBe(true);

      // Verify member can now access
      const members = await resolver.toolInstanceMembers(instanceId, ownerId);
      expect(members.some(m => m.userId === memberId)).toBe(true);
    });

    test('should revoke an invite', async () => {
      await resolver.createToolInstanceInvite(instanceId, memberEmail, ownerId);
      const invites = await resolver.toolInstanceInvites(instanceId, ownerId);
      const inviteId = invites.find(i => i.invitedEmail === memberEmail)!.id;

      const revokeRes = await resolver.revokeToolInstanceInvite(inviteId, ownerId);
      expect(revokeRes).toBe(true);

      const updatedInvites = await resolver.toolInstanceInvites(instanceId, ownerId);
      expect(updatedInvites.find(i => i.id === inviteId)?.status).toBe('revoked');
    });

    test('should decline an invite', async () => {
      await resolver.createToolInstanceInvite(instanceId, memberEmail, ownerId);
      const myInvites = await resolver.myReceivedInvitations(memberId);
      const inviteId = myInvites.find(i => i.instanceId === instanceId)!.inviteId;

      const declineRes = await resolver.declineInvite(inviteId, memberId);
      expect(declineRes).toBe(true);

      const updatedMyInvites = await resolver.myReceivedInvitations(memberId);
      expect(updatedMyInvites.some(inv => inv.inviteId === inviteId)).toBe(false);
    });
  });

  describe('Member Management', () => {
    let instanceId: string;

    beforeEach(async () => {
      const res = await resolver.createToolInstance('schema-design', ownerId);
      instanceId = res.instance.id;
    });

    test('should add and remove member directly', async () => {
      // Add member
      const addRes = await resolver.addToolInstanceMember(instanceId, memberId, ownerId);
      expect(addRes).toBe(true);

      let members = await resolver.toolInstanceMembers(instanceId, ownerId);
      expect(members.some(m => m.userId === memberId)).toBe(true);

      // Remove member
      const removeRes = await resolver.removeToolInstanceMember(instanceId, memberId, ownerId);
      expect(removeRes).toBe(true);

      members = await resolver.toolInstanceMembers(instanceId, ownerId);
      expect(members.some(m => m.userId === memberId)).toBe(false);
    });

    test('should allow member to leave', async () => {
      await resolver.addToolInstanceMember(instanceId, memberId, ownerId);
      
      const leaveRes = await resolver.leaveToolInstance(instanceId, memberId);
      expect(leaveRes).toBe(true);

      const members = await resolver.toolInstanceMembers(instanceId, ownerId);
      expect(members.some(m => m.userId === memberId)).toBe(false);
    });
  });

  describe('Lifecycle Management', () => {
    let instanceId: string;

    beforeEach(async () => {
      const res = await resolver.createToolInstance('schema-design', ownerId);
      instanceId = res.instance.id;
    });

    test('should archive and unarchive instance', async () => {
      // Archive
      const archiveRes = await resolver.archiveToolInstance(instanceId, ownerId);
      expect(archiveRes).toBe(true);

      let instances = await resolver.toolInstances(undefined as any, ownerId);
      expect(instances.some(i => i.id === instanceId)).toBe(false);

      // Unarchive
      const unarchiveRes = await resolver.unarchiveToolInstance(instanceId, ownerId);
      expect(unarchiveRes).toBe(true);

      instances = await resolver.toolInstances(undefined as any, ownerId);
      expect(instances.some(i => i.id === instanceId)).toBe(true);
    });

    test('should delete instance', async () => {
      const deleteRes = await resolver.deleteToolInstance(instanceId, ownerId);
      expect(deleteRes).toBe(true);

      const instances = await resolver.toolInstances(undefined as any, ownerId);
      expect(instances.some(i => i.id === instanceId)).toBe(false);
    });
  });

  describe('Tool Actions', () => {
    let instanceId: string;

    beforeEach(async () => {
      const res = await resolver.createToolInstance('schema-design', ownerId);
      instanceId = res.instance.id;
    });

    test('should validate instance', async () => {
      const validateRes = await resolver.validateToolInstance(instanceId, ownerId);
      expect(validateRes.valid).toBeDefined();
    });

    test('should compile instance', async () => {
      const compileRes = await resolver.compileToolInstance(instanceId, ownerId);
      // Might be null if tool doesn't support compile
      expect(compileRes !== undefined).toBe(true);
    });
  });
});
