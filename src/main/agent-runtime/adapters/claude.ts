import { spawn, ChildProcess } from 'child_process';
import { createInterface, ReadLineOptions } from 'readline';
import { AgentBackend, AbortContext, Session, AgentMessage, AgentResult, ExecOptions } from './backend';

interface StreamJsonMessage {
  type: 'system' | 'assistant' | 'user' | 'result';
  subtype?: string;
  message?: {
    role: string;
    content: Array<{
      type: string;
      text?: string;
      thinking?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
  session_id?: string;
  total_cost_usd?: number;
  usage?: { input_tokens: number; output_tokens: number };
  duration_ms?: number;
}

export class ClaudeBackend implements AgentBackend {
  readonly provider = 'claude';

  constructor(readonly executablePath: string) {}

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

  async listModels(): Promise<Array<{ id: string; name: string }>> {
    const models = [
      { id: 'sonnet', name: 'Claude Sonnet' },
      { id: 'opus', name: 'Claude Opus' },
      { id: 'haiku', name: 'Claude Haiku' },
    ];
    try {
      const proc = spawn(this.executablePath, ['--list-models'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
      await new Promise<void>((resolve) => proc.on('close', () => resolve()));
      if (output.trim()) {
        return output.trim().split('\n').map((line) => ({ id: line.trim(), name: line.trim() }));
      }
    } catch { /* ignore */ }
    return models;
  }

  execute(ctx: AbortContext, prompt: string, opts: ExecOptions): Session {
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--verbose',
      '--permission-mode', 'bypassPermissions',
      '--disallowedTools', 'AskUserQuestion',
    ];
    if (opts.model) args.push('--model', opts.model);
    if (opts.maxTurns) args.push('--max-turns', String(opts.maxTurns));
    if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt);
    if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId);
    if (opts.extraArgs) args.push(...opts.extraArgs);

    const proc = spawn(this.executablePath, args, {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: ctx.signal,
    });

    const input = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ role: 'assistant', type: 'text', text: prompt }] },
    }) + '\n';
    proc.stdin!.write(input);

    const rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity });
    const messages = this.parseStream(rl, proc);
    const result = this.waitForResult(proc);

    return { messages, result, abort: () => proc.kill('SIGTERM') };
  }

  private async *parseStream(rl: ReturnType<typeof createInterface>, proc: ChildProcess): AsyncIterable<AgentMessage> {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const msg: StreamJsonMessage = JSON.parse(line);
        switch (msg.type) {
          case 'assistant': {
            const content = msg.message?.content || [];
            for (const block of content) {
              if (block.type === 'thinking') {
                yield { role: 'assistant', type: 'thinking', content: block.thinking, timestamp: Date.now() };
              } else if (block.type === 'tool_use') {
                yield { role: 'assistant', type: 'tool_use', toolName: block.name, toolInput: block.input, timestamp: Date.now() };
              } else if (block.type === 'text') {
                yield { role: 'assistant', type: 'text', content: block.text, timestamp: Date.now() };
              }
            }
            break;
          }
          case 'user': {
            const userContent = msg.message?.content || [];
            for (const block of userContent) {
              if (block.type === 'tool_result') {
                yield { role: 'assistant', type: 'tool_result', toolName: block.name, toolOutput: block.text, timestamp: Date.now() };
              }
            }
            break;
          }
          case 'system':
            yield { role: 'assistant', type: 'status', status: 'running', sessionId: msg.session_id, timestamp: Date.now() };
            break;
          case 'result':
            return;
        }
      } catch {
        // skip malformed JSON lines
      }
    }
  }

  private async waitForResult(proc: ChildProcess): Promise<AgentResult> {
    return new Promise((resolve) => {
      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          error: code !== 0 ? (stderr || `exit code ${code}`) : undefined,
          duration: 0,
        });
      });
    });
  }
}
