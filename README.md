# PigAgent

跨平台 AI 编程助手 —— 通过 CLI 工具的编程接口包装底层 Agent，提供类 Cursor/Claude Code 的图形化编程体验。

## 架构概览

```
┌─ Electron Shell ────────────────────────────────────────┐
│  Renderer (React + TypeScript)    Main (Node.js)         │
│  ┌─────────────────────┐    ┌──────────────────────────┐ │
│  │ UI: Chat / Context / │◄──►│ Agent Runtime            │ │
│  │      Monaco Editor   │IPC │ ├─ claude (stream-json)  │ │
│  └─────────────────────┘    │ ├─ codex (exec)          │ │
│                              │ ├─ hermes/kimi (ACP)     │ │
│                              │ └─ ...                   │ │
│                              └──────────┬───────────────┘ │
└─────────────────────────────────────────┼─────────────────┘
                                          │ spawn + stdin/stdout JSON
                                          ▼
                              ┌───────────────────────┐
                              │  CLI Agent 进程        │
                              │  claude / codex / ...  │
                              └───────────────────────┘
```

**核心原则：不需要 PTY。** 所有现代 CLI Agent 工具都提供非交互式编程接口，通过 `child_process.spawn` + `readline` 逐行解析 JSON 即可。

## 快速开始

### 环境要求

- Node.js >= 22
- 至少安装一个 CLI Agent 工具（如 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)）

### 安装与运行

```bash
git clone <repo-url> && cd PigAgent
npm install

# 方式一：启动脚本一键启动（推荐开发时使用）
bash scripts/dev.sh

# 方式二：分别启动 bridge + Vite
npm run dev:bridge    # 终端 1：Bridge 服务器 :9876
npm run dev:renderer  # 终端 2：Vite 开发服务器 :5173

# 方式三：完整 Electron 启动
npm start
```

启动后浏览器打开 `http://localhost:5173`。

### 纯 Electron 运行

```bash
npm run build    # 编译主进程 + 渲染进程
npm start        # 启动 Electron
```

## 项目结构

```
PigAgent/
├── src/
│   ├── main/                       # Electron 主进程
│   │   ├── agent-runtime/          # Agent 运行时核心
│   │   │   ├── adapters/           # CLI Agent 适配器
│   │   │   │   ├── backend.ts      # Backend 接口定义
│   │   │   │   ├── claude.ts       # Claude Code (stream-json)
│   │   │   │   ├── codex.ts        # OpenAI Codex CLI
│   │   │   │   └── acp.ts          # ACP 协议 (Hermes/Kimi/Kiro)
│   │   │   ├── runtime.ts          # AgentRuntime 主类
│   │   │   ├── provider-registry.ts # Provider 注册与发现
│   │   │   └── execenv.ts          # 执行环境准备
│   │   ├── index.ts                # 主进程入口
│   │   ├── ipc-handlers.ts         # IPC handler 注册
│   │   ├── preload.ts              # contextBridge API
│   │   ├── session-manager.ts      # 会话持久化 (JSON)
│   │   └── dev-bridge.ts           # 开发模式 HTTP/SSE 桥接
│   ├── renderer/                   # React 前端
│   │   ├── components/
│   │   │   ├── chat/               # 对话面板 + 消息气泡
│   │   │   ├── layout/             # 三栏布局 + 侧边栏
│   │   │   └── settings/           # 设置弹窗 (Agent 管理)
│   │   ├── stores/app-store.ts     # Zustand 全局状态
│   │   └── main.tsx                # React 入口
│   └── shared/                     # Main ↔ Renderer 共享
│       ├── types.ts                # 类型定义
│       └── ipc-channels.ts         # IPC 通道常量
├── config/                         # 构建配置文件
│   ├── tsconfig.main.json
│   ├── tsconfig.renderer.json
│   ├── vite.renderer.config.ts
│   ├── tailwind.config.js
│   └── postcss.config.js
├── scripts/                        # 启动 / 构建 / 打包脚本
│   ├── dev.sh                      # 一键启动开发环境
│   ├── build.sh                    # 编译构建
│   └── pack.sh                     # electron-builder 打包
├── docs/                           # 文档与设计稿
│   ├── ARCHITECTURE.md             # 详细架构设计
│   ├── ui-mockup-v4.html          # UI 设计稿
│   └── 未命名.html                  # 参考设计稿
├── assets/                         # 静态资源
└── dist/                           # 构建产物
```

## 支持的 Agent

| CLI 工具 | 协议 | Adapter | 状态 |
|----------|------|---------|------|
| Claude Code | stream-json | `claude.ts` | 已验证 |
| Codex CLI | exec | `codex.ts` | 已实现(exit 137) |
| Hermes | ACP | `acp.ts` | 已实现 |
| Kimi CLI | ACP | `acp.ts` | 已实现 |
| Kiro | ACP | `acp.ts` | 已实现 |
| OpenCode | exec | `codex.ts` | 已实现 |

Provider 自动发现：启动时扫描 `PATH` 中的已知 CLI 工具，检查版本，仅在可用时激活。

## 开发模式架构

浏览器开发模式下的数据流：

```
Browser (:5173)                    Node.js (:9876)              System
──────────────                     ────────────────             ──────
ChatPanel.sendMessage()
  → fetch POST /execute
    (SSE stream)  ──────────►  dev-bridge.ts
                                  → spawn('claude', [...])
                                    stdin: stream-json input
                                    stdout: readline parse  ──►  claude CLI
                                  ← SSE events              ◄──  (stdout)
  ← event: message (text)     ◄──
  ← event: message (thinking) ◄──
  ← event: done               ◄──
  → Zustand store → React UI
```

## 数据持久化

对话数据存储在 `~/.pigagent/database.json`，结构：

```json
{
  "workspaces": [{ "id": "..", "name": "..", "path": ".." }],
  "conversations": [{ "id": "..", "workspaceId": "..", "title": ".." }],
  "settings": { "theme": "light", "autoApprove": true, "agents": [] }
}
```

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Electron 33 |
| 前端 | React 18 + TypeScript 5 + Tailwind CSS 3 |
| 状态管理 | Zustand 4 |
| 构建 | Vite 5 + tsc |
| 编辑器 | Monaco Editor (预留) |
| 文件监听 | chokidar (预留) |

## 打包

```bash
bash scripts/pack.sh
# 输出: dist/PigAgent-1.0.0.dmg (macOS) / dist/PigAgent-1.0.0.AppImage (Linux)
```

## License

MIT
