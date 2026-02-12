import { Test } from '@nestjs/testing';
import { ToolInstanceService } from '../../src/toolinstance/toolinstance.service';
import { ToolRegistry } from '../../src/tools/registry';
import { DocumentRegistry } from '../../src/document-registry/document-registry.service';
import { InvitesService } from '../../src/invites/invites.service';
import { UsersService } from '../../src/users/users.service';
import { ToolPersistenceService } from '../../src/toolpersistence/toolpersistence.service';

// If your services require Drizzle db via module/provider, import the module that provides it instead.
// Here we assume your db client is a singleton import and services just use it internally.

export async function createTestingModule() {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ToolRegistry,
      DocumentRegistry,
      ToolInstanceService,
      InvitesService,
      UsersService,
      ToolPersistenceService,
    ],
  }).compile();

  return moduleRef;
}
