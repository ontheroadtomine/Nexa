# PigAgent Agent Loop 核心实现文档

> 本文档详细梳理 PigAgent 的 Agent Loop（智能体循环）核心实现逻辑，涵盖架构、数据流、工具系统、事件模型、多 Provider 适配以及完整的调用链路。

---

## 目录

1. [架构总览](#1-架构总览)
2. [核心循环：AgentLoop](#2-核心循环agentloop)
3. [工具系统：ToolRegistry](#3-工具系统toolregistry)
4. [工具实现清单](#4-工具实现清单)
5. [Provider 适配层](#5-provider-适配层)
6. [事件模型与流式通信](#6-事件模型与流式通信)
7. [完整调用链路](#7-完整调用链路)
8. [安全与边界控制](#8-安全与边界控制)
9. [流程图](#9-流程图)

---

## 1. 架构总览

PigAgent 的 Agent Loop 采用 **"宿主拥有循环"（Host-Owned Loop）** 架构，即应用程序（而非模型）控制整个推理-工具-观察的循环过程。这与 Codex CLI 的设计理念一致。

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PigAgent Agent Loop                          │
│                                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │  User     │───▶│  AgentLoop   │───▶│  LLM API (DeepSeek/     │  │
│  │  Prompt   │    │  (loop.ts)   │    │  OpenAI-compatible)     │  │
│  └──────────┘    └──────┬───────┘    └────────────┬─────────────┘  │
│                         │                          │                │
│                         │  工具调用                  │  tool_calls    │
│                         ▼                          │                │
│                  ┌──────────────┐                  │                │
│                  │ ToolRegistry  │◄─────────────────┘                │
│                  │ (注册/调度)   │                                   │
│                  └──────┬───────┘                                   │
│                         │                                           │
│          ┌──────────────┼──────────────┐                            │
│          ▼              ▼              ▼                            │
│   ┌──────────┐  ┌────────────┐  ┌──────────┐                       │
│   │ Workspace│  │ Shell/     │  │ Web/     │                       │
│   │ Tools    │  │ Patch      │  │ Weather  │                       │
│   └──────────┘  └────────────┘  └──────────┘                       │
│                                                                     │
│  结果 → 追加到消息历史 → 下一轮推理 → ... → 最终回答                │
└─────────────────────────────────────────────────────────────────────┘
```

### 两种运行模式

PigAgent 支持两种 Agent 执行路径：

| 模式 | 描述 | 适用场景 |
|------|------|----------|
| **LLM API 模式** | 通过 `AgentLoop` 调用 DeepSeek/OpenAI-compatible API，宿主控制循环 | 默认模式，Codex 风格 |
| **CLI Adapter 模式** | 通过 `AgentRuntime` 包装外部 CLI Agent（Claude Code, Codex CLI 等） | 使用第三方 Agent 工具 |

本文档重点覆盖 **LLM API 模式** 的 Agent Loop 实现。

---

## 2. 核心循环：AgentLoop

### 2.1 文件位置

`src/main/agent-core/loop.ts`

### 2.2 核心接口

```typescript
class AgentLoop {
  constructor(private readonly tools: ToolRegistry) {}

  async run(options: AgentLoopOptions): Promise<AgentLoopResult>
}
```

### 2.3 输入参数（AgentLoopOptions）

| 字段 | 类型 | 说明 |
|------|------|------|
| `config` | `LlmApiConfig` | LLM API 配置（baseUrl, model 等） |
| `apiKey` | `string` | API 密钥 |
| `prompt` | `string` | 用户输入的提示词 |
| `cwd` | `string` | 工作目录 |
| `signal?` | `AbortSignal` | 中止信号 |
| `maxTurns?` | `number` | 最大轮次（默认 20） |
| `onEvent?` | `(event: AgentLoopEvent) => void` | 事件回调（用于流式 UI 更新） |

### 2.4 输出结果（AgentLoopResult）

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | `string` | 最终回答文本 |
| `turns` | `number` | 实际消耗的轮次 |
| `toolCalls` | `Array<{name, args, ok}>` | 所有工具调用记录 |

### 2.5 循环逻辑（伪代码）

```
function run(options):
  1. 构建系统提示词（System Prompt）
  2. 初始化消息历史: [system, user]
  3. FOR turn = 0 TO maxTurns:
     a. 发送事件: { type: 'status', status: 'thinking' }
     b. 调用 LLM Chat Completions API，传入:
        - messages（完整历史）
        - tools（已注册工具的 schema）
        - tool_choice: 'auto'
     c. 解析响应中的 tool_calls
     d. IF 没有 tool_calls:
        - 返回最终回答（content）
     e. 将 assistant 消息（含 tool_calls）追加到历史
     f. FOR EACH tool_call:
        - 发送事件: { type: 'tool_start', name, args }
        - 执行工具: tools.execute(name, args)
        - 发送事件: { type: 'tool_result', name, ok, output }
        - 将 tool 结果追加到消息历史
     g. 继续下一轮循环
  4. 达到最大轮次 → 抛出错误
```

### 2.6 系统提示词

系统提示词在 `buildSystemPrompt()` 中构建，定义了 PigAgent 的行为准则：

- 身份：Codex 风格的桌面软件 Agent
- 行为模式：推理 → 调用工具 → 观察结果 → 继续，直到任务完成
- 工具使用偏好：先读后写，批量读取，聚焦命令
- 输出要求：简洁回答，失败时说明原因

### 2.7 LLM API 调用

`requestChatCompletion()` 函数封装了对 OpenAI-compatible Chat Completions API 的调用：

- 自动拼接 baseUrl（支持 `/v1/chat/completions` 或裸 URL）
- 支持 AbortSignal 中止
- 错误处理：解析 HTTP 错误和 API 错误消息
- 默认参数：`temperature: 0.2`, `stream: false`

---

## 3. 工具系统：ToolRegistry

### 3.1 文件位置

`src/main/agent-core/tool-registry.ts`

### 3.2 核心设计

```typescript
class ToolRegistry {
  private tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void;      // 注册工具
  schemas(): AgentToolSchema[];         // 获取所有工具的 OpenAI function-calling schema
  execute(name, args, context): Promise<AgentToolResult>;  // 执行工具
}
```

### 3.3 工具接口（AgentTool）

```typescript
interface AgentTool {
  name: string;                          // 工具名称
  schema: AgentToolSchema;               // OpenAI function-calling schema
  run(args, context): Promise<unknown>;  // 执行逻辑
}
```

### 3.4 工具 Schema 格式

遵循 OpenAI function calling 规范：

```typescript
interface AgentToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;  // JSON Schema
  };
}
```

### 3.5 执行上下文（AgentToolContext）

```typescript
interface AgentToolContext {
  cwd: string;  // 当前工作目录
}
```

### 3.6 执行结果（AgentToolResult）

```typescript
interface AgentToolResult {
  ok: boolean;
  result?: unknown;   // 成功时的返回值
  error?: string;     // 失败时的错误信息
}
```

### 3.7 注册流程

`createDefaultToolRegistry()` 在 `src/main/agent-core/default-tools.ts` 中创建默认工具集：

```typescript
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(weatherCurrentTool);   // 天气查询
  registry.register(listDirTool);          // 列出目录
  registry.register(workspaceFilesTool);   // 列出工作区文件
  registry.register(workspaceSearchTool);  // 搜索工作区文本
  registry.register(fileReadTool);         // 读取文件
  registry.register(fileReadManyTool);     // 批量读取文件
  registry.register(fileWriteTool);        // 写入文件
  registry.register(shellExecTool);        // 执行 shell 命令
  registry.register(webFetchTool);         // 获取网页内容
  registry.register(applyPatchTool);       // 应用补丁
  return registry;
}
```

---

## 4. 工具实现清单

### 4.1 工作区工具（`src/main/agent-core/tools/workspace.ts`）

| 工具名 | 功能 | 关键参数 |
|--------|------|----------|
| `workspace_list` | 列出目录内容 | `path`（相对路径，默认根目录） |
| `workspace_files` | 快速列出工作区文件（排除 node_modules/dist/.git） | `limit`（最多 1000，默认 300） |
| `workspace_search` | 使用 ripgrep 搜索文本 | `pattern`（必填），`path`，`limit` |
| `file_read` | 读取单个文件（大文件截断） | `path`（必填） |
| `file_read_many` | 批量读取文件（最多 20 个，总计 80KB） | `paths`（必填，数组） |
| `file_write` | 创建或覆盖文件 | `path`（必填），`content`（必填） |

**安全机制**：`resolveWorkspacePath()` 确保所有路径操作不会逃逸出工作区目录。

### 4.2 Shell 执行工具（`src/main/agent-core/tools/shell.ts`）

| 工具名 | 功能 | 关键参数 |
|--------|------|----------|
| `shell_exec` | 执行 shell 命令 | `command`（必填），`timeoutMs`（默认 60s，最大 180s） |

**安全机制**：
- 拒绝执行明显破坏性命令（`rm -rf /`, `mkfs`, `diskutil erase`, `shutdown`, `reboot`）
- 超时自动 SIGTERM → 2 秒后 SIGKILL
- 输出截断（stdout/stderr 各 30KB）

### 4.3 补丁工具（`src/main/agent-core/tools/patch.ts`）

| 工具名 | 功能 | 关键参数 |
|--------|------|----------|
| `apply_patch` | 应用 unified diff 补丁 | `patch`（必填） |

通过 `git apply --whitespace=nowarn` 实现，支持标准 unified diff 格式。

### 4.4 网络工具（`src/main/agent-core/tools/web.ts`）

| 工具名 | 功能 | 关键参数 |
|--------|------|----------|
| `web_fetch` | 获取 HTTP/HTTPS URL 内容 | `url`（必填） |

输出截断 50KB，仅支持 http/https 协议。

### 4.5 天气工具（`src/main/agent-core/tools/weather.ts`）

| 工具名 | 功能 | 关键参数 |
|--------|------|----------|
| `weather_current` | 查询实时天气 | `location`（必填，城市名） |

使用 Open-Meteo API（免费，无需 API Key）：
1. 地理编码：`geocoding-api.open-meteo.com`
2. 天气预报：`api.open-meteo.com/v1/forecast`

返回：位置信息、当前温度/体感温度/湿度/降水/风速、今日预报。

### 4.6 共享工具函数（`src/main/agent-core/tools/shared.ts`）

| 函数 | 功能 |
|------|------|
| `resolveWorkspacePath(cwd, inputPath)` | 解析并验证路径不逃逸工作区 |
| `pathExists(filePath)` | 检查文件是否存在 |
| `truncateText(text, maxChars)` | 截断文本并添加截断标记 |

---

## 5. Provider 适配层

### 5.1 LLM API Provider

通过 `src/main/llm-api.ts` 中的 `chatWithLlmApi()` 和 `streamChatWithLlmApi()` 暴露。

```typescript
// 非流式调用
async function chatWithLlmApi(config, prompt, cwd): Promise<LlmApiChatResult>

// 流式调用（带事件回调）
async function streamChatWithLlmApi(config, prompt, cwd, emit): Promise<void>
```

**API Key 解析逻辑**（`resolveApiKey()`）：
1. 优先使用配置中的 `apiKey`
2. 其次从 `envFilePath` 指定的 .env 文件中读取
3. 最后从环境变量中读取（`DEEPSEEK_API_KEY` 等）

### 5.2 CLI Agent Provider（旧架构）

通过 `src/main/agent-runtime/` 实现，支持：

| Provider | 协议 | Adapter 文件 |
|----------|------|-------------|
| Claude Code | stream-json | `adapters/claude.ts` |
| Codex CLI | exec | `adapters/codex.ts` |
| Hermes | ACP (JSON-RPC 2.0) | `adapters/acp.ts` |
| Kimi | ACP (JSON-RPC 2.0) | `adapters/acp.ts` |
| Kiro | ACP (JSON-RPC 2.0) | `adapters/acp.ts` |
| OpenCode | exec | `adapters/codex.ts` |

### 5.3 Dev Bridge（浏览器预览模式）

`src/main/dev-bridge.ts` 提供 HTTP 服务（端口 9876），支持：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/providers` | GET | 扫描可用 CLI Agent |
| `/execute` | POST | 执行 CLI Agent（SSE 流式返回） |
| `/llm-api/test` | POST | 测试 LLM API 连接 |
| `/llm-api/chat` | POST | 非流式 LLM API 调用 |
| `/llm-api/stream` | POST | 流式 LLM API 调用（SSE） |

---

## 6. 事件模型与流式通信

### 6.1 AgentLoop 事件类型

```typescript
type AgentLoopEvent =
  | { type: 'status'; status: 'thinking' | 'executing' | 'streaming'; message?: string }
  | { type: 'tool_start'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; ok: boolean; output: string };
```

### 6.2 LLM API 事件类型

```typescript
type LlmApiChatEvent =
  | { type: 'status'; status: ExecutionStatus; message?: string }
  | { type: 'tool_start'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; ok: boolean; output: string }
  | { type: 'final'; content: string; latencyMs: number }
  | { type: 'error'; error: string };
```

### 6.3 流式通信路径

```
AgentLoop (主进程)
    │
    ├─ onEvent 回调
    │     │
    │     ▼
    ├─ streamChatWithLlmApi()
    │     │
    │     ▼
    ├─ emit(event) → SSE / IPC
    │     │
    │     ▼
    └─ Renderer (app-store.ts)
          │
          ├─ updateAssistantFromLlmEvent()
          │     │
          │     ▼
          └─ Zustand store → React 组件渲染
```

### 6.4 消息历史格式

Agent Loop 内部使用 `ChatMessageWire` 格式：

```typescript
interface ChatMessageWire {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCallWire[];
}
```

这与 OpenAI Chat Completions API 的消息格式完全兼容。

---

## 7. 完整调用链路

### 7.1 用户发送消息 → 最终回答

```
用户输入 prompt
    │
    ▼
app-store.ts: sendMessage(prompt)
    │
    ├─ 创建 UserMessage + AssistantMessage（占位）
    ├─ 设置 loading = true, abortController
    │
    ▼
app-store.ts: runQueuedTask(prompt)
    │
    ├─ 判断 activeProvider 类型
    │
    ├─ [LLM API 模式] ──────────────────────────────────────
    │   │
    │   ├─ streamBridgeLlmApi() 或 window.pigagent.chatLlmApi()
    │   │   │
    │   │   ▼
    │   ├─ dev-bridge.ts: /llm-api/stream 或 /llm-api/chat
    │   │   │
    │   │   ▼
    │   ├─ llm-api.ts: streamChatWithLlmApi() 或 chatWithLlmApi()
    │   │   │
    │   │   ▼
    │   ├─ AgentLoop.run()
    │   │   │
    │   │   ├─ 构建 system prompt
    │   │   ├─ FOR turn = 0..maxTurns:
    │   │   │   ├─ requestChatCompletion() → LLM API
    │   │   │   ├─ 解析 tool_calls
    │   │   │   ├─ IF 无 tool_calls → 返回 content
    │   │   │   ├─ 追加 assistant 消息
    │   │   │   ├─ FOR EACH tool_call:
    │   │   │   │   ├─ tools.execute(name, args)
    │   │   │   │   └─ 追加 tool 结果
    │   │   │   └─ 继续循环
    │   │   │
    │   │   └─ 返回 AgentLoopResult
    │   │
    │   └─ 事件流回 Renderer → Zustand store → UI 更新
    │
    ├─ [CLI Agent 模式] ────────────────────────────────────
    │   │
    │   ├─ callBridge() → /execute (SSE)
    │   │   │
    │   │   ▼
    │   ├─ dev-bridge.ts: executeClaude / executeCodex / executeAcp
    │   │   │
    │   │   ▼
    │   ├─ spawn CLI Agent 进程
    │   ├─ 解析 stdout JSON 流
    │   └─ SSE 事件流回 Renderer
    │
    └─ startNextQueuedTask() → 处理队列中的下一个任务
```

### 7.2 Electron IPC 路径

```
Renderer (React)                    Main Process
    │                                     │
    ├─ window.pigagent.chatLlmApi() ──────┤
    │                                     ├─ ipc-handlers.ts
    │                                     │   IPC.LLM_API_CHAT
    │                                     ├─ llm-api.ts
    │                                     │   chatWithLlmApi()
    │                                     ├─ AgentLoop.run()
    │                                     └─ 返回结果
    │                                     │
    └─ 结果 ←─────────────────────────────┘
```

### 7.3 浏览器预览路径

```
Renderer (React)                    Dev Bridge (HTTP)
    │                                     │
    ├─ fetch(/llm-api/stream) ────────────┤
    │   POST {config, prompt, cwd}        ├─ streamChatWithLlmApi()
    │                                     ├─ AgentLoop.run()
    │   SSE events ←──────────────────────┤
    │   event: message                    │
    │   data: {type, ...}                 │
    └─ 解析 SSE → Zustand store           │
```

---

## 8. 安全与边界控制

### 8.1 路径逃逸防护

`resolveWorkspacePath()` 确保所有文件操作路径不会逃逸出工作区根目录：

```typescript
function resolveWorkspacePath(cwd: string, inputPath: string): string {
  const resolved = path.resolve(cwd, inputPath || '.');
  const root = path.resolve(cwd);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path escapes workspace: ${inputPath}`);
  }
  return resolved;
}
```

### 8.2 Shell 命令安全

- 拒绝执行明显破坏性命令（正则匹配）
- 超时保护（默认 60s，最大 180s）
- 输出截断（各 30KB）

### 8.3 文件大小限制

| 操作 | 限制 |
|------|------|
| 单文件读取 | 60KB 截断 |
| 批量读取 | 最多 20 个文件，总计 80KB |
| 文件写入 | 无硬限制 |
| Web 获取 | 50KB 截断 |
| Shell 输出 | 各 30KB 截断 |

### 8.4 循环保护

- 最大轮次：20（可配置）
- 总超时：600 秒（10 分钟）
- 支持 AbortSignal 手动中止

---

## 9. 流程图

### 9.1 Agent Loop 主循环

```mermaid
flowchart TD
    Start([用户输入 Prompt]) --> BuildMsg[构建消息历史<br/>system + user]
    BuildMsg --> LoopCheck{轮次 < maxTurns?}
    
    LoopCheck -->|是| CallLLM[调用 LLM Chat Completions API<br/>传入 messages + tools]
    CallLLM --> ParseResp[解析响应]
    ParseResp --> HasTools{有 tool_calls?}
    
    HasTools -->|否| ReturnFinal[返回最终回答 content]
    HasTools -->|是| AppendAssistant[追加 assistant 消息<br/>含 tool_calls 到历史]
    AppendAssistant --> LoopTools[遍历每个 tool_call]
    
    LoopTools --> ExecTool[执行工具<br/>tools.execute(name, args)]
    ExecTool --> AppendResult[追加 tool 结果到历史]
    AppendResult --> MoreTools{还有更多 tool_call?}
    MoreTools -->|是| LoopTools
    MoreTools -->|否| LoopCheck
    
    LoopCheck -->|否| ThrowError[抛出错误<br/>达到最大轮次]
    
    ReturnFinal --> Done([返回 AgentLoopResult])
    ThrowError --> Done
```

### 9.2 工具注册与执行

```mermaid
flowchart LR
    subgraph 注册阶段
        Create[createDefaultToolRegistry] --> Reg1[register weatherCurrentTool]
        Reg1 --> Reg2[register listDirTool]
        Reg2 --> Reg3[register workspaceFilesTool]
        Reg3 --> Reg4[register workspaceSearchTool]
        Reg4 --> Reg5[register fileReadTool]
        Reg5 --> Reg6[register fileReadManyTool]
        Reg6 --> Reg7[register fileWriteTool]
        Reg7 --> Reg8[register shellExecTool]
        Reg8 --> Reg9[register webFetchTool]
        Reg9 --> Reg10[register applyPatchTool]
        Reg10 --> Ready[ToolRegistry Ready]
    end
    
    subgraph 执行阶段
        AgentLoop -->|tools.schemas()| GetSchemas[获取所有工具 Schema<br/>→ 传给 LLM]
        AgentLoop -->|tools.execute()| Dispatch{查找工具}
        Dispatch -->|找到| Run[执行 tool.run]
        Dispatch -->|未找到| Error[返回错误]
        Run --> Result[返回 AgentToolResult]
    end
    
    Ready --> GetSchemas
    Ready --> Dispatch
```

### 9.3 完整调用链路

```mermaid
sequenceDiagram
    participant User as 用户
    participant UI as React UI (Zustand)
    participant Bridge as Dev Bridge (HTTP)
    participant Loop as AgentLoop
    participant LLM as LLM API (DeepSeek)
    participant Tools as ToolRegistry
    
    User->>UI: 输入 prompt
    UI->>UI: sendMessage() → 创建消息占位
    
    alt LLM API 模式
        UI->>Bridge: POST /llm-api/stream (SSE)
        Bridge->>Loop: streamChatWithLlmApi()
        Loop->>Loop: AgentLoop.run()
        
        Note over Loop,LLM: 第 1 轮
        Loop->>LLM: POST /v1/chat/completions<br/>messages + tools
        LLM-->>Loop: tool_calls [workspace_list, file_read]
        
        Loop->>Tools: execute(workspace_list)
        Tools-->>Loop: {ok, result}
        Loop->>Tools: execute(file_read)
        Tools-->>Loop: {ok, result}
        
        Loop->>Bridge: onEvent({type:'tool_start',...})
        Loop->>Bridge: onEvent({type:'tool_result',...})
        Bridge-->>UI: SSE event: data:{type:'tool_start',...}
        Bridge-->>UI: SSE event: data:{type:'tool_result',...}
        
        Note over Loop,LLM: 第 2 轮
        Loop->>LLM: POST /v1/chat/completions<br/>messages + tool results
        LLM-->>Loop: content (最终回答)
        
        Loop->>Bridge: onEvent({type:'final', content})
        Bridge-->>UI: SSE event: data:{type:'final', content}
        UI->>UI: updateAssistantFromLlmEvent()<br/>→ 更新消息列表
        
    else CLI Agent 模式
        UI->>Bridge: POST /execute (SSE)
        Bridge->>Bridge: spawn CLI Agent 进程
        Bridge-->>UI: SSE event: block_start / block_delta / block_full
        UI->>UI: 解析 BridgeEvent → 更新消息列表
    end
    
    UI->>UI: startNextQueuedTask()
    UI-->>User: 显示最终回答
```

### 9.4 消息历史流转

```mermaid
flowchart TD
    subgraph 消息历史 (messages[])
        M1[system: 系统提示词]
        M2[user: 用户输入]
        M3[assistant: tool_calls]
        M4[tool: workspace_list 结果]
        M5[tool: file_read 结果]
        M6[assistant: 更多 tool_calls]
        M7[tool: shell_exec 结果]
        M8[assistant: 最终回答]
    end
    
    M1 --> M2 --> M3 --> M4 --> M5 --> M6 --> M7 --> M8
    
    style M1 fill:#f0f0f0
    style M2 fill:#d4e6f1
    style M3 fill:#f9e79f
    style M4 fill:#d5f5e3
    style M5 fill:#d5f5e3
    style M6 fill:#f9e79f
    style M7 fill:#d5f5e3
    style M8 fill:#aed6f1
```

---

## 附录 A：关键文件索引

| 文件 | 职责 |
|------|------|
| `src/main/agent-core/loop.ts` | Agent Loop 主循环 |
| `src/main/agent-core/tool-registry.ts` | 工具注册与调度 |
| `src/main/agent-core/types.ts` | 核心类型定义 |
| `src/main/agent-core/default-tools.ts` | 默认工具集注册 |
| `src/main/agent-core/tools/workspace.ts` | 工作区文件工具 |
| `src/main/agent-core/tools/shell.ts` | Shell 执行工具 |
| `src/main/agent-core/tools/patch.ts` | 补丁应用工具 |
| `src/main/agent-core/tools/web.ts` | 网页获取工具 |
| `src/main/agent-core/tools/weather.ts` | 天气查询工具 |
| `src/main/agent-core/tools/shared.ts` | 共享工具函数 |
| `src/main/llm-api.ts` | LLM API 调用入口 |
| `src/main/dev-bridge.ts` | 浏览器预览 HTTP Bridge |
| `src/main/ipc-handlers.ts` | Electron IPC 处理器 |
| `src/main/index.ts` | Electron 主进程入口 |
| `src/main/agent-runtime/runtime.ts` | CLI Agent 运行时 |
| `src/main/agent-runtime/provider-registry.ts` | Provider 注册与发现 |
| `src/main/agent-runtime/execenv.ts` | 执行环境准备 |
| `src/renderer/stores/app-store.ts` | Zustand 状态管理（含 Agent 调用逻辑） |
| `src/shared/types.ts` | 共享类型定义 |
| `src/shared/ipc-channels.ts` | IPC 通道常量 |

## 附录 B：关键设计决策

### B.1 为什么宿主拥有循环？

Codex 风格的核心思想：**模型只是循环中的一个组件**。宿主（应用程序）控制：
- 何时调用模型
- 执行哪些工具
- 如何观察结果
- 何时终止循环

这使得工具执行、安全策略、上下文管理都在宿主侧可控，而不是交给模型自行决定。

### B.2 为什么用 ToolRegistry 而非直接调用？

- **解耦**：工具注册与执行分离，新增工具只需实现 `AgentTool` 接口
- **Schema 自动生成**：所有工具的 OpenAI function-calling schema 统一收集
- **错误隔离**：每个工具的执行错误被捕获并返回结构化结果，不会中断循环

### B.3 为什么支持两种模式？

- **LLM API 模式**：完全自主控制，适合深度集成（Codex 风格）
- **CLI Agent 模式**：复用现有 CLI Agent 能力，快速接入多种 Provider
