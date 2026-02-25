import { Module } from '@nestjs/common';
import { ToolInstanceService } from './toolinstance.service';
import { ToolModule } from 'src/tools/tools.module';
import { PersistenceModule } from 'src/persistence/persistence.module';
import { NotificationModule } from 'src/notifications/notification.module';

@Module({
  imports: [ToolModule, PersistenceModule, NotificationModule],
  providers: [ToolInstanceService],
  exports: [ToolInstanceService],
})
export class ToolinstanceModule {}
