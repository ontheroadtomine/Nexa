// IPC channel constants — shared between Main and Renderer
export const IPC = {
  AGENT_EXECUTE: 'agent:execute',
  AGENT_ABORT: 'agent:abort',
  AGENT_LIST: 'agent:list',
  AGENT_MODELS: 'agent:models',
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_WATCH: 'file:watch',
  SESSION_RESUME: 'session:resume',
  SESSION_HISTORY: 'session:history',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  LLM_API_TEST: 'llm-api:test',
  LLM_API_CHAT: 'llm-api:chat',
  WORKSPACE_ADD: 'workspace:add',
  WORKSPACE_LIST: 'workspace:list',
  CONVERSATION_CREATE: 'conversation:create',
  CONVERSATION_LIST: 'conversation:list',
} as const;

export const IPC_EVENTS = {
  AGENT_MESSAGE: 'agent:message',
  AGENT_RESULT: 'agent:result',
  FILE_CHANGED: 'file:changed',
} as const;
