import { ToolRegistry } from './tool-registry';
import { applyPatchTool } from './tools/patch';
import { shellExecTool } from './tools/shell';
import { fileReadTool, fileWriteTool, listDirTool } from './tools/workspace';
import { weatherCurrentTool } from './tools/weather';
import { webFetchTool } from './tools/web';

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(weatherCurrentTool);
  registry.register(listDirTool);
  registry.register(fileReadTool);
  registry.register(fileWriteTool);
  registry.register(shellExecTool);
  registry.register(webFetchTool);
  registry.register(applyPatchTool);
  return registry;
}
