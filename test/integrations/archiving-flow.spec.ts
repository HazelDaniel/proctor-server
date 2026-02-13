import { startPostgres } from '../utils/postgres.js';
import { runMigrations } from '../utils/migrate.js';
import type { ToolInstanceService } from '../../src/toolinstance/toolinstance.service.js';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

describe('Archiving Flow (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let toolSvc: ToolInstanceService;

  beforeAll(async () => {
    const pg = await startPostgres();
    container = pg.container;

    process.env.DATABASE_URL = pg.url;
    runMigrations();

    const { createTestingModule } = await import('../utils/test-app.js');
    const { ToolInstanceService: ToolInstanceServiceClass } = await import('../../src/toolinstance/toolinstance.service.js');

    const moduleRef = await createTestingModule();
    toolSvc = moduleRef.get(ToolInstanceServiceClass);
  });

  afterAll(async () => {
    const { pool } = await import('src/db/db.provider.js');
    await pool.end();
    await container.stop();
  });

  test('archive and fetch archived instances', async () => {
    const userId = '00000000-0000-0000-0000-000000000001';
    const inst = await toolSvc.create('schema-design', userId);

    // 1. Initially NOT archived
    const active = await toolSvc.listForUser(userId);
    expect(active.some(x => x.id === inst.id)).toBe(true);
    
    const archived0 = await toolSvc.listArchivedForUser(userId);
    expect(archived0.some(x => x.id === inst.id)).toBe(false);

    // 2. Archive it
    await toolSvc.archive(inst.id, userId);

    // 3. Should move to archived list
    const activeAfter = await toolSvc.listForUser(userId);
    expect(activeAfter.some(x => x.id === inst.id)).toBe(false);

    const archivedAfter = await toolSvc.listArchivedForUser(userId);
    expect(archivedAfter.some(x => x.id === inst.id)).toBe(true);
    expect(archivedAfter[0].archivedAt).toBeTruthy();

    // 4. Unarchive it
    await toolSvc.unarchive(inst.id, userId);

    // 5. Should move back to active
    const activeFinal = await toolSvc.listForUser(userId);
    expect(activeFinal.some(x => x.id === inst.id)).toBe(true);

    const archivedFinal = await toolSvc.listArchivedForUser(userId);
    expect(archivedFinal.some(x => x.id === inst.id)).toBe(false);
  });
});
