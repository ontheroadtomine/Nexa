import { AbortContext, Session, AgentMessage, ExecOptions } from './types';
import { providerRegistry } from './provider-registry';

export class AgentRuntime {
  private activeSessions = new Map<string, { session: Session; controller: AbortController }>();

  async execute(provider: string, prompt: string, opts: ExecOptions): Promise<{ sessionId: string; messages: AsyncIterable<AgentMessage>; result: Promise<AgentMessage> }> {
    const backend = providerRegistry.get(provider);
    if (!backend) throw new Error(`Provider not found: ${provider}`);

    // Ensure provider is scanned
    const available = providerRegistry.getAvailable();
    if (!available.find((p) => p.name === provider)) {
      throw new Error(`Provider ${provider} is not available. Run scan first.`);
    }

    const controller = new AbortController();
    const ctx: AbortContext = { signal: controller.signal };
    const session = backend.execute(ctx, prompt, opts);
    const sessionId = `${provider}-${Date.now()}`;
    this.activeSessions.set(sessionId, { session, controller });

    const result = (async (): Promise<AgentMessage> => {
      try {
        const r = await session.result;
        this.activeSessions.delete(sessionId);
        return { role: 'assistant', type: 'status', status: r.success ? 'completed' : 'failed', timestamp: Date.now() };
      } catch (e) {
        this.activeSessions.delete(sessionId);
        throw e;
      }
    })();

    return { sessionId, messages: session.messages, result };
  }

  abort(sessionId: string): boolean {
    const entry = this.activeSessions.get(sessionId);
    if (!entry) return false;
    entry.session.abort();
    this.activeSessions.delete(sessionId);
    return true;
  }

  getActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys());
  }
}

export const agentRuntime = new AgentRuntime();
