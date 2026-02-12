import { Test } from '@nestjs/testing';
import { ToolInstanceService } from '../../src/toolinstance/toolinstance.service';
import { ToolRegistry } from '../../src/tools/registry';
import { DocumentRegistry } from '../../src/document-registry/document-registry.service';
import { InvitesService } from '../../src/invites/invites.service';
import { UsersService } from '../../src/users/users.service';
import { ToolPersistenceService } from '../../src/toolpersistence/toolpersistence.service';
import { AuthService } from '../../src/auth/auth.service';
import { JwtModule } from '@nestjs/jwt';
import { ToolInstanceResolver } from '../../src/api/contracts/graphql/resolvers/tool-instance.resolver';
import { SchemaDesignTool } from '../../src/tools/implementations/schema-design/tool';

// If your services require Drizzle db via module/provider, import the module that provides it instead.
// Here we assume your db client is a singleton import and services just use it internally.

export async function createTestingModule() {
  const moduleRef = await Test.createTestingModule({
    imports: [
      JwtModule.register({
        secret: process.env.JWT_SECRET || 'test-secret-key-for-integration-tests',
        signOptions: { algorithm: 'HS256' },
      }),
    ],
    providers: [
      ToolRegistry,
      DocumentRegistry,
      ToolInstanceService,
      InvitesService,
      UsersService,
      ToolPersistenceService,
      AuthService,
      ToolInstanceResolver,
      SchemaDesignTool,
    ],
  }).compile();

  return moduleRef;
}
