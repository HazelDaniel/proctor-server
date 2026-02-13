import { startPostgres } from '../utils/postgres.js';
import { runMigrations } from '../utils/migrate.js';
import type { ToolInstanceService } from '../../src/toolinstance/toolinstance.service.js';
import type { InvitesService } from '../../src/invites/invites.service.js';
import type { UsersService } from '../../src/users/users.service.js';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

describe('Invitations Flow (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let toolSvc: ToolInstanceService;
  let inviteSvc: InvitesService;
  let userSvc: UsersService;

  beforeAll(async () => {
    const pg = await startPostgres();
    container = pg.container;

    process.env.DATABASE_URL = pg.url;
    runMigrations();

    const { createTestingModule } = await import('../utils/test-app.js');
    const { ToolInstanceService: ToolInstanceServiceClass } = await import('../../src/toolinstance/toolinstance.service.js');
    const { InvitesService: InvitesServiceClass } = await import('../../src/invites/invites.service.js');
    const { UsersService: UsersServiceClass } = await import('../../src/users/users.service.js');

    const moduleRef = await createTestingModule();
    toolSvc = moduleRef.get(ToolInstanceServiceClass);
    inviteSvc = moduleRef.get(InvitesServiceClass);
    userSvc = moduleRef.get(UsersServiceClass);
  });

  afterAll(async () => {
    const { pool } = await import('src/db/db.provider.js');
    await pool.end();
    await container.stop();
  });

  test('sent invites vs received invitations', async () => {
    const ownerId = '00000000-0000-0000-0000-000000000001';
    const inviteeId = '00000000-0000-0000-0000-000000000002';
    const ownerEmail = 'owner@example.com';
    const inviteeEmail = 'invitee@example.com';

    // Set up users
    const { db } = await import('src/db/db.provider.js');
    const { users } = await import('src/db/drivers/drizzle/schema.js');
    await db.insert(users).values([
      { id: ownerId, email: ownerEmail },
      { id: inviteeId, email: inviteeEmail }
    ]);

    const inst = await toolSvc.create('schema-design', ownerId);

    // Owner invites Invitee
    await inviteSvc.createInvite(inst.id, ownerId, inviteeEmail);

    // 1. Check Invitee's received invitations
    const received = await inviteSvc.myPendingInvites(inviteeEmail);
    expect(received.length).toBe(1);
    expect(received[0].instanceId).toBe(inst.id);
    expect(received[0].createdByUserId).toBe(ownerId);

    // 2. Check Owner's pending sent invitations
    const pendingSent = await inviteSvc.listSentPendingInvites(ownerId);
    expect(pendingSent.length).toBe(1);
    expect(pendingSent[0].invitedEmail).toBe(inviteeEmail);
    expect(pendingSent[0].status).toBe('pending');
  });
});
