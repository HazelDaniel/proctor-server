import { Injectable } from '@nestjs/common';
import { ToolDefinition, ToolType } from './types';

@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<ToolType, ToolDefinition>();

  register(tool: ToolDefinition) {
    if (this.tools.has(tool.type)) {
      throw new Error(`Tool already registered: ${tool.type}`);
    }
    this.tools.set(tool.type, tool);
  }

  get(toolType: ToolType): ToolDefinition {
    const tool = this.tools.get(toolType);
    if (!tool) {
      throw new Error(`Unknown tool type: ${toolType}`);
    }
    return tool;
  }

  has(toolType: ToolType): boolean {
    return this.tools.has(toolType);
  }
}
