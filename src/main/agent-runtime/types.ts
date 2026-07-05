import { AgentMessage, AgentResult, ExecOptions } from '../../shared/types';

export interface AbortContext {
  signal: AbortSignal;
}

export interface Session {
  readonly messages: AsyncIterable<AgentMessage>;
  readonly result: Promise<AgentResult>;
  abort(): void;
}

export { AgentMessage, AgentResult, ExecOptions };
