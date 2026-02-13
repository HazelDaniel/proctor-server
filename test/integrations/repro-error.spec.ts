import { startPostgres } from '../utils/postgres.js';
import { runMigrations } from '../utils/migrate.js';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { ToolInstanceService } from '../../src/toolinstance/toolinstance.service.js';
import { randomUUID } from 'crypto';

describe('ToolInstanceService Reproduction', () => {
  let container: StartedPostgreSqlContainer;
  let svc: ToolInstanceService;

  beforeAll(async () => {
    const pg = await startPostgres();
    container = pg.container;

    process.env.DATABASE_URL = pg.url;
    runMigrations();

    const { createTestingModule } = await import('../utils/test-app.js');
    const { ToolInstanceService: ServiceClass } = await import('../../src/toolinstance/toolinstance.service.js');

    const moduleRef = await createTestingModule();
    svc = moduleRef.get(ServiceClass);
  });

  afterAll(async () => {
    await container.stop();
  });

  test('canAccess with invalid UUID string "0" should return false', async () => {
    const userId = randomUUID();
    const result = await svc.canAccess('0', userId);
    expect(result).toBe(false);
  });

  test('listMembers with invalid UUID string "0" should throw Forbidden', async () => {
      const userId = randomUUID();
      await expect(svc.listMembers('0', userId)).rejects.toThrow('Forbidden');
  });
});
