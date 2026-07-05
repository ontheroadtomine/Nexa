import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { AgentBackend, AbortContext, Session, AgentMessage, AgentResult, ExecOptions } from './backend';

/**
 * ACP protocol adapter (JSON-RPC 2.0 over stdin/stdout).
 * Shared base for Hermes, Kimi, Kiro, and any other ACP-compatible CLI.
 */
export class AcpBackend implements AgentBackend {
  readonly provider: string;
  private nextId = 1;

  constructor(
    readonly executablePath: string,
    provider: string,
  ) {
    this.provider = provider;
  }

  async detectVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.executablePath, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { output += d.toString(); });
      proc.on('close', (code) => {
        code === 0 ? resolve(output.trim().split('\n')[0]) : reject(new Error(output.trim()));
      });
    });
  }

  execute(ctx: AbortContext, prompt: string, opts: ExecOptions): Session {
    const proc = spawn(this.executablePath, ['acp'], {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: ctx.signal,
    });

    // Initialize session
    this.sendRpc(proc, 'session/new', {
      cwd: opts.cwd,
    });

    // Send prompt
    this.sendRpc(proc, 'session/prompt', { prompt });

    const rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity });
    const messages = this.parseStream(rl);
    const result = this.waitForResult(proc);

    return { messages, result, abort: () => proc.kill('SIGTERM') };
  }

  private sendRpc(proc: ChildProcess, method: string, params: object) {
    const msg = { jsonrpc: '2.0', id: this.nextId++, method, params };
    proc.stdin!.write(JSON.stringify(msg) + '\n');
  }

  private async *parseStream(rl: ReturnType<typeof createInterface>): AsyncIterable<AgentMessage> {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        // JSON-RPC notification or response
        if (msg.method === 'session/update' && msg.params) {
          const { delta } = msg.params;
          if (delta?.type === 'text') {
            yield { role: 'assistant', type: 'text', content: delta.text, timestamp: Date.now() };
          } else if (delta?.type === 'thinking') {
            yield { role: 'assistant', type: 'thinking', content: delta.thinking, timestamp: Date.now() };
          } else if (delta?.type === 'tool_call') {
            yield { role: 'assistant', type: 'tool_use', toolName: delta.tool_name, toolInput: delta.input, timestamp: Date.now() };
          }
        } else if (msg.method === 'session/complete') {
          return;
        }
      } catch { /* skip */ }
    }
  }

  private async waitForResult(proc: ChildProcess): Promise<AgentResult> {
    return new Promise((resolve) => {
      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        resolve({ success: code === 0, error: code !== 0 ? stderr : undefined, duration: 0 });
      });
    });
  }
}
