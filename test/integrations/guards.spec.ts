import { Test } from '@nestjs/testing';
import { startPostgres } from '../utils/postgres.js';
import { runMigrations } from '../utils/migrate.js';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { randomUUID } from 'crypto';
import { ToolInstanceResolver } from '../../src/api/contracts/graphql/resolvers/tool-instance.resolver';
import { ToolInstanceService } from '../../src/toolinstance/toolinstance.service';
import { AuthService } from '../../src/auth/auth.service';
import { UnauthenticatedError, PermissionDeniedError } from '../../src/common/errors/domain-errors';
import { ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

describe('Backend Guards Integration Tests', () => {
  let container: StartedPostgreSqlContainer;
  let resolver: ToolInstanceResolver;
  let toolInstanceService: ToolInstanceService;
  let authService: AuthService;
  let moduleRef: any;

  beforeAll(async () => {
    const pg = await startPostgres();
    container = pg.container;
    process.env.DATABASE_URL = pg.url;
    process.env.JWT_SECRET = 'test-secret-key-for-guards';

    runMigrations();

    const { createTestingModule } = await import('../utils/test-app.js');
    moduleRef = await createTestingModule();
    
    resolver = moduleRef.get(ToolInstanceResolver);
    toolInstanceService = moduleRef.get(ToolInstanceService);
    authService = moduleRef.get(AuthService);
  });

  afterAll(async () => {
    const { pool } = await import('../../src/db/db.provider.js');
    await pool.end();
    await container.stop();
  });

  describe('SignedInGuard', () => {
    test('should throw UnauthenticatedError if no user is signed in', async () => {
      // We test this by calling a resolver method decorated with @UseGuards(SignedInGuard)
      // Since we are calling the method directly in tests, the guard is NOT automatically executed by NestJS.
      // Integration tests usually go through the app.inject() or similar.
      // However, we want to verify the GUARD LOGIC itself.
      
      const { SignedInGuard } = await import('../../src/common/guards/signed-in.guard.js');
      const guard = new SignedInGuard();
      
      const mockCtx = {
        getArgByIndex: () => ({ userId: null }),
        getContext: () => ({ userId: null }),
      } as any;
      
      jest.spyOn(GqlExecutionContext, 'create').mockReturnValue(mockCtx as any);

      expect(() => guard.canActivate({} as ExecutionContext)).toThrow(UnauthenticatedError);
    });

    test('should return true if user is signed in', async () => {
      const { SignedInGuard } = await import('../../src/common/guards/signed-in.guard.js');
      const guard = new SignedInGuard();
      
      const mockCtx = {
        getContext: () => ({ userId: 'user-123' }),
      } as any;
      
      jest.spyOn(GqlExecutionContext, 'create').mockReturnValue(mockCtx as any);

      expect(guard.canActivate({} as ExecutionContext)).toBe(true);
    });
  });

  describe('ToolInstanceAccessGuard', () => {
    test('should throw PermissionDeniedError if user has no access', async () => {
      const { ToolInstanceAccessGuard } = await import('../../src/common/guards/tool-instance-access.guard.js');
      const guard = new ToolInstanceAccessGuard(toolInstanceService);
      
      const instanceId = randomUUID();
      const userId = 'user-123';
      
      jest.spyOn(toolInstanceService, 'canAccess').mockResolvedValue(false);
      
      const mockCtx = {
        getContext: () => ({ userId }),
        getArgs: () => ({ instanceId }),
      } as any;
      
      jest.spyOn(GqlExecutionContext, 'create').mockReturnValue(mockCtx as any);

      await expect(guard.canActivate({} as ExecutionContext)).rejects.toThrow(PermissionDeniedError);
    });

    test('should return true if user has access', async () => {
      const { ToolInstanceAccessGuard } = await import('../../src/common/guards/tool-instance-access.guard.js');
      const guard = new ToolInstanceAccessGuard(toolInstanceService);
      
      const instanceId = randomUUID();
      const userId = 'user-123';
      
      jest.spyOn(toolInstanceService, 'canAccess').mockResolvedValue(true);
      
      const mockCtx = {
        getContext: () => ({ userId }),
        getArgs: () => ({ instanceId }),
      } as any;
      
      jest.spyOn(GqlExecutionContext, 'create').mockReturnValue(mockCtx as any);

      await expect(guard.canActivate({} as ExecutionContext)).resolves.toBe(true);
    });
  });

  describe('UserOwnershipGuard', () => {
    test('should throw PermissionDeniedError if userId does not match', async () => {
      const { UserOwnershipGuard } = await import('../../src/common/guards/user-ownership.guard.js');
      const mockReflector = { get: () => 'userId' } as any;
      const guard = new UserOwnershipGuard(mockReflector);
      
      const userId = 'user-123';
      const argUserId = 'user-456';
      
      const mockCtx = {
        getContext: () => ({ userId }),
        getArgs: () => ({ userId: argUserId }),
      } as any;
      
      jest.spyOn(GqlExecutionContext, 'create').mockReturnValue(mockCtx as any);

      expect(() => guard.canActivate({ getHandler: () => {} } as any)).toThrow(PermissionDeniedError);
    });

    test('should return true if userId matches', async () => {
      const { UserOwnershipGuard } = await import('../../src/common/guards/user-ownership.guard.js');
      const mockReflector = { get: () => 'userId' } as any;
      const guard = new UserOwnershipGuard(mockReflector);
      
      const userId = 'user-123';
      
      const mockCtx = {
        getContext: () => ({ userId }),
        getArgs: () => ({ userId }),
      } as any;
      
      jest.spyOn(GqlExecutionContext, 'create').mockReturnValue(mockCtx as any);

      expect(guard.canActivate({ getHandler: () => {} } as any)).toBe(true);
    });
  });
});
