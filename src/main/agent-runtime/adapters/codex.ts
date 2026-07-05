import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { AgentBackend, AbortContext, Session, AgentMessage, AgentResult, ExecOptions } from './backend';

export class CodexBackend implements AgentBackend {
  readonly provider = 'codex';

  constructor(readonly executablePath: string) {}

  async detectVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.executablePath, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
      proc.on('close', (code) => {
        code === 0 ? resolve(output.trim().split('\n')[0]) : reject(new Error(output.trim()));
      });
    });
  }

  async listModels(): Promise<Array<{ id: string; name: string }>> {
    return [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    ];
  }

  execute(ctx: AbortContext, prompt: string, opts: ExecOptions): Session {
    const args = ['exec', prompt];
    if (opts.model) args.push('--model', opts.model);
    if (opts.maxTurns) args.push('--max-turns', String(opts.maxTurns));

    const proc = spawn(this.executablePath, args, {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: ctx.signal,
    });

    const rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity });
    const messages = this.parseStream(rl);
    const result = this.waitForResult(proc);

    return { messages, result, abort: () => proc.kill('SIGTERM') };
  }

  private async *parseStream(rl: ReturnType<typeof createInterface>): AsyncIterable<AgentMessage> {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'text' || msg.delta) {
          yield { role: 'assistant', type: 'text', content: msg.delta || msg.content, timestamp: Date.now() };
        } else if (msg.tool_call) {
          yield {
            role: 'assistant', type: 'tool_use',
            toolName: msg.tool_call.function?.name || msg.tool_call.name,
            toolInput: msg.tool_call.function?.arguments || msg.tool_call.input,
            timestamp: Date.now(),
          };
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
