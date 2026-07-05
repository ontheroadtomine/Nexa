import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { AgentTool } from '../types';
import { pathExists, resolveWorkspacePath, truncateText } from './shared';

const execFileAsync = promisify(execFile);
const DEFAULT_EXCLUDES = ['node_modules', 'dist', 'dist-electron', '.git', '.codegraph'];

function isExcluded(relativePath: string): boolean {
  const parts = relativePath.split(path.sep);
  return parts.some(part => DEFAULT_EXCLUDES.includes(part));
}

async function collectFiles(root: string, dir = root, out: string[] = []): Promise<string[]> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath);
    if (isExcluded(relativePath)) continue;
    if (entry.isDirectory()) {
      await collectFiles(root, fullPath, out);
    } else if (entry.isFile()) {
      out.push(relativePath);
    }
  }
  return out;
}

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

export const workspaceFilesTool: AgentTool = {
  name: 'workspace_files',
  schema: {
    type: 'function',
    function: {
      name: 'workspace_files',
      description: 'List workspace files quickly, excluding dependency/build folders. Use this before reading files for codebase analysis or documentation tasks.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of files to return. Defaults to 300.' },
        },
      },
    },
  },
  async run(args, context) {
    const limit = Math.max(1, Math.min(Number(args.limit || 300), 1000));
    try {
      const { stdout } = await execFileAsync('rg', ['--files', '-g', '!node_modules/**', '-g', '!dist/**', '-g', '!.git/**'], {
        cwd: context.cwd,
        maxBuffer: 1024 * 1024,
      });
      return stdout.split(/\r?\n/).filter(Boolean).slice(0, limit);
    } catch {
      const files = await collectFiles(context.cwd);
      return files.slice(0, limit);
    }
  },
};

export const workspaceSearchTool: AgentTool = {
  name: 'workspace_search',
  schema: {
    type: 'function',
    function: {
      name: 'workspace_search',
      description: 'Search text in workspace files using ripgrep. Prefer this over shell_exec for locating symbols, routes, stores, tools, or implementation details.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Text or regex pattern to search for.' },
          path: { type: 'string', description: 'Optional relative path to limit the search.' },
          limit: { type: 'number', description: 'Maximum number of matched lines. Defaults to 80.' },
        },
        required: ['pattern'],
      },
    },
  },
  async run(args, context) {
    const pattern = String(args.pattern || '');
    if (!pattern.trim()) throw new Error('pattern is required');
    const limit = Math.max(1, Math.min(Number(args.limit || 80), 300));
    const searchPath = String(args.path || '.');
    const resolvedPath = resolveWorkspacePath(context.cwd, searchPath);
    const relativeSearchPath = path.relative(context.cwd, resolvedPath) || '.';
    const { stdout } = await execFileAsync('rg', [
      '--line-number',
      '--color', 'never',
      '--glob', '!node_modules/**',
      '--glob', '!dist/**',
      '--glob', '!.git/**',
      pattern,
      relativeSearchPath,
    ], {
      cwd: context.cwd,
      maxBuffer: 1024 * 1024,
    }).catch((error: any) => {
      if (error?.code === 1) return { stdout: '' };
      throw error;
    });
    return stdout.split(/\r?\n/).filter(Boolean).slice(0, limit);
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

export const fileReadManyTool: AgentTool = {
  name: 'file_read_many',
  schema: {
    type: 'function',
    function: {
      name: 'file_read_many',
      description: 'Read multiple UTF-8 text files in one tool call. Use this for codebase analysis to reduce agent-loop turns.',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Relative file paths to read. Maximum 20 files.',
          },
        },
        required: ['paths'],
      },
    },
  },
  async run(args, context) {
    const paths = Array.isArray(args.paths) ? args.paths.slice(0, 20).map(String) : [];
    if (!paths.length) throw new Error('paths is required');

    let remainingChars = 80_000;
    const files = [];
    for (const inputPath of paths) {
      const filePath = resolveWorkspacePath(context.cwd, inputPath);
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const maxChars = Math.max(0, Math.min(20_000, remainingChars));
      const truncated = truncateText(content, maxChars);
      remainingChars -= Math.min(content.length, maxChars);
      files.push({ path: path.relative(context.cwd, filePath), content: truncated });
      if (remainingChars <= 0) break;
    }
    return { files };
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
