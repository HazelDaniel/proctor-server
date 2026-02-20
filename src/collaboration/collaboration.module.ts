/**
 * This module implements the collaboration features using Yjs and WebSockets:
    connect to: ws://HOST:PORT/collab?docId=...&toolType=schema-design&token=USER_ID
    sync state
    broadcast updates
    awareness messages
    persist updates
    periodic snapshots
    eviction when idle
 */
import { Module } from '@nestjs/common';
import { DocumentRegistry } from 'src/document-registry/document-registry.service';
import { ToolPersistenceService } from 'src/toolpersistence/toolpersistence.service';
import { YjsSocketIoGateway } from './yjs-socketio-gateway';
import { ToolModule } from 'src/tools/tools.module';
import { ToolinstanceModule } from 'src/toolinstance/toolinstance.module';
import { UsersModule } from 'src/users/users.module';
import { PersistenceModule } from 'src/persistence/persistence.module';

@Module({
  imports: [ToolModule, ToolinstanceModule, UsersModule, PersistenceModule],
  providers: [YjsSocketIoGateway],
  exports: [PersistenceModule, ToolModule, ToolinstanceModule],
})
export class CollaborationModule {}
