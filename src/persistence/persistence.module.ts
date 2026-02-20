import { Module } from '@nestjs/common';
import { ToolPersistenceService } from 'src/toolpersistence/toolpersistence.service';
import { DocumentRegistry } from 'src/document-registry/document-registry.service';
import { ToolModule } from 'src/tools/tools.module';
import { DbModule } from 'src/db/db.module';

@Module({
  imports: [ToolModule, DbModule],
  providers: [ToolPersistenceService, DocumentRegistry],
  exports: [ToolPersistenceService, DocumentRegistry],
})
export class PersistenceModule {}
