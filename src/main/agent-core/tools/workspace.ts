import * as fs from 'fs';
import * as path from 'path';
import { AgentTool } from '../types';
import { pathExists, resolveWorkspacePath, truncateText } from './shared';

export const listDirTool: AgentTool = {
  name: 'workspace_list',
  schema: {
    type: 'function',
    function: {
      name: 'workspace_list',
      description: 'List files and directories inside the current workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative directory path. Defaults to current workspace root.' },
        },
      },
    },
  },
  async run(args, context) {
    const dir = resolveWorkspacePath(context.cwd, String(args.path || '.'));
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    return entries.slice(0, 300).map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
    }));
  },
};

export const fileReadTool: AgentTool = {
  name: 'file_read',
  schema: {
    type: 'function',
    function: {
      name: 'file_read',
      description: 'Read a UTF-8 text file inside the current workspace. Large files are truncated.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path.' },
        },
        required: ['path'],
      },
    },
  },
  async run(args, context) {
    const filePath = resolveWorkspacePath(context.cwd, String(args.path || ''));
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { path: path.relative(context.cwd, filePath), content: truncateText(content) };
  },
};

export const fileWriteTool: AgentTool = {
  name: 'file_write',
  schema: {
    type: 'function',
    function: {
      name: 'file_write',
      description: 'Create or overwrite a UTF-8 text file inside the current workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path.' },
          content: { type: 'string', description: 'Full file content to write.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  async run(args, context) {
    const filePath = resolveWorkspacePath(context.cwd, String(args.path || ''));
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const existed = await pathExists(filePath);
    await fs.promises.writeFile(filePath, String(args.content ?? ''), 'utf-8');
    return { path: path.relative(context.cwd, filePath), action: existed ? 'overwritten' : 'created' };
  },
};
