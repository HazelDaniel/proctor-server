import { startPostgres } from '../utils/postgres.js';
import { runMigrations } from '../utils/migrate.js';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { loadYjsProtocols } from 'src/import-resolution/yjs.js';

describe('PersistenceService compaction (integration)', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    const pg = await startPostgres();
    container = pg.container;
    process.env.DATABASE_URL = pg.url;
    runMigrations();
  });

  afterAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { pool } = await import('src/db/db.provider.js');
    await pool.end();
    await container.stop();
  });

  test('createSnapshot prunes updates <= snapshot seq', async () => {
    const { ToolPersistenceService: PersistenceService } =
      await import('src/toolpersistence/toolpersistence.service.js');
    const { Doc } = (await loadYjsProtocols()).YJS;
    const { db } = await import('src/db/db.provider.js');
    const { documentUpdates, documents } =
      await import('src/db/drivers/drizzle/schema.js');

    const svc = new PersistenceService();
    const docId = '00000000-0000-0000-0000-000000000001';

    // Insert parent document to satisfy FK
    await db.insert(documents).values({
      id: docId,
      toolType: 'schema-design',
    });

    // build a doc and generate 3 updates
    const d = new Doc();
    const m = d.getMap('meta');
    m.set('a', 1);
    const u1 = (await loadYjsProtocols()).YJS.encodeStateAsUpdate(d);

    m.set('a', 2);
    const u2 = (await loadYjsProtocols()).YJS.encodeStateAsUpdate(d);

    m.set('a', 3);
    const u3 = (await loadYjsProtocols()).YJS.encodeStateAsUpdate(d);

    await svc.appendUpdate(docId, 1, u1);
    await svc.appendUpdate(docId, 2, u2);
    await svc.appendUpdate(docId, 3, u3);

    await svc.createSnapshot(docId, 3, d);

    const rows = await db.select().from(documentUpdates);

    // should prune all <= 3
    expect(rows.length).toBe(0);
  });
});
