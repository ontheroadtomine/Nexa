import { spawn } from 'child_process';
import { AgentTool } from '../types';
import { truncateText } from './shared';

export const applyPatchTool: AgentTool = {
  name: 'apply_patch',
  schema: {
    type: 'function',
    function: {
      name: 'apply_patch',
      description: 'Apply a unified diff patch to files in the current workspace using git apply.',
      parameters: {
        type: 'object',
        properties: {
          patch: { type: 'string', description: 'Unified diff patch text.' },
        },
        required: ['patch'],
      },
    },
  },
  async run(args, context) {
    const patch = String(args.patch || '');
    if (!patch.trim()) throw new Error('patch is required');

    return new Promise((resolve, reject) => {
      const proc = spawn('git', ['apply', '--whitespace=nowarn', '-'], {
        cwd: context.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ applied: true, stdout: truncateText(stdout), stderr: truncateText(stderr) });
        } else {
          reject(new Error(truncateText(stderr || `git apply exited ${code}`)));
        }
      });
      proc.stdin.end(patch);
    });
  },
};
