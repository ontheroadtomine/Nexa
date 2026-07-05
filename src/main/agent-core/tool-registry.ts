import { AgentTool, AgentToolContext, AgentToolResult, AgentToolSchema } from './types';

export class ToolRegistry {
  private tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  schemas(): AgentToolSchema[] {
    return Array.from(this.tools.values()).map(tool => tool.schema);
  }

  async execute(name: string, args: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { ok: false, error: `Unknown tool: ${name}` };
    }

    try {
      const result = await tool.run(args, context);
      return { ok: true, result };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  }
}
