import { startPostgres } from '../utils/postgres.js';
import { runMigrations } from '../utils/migrate.js';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { randomUUID } from 'crypto';

describe('Authentication Flow: Magic Link', () => {
  let container: StartedPostgreSqlContainer;
  let authResolver: any;
  let testEmail: string;

  beforeAll(async () => {
    const pg = await startPostgres();
    container = pg.container;

    process.env.DATABASE_URL = pg.url;
    
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-secret-key-for-integration-tests';
    }

    runMigrations();

    const { createTestingModule } = await import('../utils/test-app.js');
    const { AuthResolver } = await import(
      '../../src/api/contracts/graphql/resolvers/auth.resolver.js'
    );

    const moduleRef = await createTestingModule();
    authResolver = moduleRef.get(AuthResolver);
    
    testEmail = `test-${randomUUID()}@example.com`;
  });

  afterAll(async () => {
    const { pool } = await import('../../src/db/db.provider.js');
    await pool.end();
    await container.stop();
  });

  test('should complete the magic link login flow', async () => {
    // 1. Request login
    // We capture the console.log to get the token since we don't send emails
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const requestRes = await authResolver.requestLogin(testEmail);
    expect(requestRes).toBe(true);
    
    expect(consoleSpy).toHaveBeenCalled();
    const logCall = consoleSpy.mock.calls.find(call => call[0].includes('Login token for'));
    expect(logCall).toBeDefined();
    
    const token = logCall[0].split(': ')[1];
    expect(token).toBeDefined();
    
    consoleSpy.mockRestore();

    // 2. Verify login
    const verifyRes = await authResolver.verifyLogin(testEmail, token);
    expect(verifyRes.token).toBeDefined();
    expect(verifyRes.user.email).toBe(testEmail);
    expect(verifyRes.user.id).toBeDefined();

    // 3. Request login again (new token)
    const consoleSpy2 = jest.spyOn(console, 'log').mockImplementation();
    await authResolver.requestLogin(testEmail);
    const logCall2 = consoleSpy2.mock.calls.find(call => call[0].includes('Login token for'));
    const token2 = logCall2[0].split(': ')[1];
    consoleSpy2.mockRestore();

    // 4. Verify again
    const verifyRes2 = await authResolver.verifyLogin(testEmail, token2);
    expect(verifyRes2.token).toBeDefined();
    expect(verifyRes2.user.id).toBe(verifyRes.user.id); // Same user ID
  });

  test('should reject invalid or expired tokens', async () => {
    await expect(authResolver.verifyLogin(testEmail, 'invalid-token'))
      .rejects.toThrow('Invalid or expired login token');
  });
});
