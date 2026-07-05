import { spawn } from 'child_process';
import { AgentTool } from '../types';
import { truncateText } from './shared';

const DEFAULT_TIMEOUT_MS = 60_000;

function isDenied(command: string): boolean {
  return /\b(rm\s+-rf\s+\/|mkfs|diskutil\s+erase|shutdown|reboot)\b/.test(command);
}

export const shellExecTool: AgentTool = {
  name: 'shell_exec',
  schema: {
    type: 'function',
    function: {
      name: 'shell_exec',
      description: 'Run a shell command in the current workspace and return stdout, stderr, and exit code. Use for inspection, tests, builds, and safe local automation.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run.' },
          timeoutMs: { type: 'number', description: 'Optional timeout in milliseconds. Defaults to 60000.' },
        },
        required: ['command'],
      },
    },
  },
  async run(args, context) {
    const command = String(args.command || '').trim();
    if (!command) throw new Error('command is required');
    if (isDenied(command)) throw new Error('Refusing obviously destructive command.');
    const timeoutMs = Math.max(1_000, Math.min(Number(args.timeoutMs || DEFAULT_TIMEOUT_MS), 180_000));

    return new Promise((resolve) => {
      const proc = spawn(command, {
        cwd: context.cwd,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        setTimeout(() => proc.kill('SIGKILL'), 2_000);
      }, timeoutMs);

      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          command,
          exitCode: code,
          timedOut,
          stdout: truncateText(stdout, 30_000),
          stderr: truncateText(stderr, 30_000),
        });
      });
    });
  },
};
