import { Module } from '@nestjs/common';
import { ToolInstanceService } from './toolinstance.service';
import { ToolModule } from 'src/tools/tools.module';

@Module({
  imports: [ToolModule],
  providers: [ToolInstanceService],
  exports: [ToolInstanceService],
})
export class ToolinstanceModule {}
