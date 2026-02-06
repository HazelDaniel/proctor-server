import { Module, OnModuleInit } from '@nestjs/common';
import { ToolRegistry } from './registry';
import { SchemaDesignTool } from './implementations/schema-design/tool';

@Module({
  providers: [ToolRegistry, SchemaDesignTool],
  exports: [ToolRegistry],
})
export class ToolModule implements OnModuleInit {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly dbSchemaTool: SchemaDesignTool,
  ) {}

  onModuleInit() {
    this.registry.register(this.dbSchemaTool.definition);
  }
}
