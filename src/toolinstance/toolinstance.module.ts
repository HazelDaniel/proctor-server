import { Module } from '@nestjs/common';
import { ToolInstanceService } from './toolinstance.service';
import { ToolModule } from 'src/tools/tools.module';
import { PersistenceModule } from 'src/persistence/persistence.module';

@Module({
  imports: [ToolModule, PersistenceModule],
  providers: [ToolInstanceService],
  exports: [ToolInstanceService],
})
export class ToolinstanceModule {}
