import React, { useMemo, useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { AgentConfig, LlmApiConfig, LlmApiTestResult } from '../../../shared/types';

const defaultDeepSeekConfig: LlmApiConfig = {
  id: 'deepseek',
  name: 'DeepSeek',
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKeyEnvVar: 'DEEPSEEK_API_KEY',
  envFilePath: '~/OpenClaw/my-openclaw-ops/.env',
  enabled: true,
};

async function testLlmApiInBrowser(config: LlmApiConfig): Promise<LlmApiTestResult> {
  const response = await fetch('http://localhost:9876/llm-api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  return response.json();
}

export default function SettingsModal() {
  const { settings, toggleSettings, saveSettings } = useAppStore();
  const [agents, setAgents] = useState<AgentConfig[]>(settings.agents);
  const [llmApis, setLlmApis] = useState<LlmApiConfig[]>(settings.llmApis?.length ? settings.llmApis : [defaultDeepSeekConfig]);
  const [addingAgent, setAddingAgent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<LlmApiTestResult | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const deepseek = useMemo(() => llmApis.find(api => api.id === 'deepseek') || defaultDeepSeekConfig, [llmApis]);

  const updateLlmApi = (id: string, patch: Partial<LlmApiConfig>) => {
    setTestResult(null);
    setLlmApis(prev => {
      const list = prev.length ? prev : [defaultDeepSeekConfig];
      return list.map(api => api.id === id ? { ...api, ...patch } : api);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings({ ...settings, agents, llmApis });
      toggleSettings();
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (config: LlmApiConfig) => {
    setTestingId(config.id);
    setTestResult(null);
    try {
      if (typeof window.pigagent === 'undefined') {
        const result = await testLlmApiInBrowser(config);
        setTestResult(result);
        return;
      }
      const result = await window.pigagent.testLlmApi(config);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({
        ok: false,
        providerId: config.id,
        model: config.model,
        latencyMs: 0,
        error: String(error?.message || error),
      });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={toggleSettings}>
      <div className="bg-white rounded-xl shadow-2xl w-[640px] max-h-[82vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <span className="font-semibold text-gray-800">Settings</span>
          <button onClick={toggleSettings} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-6">
          {/* Agents */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">Agents</span>
              <button onClick={() => setAddingAgent(true)} className="text-xs text-purple-600 hover:text-purple-700 font-medium">+ Add Agent</button>
            </div>
            <div className="space-y-2">
              {agents.map(agent => (
                <div key={agent.id} className="flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${agent.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <div className="text-sm text-gray-800 font-medium">{agent.name}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{agent.command}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="text-xs text-gray-400 hover:text-gray-600 agent-edit-btn">✎</button>
                    <button
                      onClick={() => setAgents(prev => prev.filter(a => a.id !== agent.id))}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >×</button>
                  </div>
                </div>
              ))}
              {agents.length === 0 && (
                <div className="text-xs text-gray-400 py-4 text-center">
                  No agents configured. Add one to get started.
                </div>
              )}
            </div>
          </div>

          {/* LLM APIs */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">Large Model APIs</span>
              <span className="text-[11px] text-gray-400">OpenAI-compatible</span>
            </div>
            <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
                <div>
                  <div className="text-sm text-gray-800 font-medium">{deepseek.name}</div>
                  <div className="text-[10px] text-gray-400 font-mono">{deepseek.baseUrl}</div>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={deepseek.enabled}
                    onChange={e => updateLlmApi(deepseek.id, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
              </div>

              <div className="p-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Base URL</label>
                  <input
                    type="text"
                    value={deepseek.baseUrl}
                    onChange={e => updateLlmApi(deepseek.id, { baseUrl: e.target.value })}
                    className="w-full border border-gray-200 rounded-md px-2.5 py-2 text-xs outline-none focus:border-purple-500 font-mono"
                    placeholder="https://api.deepseek.com"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Model</label>
                  <input
                    type="text"
                    value={deepseek.model}
                    onChange={e => updateLlmApi(deepseek.id, { model: e.target.value })}
                    className="w-full border border-gray-200 rounded-md px-2.5 py-2 text-xs outline-none focus:border-purple-500 font-mono"
                    placeholder="deepseek-chat"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Env file</label>
                  <input
                    type="text"
                    value={deepseek.envFilePath || ''}
                    onChange={e => updateLlmApi(deepseek.id, { envFilePath: e.target.value })}
                    className="w-full border border-gray-200 rounded-md px-2.5 py-2 text-xs outline-none focus:border-purple-500 font-mono"
                    placeholder="~/OpenClaw/my-openclaw-ops/.env"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">API key env</label>
                  <input
                    type="text"
                    value={deepseek.apiKeyEnvVar || ''}
                    onChange={e => updateLlmApi(deepseek.id, { apiKeyEnvVar: e.target.value })}
                    className="w-full border border-gray-200 rounded-md px-2.5 py-2 text-xs outline-none focus:border-purple-500 font-mono"
                    placeholder="DEEPSEEK_API_KEY"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">API key override</label>
                  <input
                    type="password"
                    value={deepseek.apiKey || ''}
                    onChange={e => updateLlmApi(deepseek.id, { apiKey: e.target.value })}
                    className="w-full border border-gray-200 rounded-md px-2.5 py-2 text-xs outline-none focus:border-purple-500 font-mono"
                    placeholder="Leave blank to read from env file"
                  />
                </div>
              </div>

              <div className="px-3 py-2.5 border-t border-gray-100 flex items-center justify-between gap-3">
                <div className={`text-xs truncate ${testResult?.ok ? 'text-green-600' : testResult ? 'text-red-500' : 'text-gray-400'}`}>
                  {testResult
                    ? testResult.ok
                      ? `Connected in ${testResult.latencyMs}ms · ${testResult.message || 'OK'}`
                      : testResult.error
                    : 'Test uses /v1/chat/completions with a short health-check prompt.'}
                </div>
                <button
                  onClick={() => handleTest(deepseek)}
                  disabled={testingId === deepseek.id}
                  className="px-3 py-1.5 border border-gray-200 rounded-md text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 shrink-0"
                >
                  {testingId === deepseek.id ? 'Testing...' : 'Test API'}
                </button>
              </div>
            </div>
          </div>

          {/* General */}
          <div>
            <span className="text-sm font-medium text-gray-700">General</span>
            <div className="mt-3 space-y-2">
              <label className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg">
                <span className="text-sm text-gray-600">Theme</span>
                <select className="text-xs border border-gray-200 rounded px-2 py-1 outline-none">
                  <option>Light</option>
                  <option>Dark</option>
                </select>
              </label>
              <label className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg">
                <span className="text-sm text-gray-600">Auto-approve tools</span>
                <input type="checkbox" className="rounded" defaultChecked />
              </label>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
          <button onClick={toggleSettings} className="px-4 py-1.5 border border-gray-200 rounded-md text-xs text-gray-600 hover:bg-gray-50 mr-2">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-xs font-medium disabled:opacity-60">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Add Agent modal */}
      {addingAgent && <AddAgentModal onClose={() => setAddingAgent(false)} onAdd={(agent) => { setAgents(prev => [...prev, agent]); setAddingAgent(false); }} />}
    </div>
  );
}

function AddAgentModal({ onClose, onAdd }: { onClose: () => void; onAdd: (agent: AgentConfig) => void }) {
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [protocol, setProtocol] = useState<'stream-json' | 'acp'>('stream-json');

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd({
      id: Date.now().toString(36),
      name: name.trim(),
      command: command.trim(),
      protocol,
      enabled: true,
      createdAt: Date.now(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[420px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <span className="font-semibold text-gray-800">Add Agent</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500" placeholder="e.g. Claude Code" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Command</label>
            <input type="text" value={command} onChange={e => setCommand(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500 font-mono" placeholder="e.g. claude --output-format stream-json" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Protocol</label>
            <select value={protocol} onChange={e => setProtocol(e.target.value as 'stream-json' | 'acp')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none">
              <option value="stream-json">stream-json</option>
              <option value="acp">ACP (JSON-RPC 2.0)</option>
            </select>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 border border-gray-200 rounded-md text-xs text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleAdd} className="px-4 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-xs font-medium">Add</button>
        </div>
      </div>
    </div>
  );
}
