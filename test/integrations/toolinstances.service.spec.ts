import { startPostgres } from '../utils/postgres.js';
import { runMigrations } from '../utils/migrate.js';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { ToolInstanceService } from '../../src/toolinstance/toolinstance.service.js';

describe('ToolInstanceService (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let svc: ToolInstanceService;

  beforeAll(async () => {
    const pg = await startPostgres();
    container = pg.container;

    process.env.DATABASE_URL = pg.url;
    runMigrations();

    // specific import via require or dynamic import to ensure DB provider reads the new env var
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { createTestingModule } = await import('../utils/test-app.js');
     // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { ToolInstanceService: ServiceClass } = await import('../../src/toolinstance/toolinstance.service.js');

    const moduleRef = await createTestingModule();
    svc = moduleRef.get(ServiceClass);
  });

  afterAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { pool } = await import('src/db/db.provider.js');
    await pool.end();
    await container.stop();
  });

  test('create -> listForUser hides archived by default', async () => {
    const owner = 'user-1';
    const inst = await svc.create('schema-design', owner);

    const list1 = await svc.listForUser(owner, undefined, false);
    expect(list1.some((x: { id: string }) => x.id === inst.id)).toBe(true);

    await svc.archive(inst.id, owner);

    const list2 = await svc.listForUser(owner, undefined, false);
    expect(list2.some((x: { id: string }) => x.id === inst.id)).toBe(false);

    const list3 = await svc.listForUser(owner, undefined, true);
    expect(list3.some((x: { id: string }) => x.id === inst.id)).toBe(true);
  });

  test('owner-only archive/unarchive/delete', async () => {
    const owner = 'user-owner';
    const other = 'user-other';
    const inst = await svc.create('schema-design', owner);

    await expect(svc.archive(inst.id, other)).rejects.toThrow('Forbidden');
    await expect(svc.unarchive(inst.id, other)).rejects.toThrow('Forbidden');
    await expect(svc.delete(inst.id, other)).rejects.toThrow('Forbidden');
  });

  test('members: add/remove/leave/transfer ownership', async () => {
    const owner = 'user-owner2';
    const member = 'user-member2';
    const inst = await svc.create('schema-design', owner);

    // add member
    await svc.addMember(inst.id, member);
    expect(await svc.canAccess(inst.id, member)).toBe(true);

    // member can leave
    await svc.leave(inst.id, member);
    expect(await svc.canAccess(inst.id, member)).toBe(false);

    // transfer ownership requires owner
    await svc.addMember(inst.id, member);
    const updated = await svc.transferOwnership(inst.id, owner, member);
    expect(updated.ownerUserId).toBe(member);

    // previous owner should still be able to access if they were member (depends on your transfer logic)
  });
});
