import { LlmApiConfig } from '../../shared/types';
import { ToolRegistry } from './tool-registry';
import { AgentLoopOptions, AgentLoopResult, ChatMessageWire, ToolCallWire } from './types';

const DEFAULT_MAX_TURNS = 20;

async function requestChatCompletion(config: LlmApiConfig, apiKey: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const url = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : baseUrl.endsWith('/v1')
      ? `${baseUrl}/chat/completions`
      : `${baseUrl}/v1/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: config.model, ...body }),
  });
  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const detail = data?.error?.message || data?.message || text || response.statusText;
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return data;
}

function buildSystemPrompt(): string {
  return [
    'You are PigAgent, a Codex-style desktop software agent.',
    'Operate in an agent loop: reason about the task, call tools when needed, observe results, and continue until the user request is actually complete.',
    'Use tools for current information, workspace inspection, codebase analysis, file edits, command execution, tests, builds, and patch application.',
    'For codebase documentation or architecture analysis, first use workspace_files or workspace_search, then file_read_many for the key files. Avoid reading files one by one when multiple files are needed.',
    'Prefer reading the workspace before editing. Prefer focused shell commands and tests after edits.',
    'When you use a tool, summarize the result only when useful. Do not expose secrets.',
    'For weather/current conditions, use weather_current. For public URLs, use web_fetch. For local code work, use workspace_files, workspace_search, file_read_many, workspace_list, file_read, file_write, apply_patch, and shell_exec.',
    'Finish with a concise answer in the user language. If a tool failed, explain the actionable failure.',
  ].join('\n');
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { rawArguments: raw };
  }
}

export class AgentLoop {
  constructor(private readonly tools: ToolRegistry) {}

  async run(options: AgentLoopOptions): Promise<AgentLoopResult> {
    const maxTurns = options.maxTurns || DEFAULT_MAX_TURNS;
    const messages: ChatMessageWire[] = [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: options.prompt },
    ];
    const toolCallsLog: AgentLoopResult['toolCalls'] = [];

    for (let turn = 0; turn < maxTurns; turn += 1) {
      options.onEvent?.({
        type: 'status',
        status: turn === 0 ? 'thinking' : 'streaming',
        message: turn === 0 ? '分析任务' : '结合工具结果继续推理',
      });
      const data = await requestChatCompletion(options.config, options.apiKey, {
        messages,
        tools: this.tools.schemas(),
        tool_choice: 'auto',
        temperature: 0.2,
        stream: false,
      }, options.signal);

      const message = data?.choices?.[0]?.message;
      const toolCalls: ToolCallWire[] = message?.tool_calls || [];

      if (toolCalls.length === 0) {
        const content = message?.content?.trim() || '';
        return { content, turns: turn + 1, toolCalls: toolCallsLog };
      }

      messages.push({
        role: 'assistant',
        content: message?.content ?? null,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const args = parseArgs(call.function.arguments);
        options.onEvent?.({ type: 'tool_start', name: call.function.name, args });
        options.onEvent?.({ type: 'status', status: 'executing', message: `执行 ${call.function.name}` });
        const result = await this.tools.execute(call.function.name, args, { cwd: options.cwd });
        toolCallsLog.push({ name: call.function.name, args, ok: result.ok });
        options.onEvent?.({
          type: 'tool_result',
          name: call.function.name,
          ok: result.ok,
          output: JSON.stringify(result),
        });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    throw new Error(`Agent loop reached max turns (${maxTurns}).`);
  }
}

export { requestChatCompletion };
