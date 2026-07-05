import { AgentBackend } from './adapters/backend';
import { ClaudeBackend } from './adapters/claude';
import { CodexBackend } from './adapters/codex';
import { AcpBackend } from './adapters/acp';
import { ProviderInfo } from '../../shared/types';

const KNOWN_PROVIDERS: Array<{
  name: string;
  exe: string;
  CreateBackend: (path: string) => AgentBackend;
}> = [
  { name: 'claude', exe: 'claude', CreateBackend: (p) => new ClaudeBackend(p) },
  { name: 'codex', exe: 'codex', CreateBackend: (p) => new CodexBackend(p) },
  { name: 'hermes', exe: 'hermes', CreateBackend: (p) => new AcpBackend(p, 'hermes') },
  { name: 'kimi', exe: 'kimi', CreateBackend: (p) => new AcpBackend(p, 'kimi') },
  { name: 'kiro', exe: 'kiro', CreateBackend: (p) => new AcpBackend(p, 'kiro') },
  { name: 'opencode', exe: 'opencode', CreateBackend: (p) => new CodexBackend(p) },
];

async function which(exe: string): Promise<string> {
  const { spawn } = require('child_process');
  return new Promise((resolve, reject) => {
    const proc = spawn('which', [exe], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.on('close', (code: number | null) => {
      code === 0 ? resolve(stdout.trim()) : reject(new Error(`${exe} not found`));
    });
  });
}

export class ProviderRegistry {
  private backends = new Map<string, AgentBackend>();
  private infos: ProviderInfo[] = [];

  async scan(): Promise<ProviderInfo[]> {
    const results: ProviderInfo[] = [];
    for (const cfg of KNOWN_PROVIDERS) {
      try {
        const resolved = await which(cfg.exe);
        const backend = cfg.CreateBackend(resolved);
        let version = 'unknown';
        try {
          version = await backend.detectVersion();
        } catch { /* ignore */ }
        this.backends.set(cfg.name, backend);
        const info: ProviderInfo = { name: cfg.name, executablePath: resolved, version, available: true };
        if (backend.listModels) {
          info.models = await backend.listModels();
        }
        results.push(info);
      } catch {
        results.push({ name: cfg.name, executablePath: '', version: '', available: false });
      }
    }
    this.infos = results;
    return results;
  }

  get(name: string): AgentBackend | undefined {
    return this.backends.get(name);
  }

  list(): ProviderInfo[] {
    return this.infos;
  }

  getAvailable(): ProviderInfo[] {
    return this.infos.filter((i) => i.available);
  }
}

export const providerRegistry = new ProviderRegistry();
