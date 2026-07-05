import { AbortContext, Session, AgentMessage, AgentResult, ExecOptions } from '../types';

export interface AgentBackend {
  readonly provider: string;
  readonly executablePath: string;

  execute(ctx: AbortContext, prompt: string, opts: ExecOptions): Session;
  detectVersion(): Promise<string>;
  listModels?(): Promise<Array<{ id: string; name: string }>>;
}

export { AbortContext, Session, AgentMessage, AgentResult, ExecOptions };
