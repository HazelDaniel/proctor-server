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

  test('should support session refresh when rememberMe is true', async () => {
    // 1. Request login
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await authResolver.requestLogin(testEmail);
    const logCall = consoleSpy.mock.calls.find(call => call[0].includes('Verification link for'));
    const token = new URL(logCall[0].split(': ')[1]).searchParams.get('token');
    consoleSpy.mockRestore();

    // 2. Verify login with rememberMe: true
    const mockCtx = { res: { cookie: jest.fn() } };
    const verifyRes = await authResolver.verifyLogin(testEmail, token!, true, mockCtx);
    
    // Check if refresh_token cookie was set
    const refreshTokenCall = mockCtx.res.cookie.mock.calls.find(call => call[0] === 'refresh_token');
    expect(refreshTokenCall).toBeDefined();
    const refreshToken = refreshTokenCall[1];

    // 3. Attempt to refresh token
    const refreshCtx = { 
      req: { cookies: { refresh_token: refreshToken } },
      res: { cookie: jest.fn() },
      userId: verifyRes.user.userId
    };
    const refreshRes = await authResolver.refreshToken(refreshCtx);
    expect(refreshRes.token).toBeDefined();
    expect(refreshRes.user.userId).toBe(verifyRes.user.userId);
  });

  test('should reject session refresh when rememberMe is false', async () => {
    // 1. Request login
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await authResolver.requestLogin(testEmail);
    const logCall = consoleSpy.mock.calls.find(call => call[0].includes('Verification link for'));
    const token = new URL(logCall[0].split(': ')[1]).searchParams.get('token');
    consoleSpy.mockRestore();

    // 2. Verify login with rememberMe: false (default)
    const mockCtx = { res: { cookie: jest.fn() } };
    const verifyRes = await authResolver.verifyLogin(testEmail, token!, false, mockCtx);
    
    const refreshTokenCall = mockCtx.res.cookie.mock.calls.find(call => call[0] === 'refresh_token');
    const refreshToken = refreshTokenCall[1];

    // 3. Attempt to refresh token should fail
    const refreshCtx = { 
      req: { cookies: { refresh_token: refreshToken } },
      res: { cookie: jest.fn() },
      userId: verifyRes.user.userId
    };
    await expect(authResolver.refreshToken(refreshCtx))
      .rejects.toThrow('Refresh disabled (remember me not selected)');
  });

  test('should reject invalid or expired tokens', async () => {
    await expect(authResolver.verifyLogin(testEmail, 'invalid-token'))
      .rejects.toThrow('Invalid or expired login token');
  });
});
