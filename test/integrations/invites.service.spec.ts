import { startPostgres } from '../utils/postgres.js';
import { runMigrations } from '../utils/migrate.js';
import type { ToolInstanceService } from '../../src/toolinstance/toolinstance.service.js';
import type { InvitesService } from '../../src/invites/invites.service.js';
import type { UsersService } from '../../src/users/users.service.js';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { randomUUID } from 'crypto';

describe('InvitesService (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let toolSvc: ToolInstanceService;
  let inviteSvc: InvitesService;
  let userSvc: UsersService;

  beforeAll(async () => {
    const pg = await startPostgres();
    container = pg.container;

    process.env.DATABASE_URL = pg.url;
    runMigrations();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { createTestingModule } = await import('../utils/test-app.js');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { ToolInstanceService: ToolInstanceServiceClass } = await import('../../src/toolinstance/toolinstance.service.js');
    const { InvitesService: InvitesServiceClass } = await import('../../src/invites/invites.service.js');
    const { UsersService: UsersServiceClass } = await import('../../src/users/users.service.js');

    const moduleRef = await createTestingModule();
    toolSvc = moduleRef.get(ToolInstanceServiceClass);
    inviteSvc = moduleRef.get(InvitesServiceClass);
    userSvc = moduleRef.get(UsersServiceClass);
  });

  afterAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { pool } = await import('src/db/db.provider.js');
    await pool.end();
    await container.stop();
  });

  test('create invite -> shows in myReceivedInvitations -> accept adds membership', async () => {
    const { db } = await import('src/db/db.provider.js');
    const { users } = await import('src/db/drivers/drizzle/schema.js');

    const ownerId = randomUUID();
    // create a user row to represent owner
    await db.insert(users).values({ id: ownerId, email: 'owner@example.com' });

    const inst = await toolSvc.create('schema-design', ownerId);

    // Create invite for email
    const invitedEmail = 'invitee@example.com';
    const inviteeId = '00000000-0000-0000-0000-000000000002';

    // create a user row to represent invitee
    await db.insert(users).values({ id: inviteeId, email: invitedEmail });

    const { token } = await inviteSvc.createInvite(
      inst.id,
      ownerId,
      invitedEmail,
    );

    const pending = await inviteSvc.myReceivedInvitations(invitedEmail);
    expect(pending.length).toBeGreaterThan(0);

    const email = await userSvc.getEmailById(inviteeId);
    expect(email).toBe(invitedEmail);

    await inviteSvc.acceptInvite(token, inviteeId, invitedEmail);

    expect(await toolSvc.canAccess(inst.id, inviteeId)).toBe(true);
  });

  test('decline hides invite from pending', async () => {
    const { db } = await import('src/db/db.provider.js');
    const { users } = await import('src/db/drivers/drizzle/schema.js');

    const ownerId = randomUUID();
    const ownerEmail = 'owner2@example.com';
    await db.insert(users).values({ id: ownerId, email: ownerEmail });

    const inst = await toolSvc.create('schema-design', ownerId);

    const invitedEmail = 'decline@example.com';
    const { token } = await inviteSvc.createInvite(
      inst.id,
      ownerId,
      invitedEmail,
    );

    const pending1 = await inviteSvc.myReceivedInvitations(invitedEmail);
    const inv = pending1[0];
    expect(inv).toBeTruthy();

    await inviteSvc.declineInvite(inv.id, invitedEmail);

    const pending2 = await inviteSvc.myReceivedInvitations(invitedEmail);
    expect(pending2.find((x: { id: string }) => x.id === inv.id)).toBeFalsy();

    // token should no longer be usable
    await expect(
      inviteSvc.acceptInvite(token, 'userX', invitedEmail),
    ).rejects.toThrow();
  });
});
