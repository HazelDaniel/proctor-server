import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export async function startPostgres() {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:16-alpine',
  )
    .withDatabase('proctor_test')
    .withUsername('toughware')
    .withPassword(process.env.TEST_DATABASE_PASSWORD ?? 'password')
    .start();
  const url = container.getConnectionUri(); // e.g. postgres://user:pass@host:port/db

  return { container, url };
}
