import React, { useState } from 'react';
import { useAppStore } from '../../stores/app-store';

export default function LeftSidebar() {
  const {
    workspaces, activeWorkspaceId, expandedWorkspaces, conversations, activeConversationId,
    addWorkspace, toggleWorkspace, createConversation, selectConversation, toggleSettings,
  } = useAppStore();

  const [addingWorkspace, setAddingWorkspace] = useState(false);

  const handleNewConversation = async () => {
    if (!activeWorkspaceId) return;
    await createConversation(activeWorkspaceId, 'New conversation');
  };

  const handleAddWorkspace = () => {
    setAddingWorkspace(true);
  };

  const finishAddWorkspace = async (name: string) => {
    setAddingWorkspace(false);
    if (name.trim()) {
      await addWorkspace(name.trim(), `/tmp/${name.trim()}`);
    }
  };

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

  return (
    <aside id="leftSidebar" className="w-60 border-r border-gray-200 bg-[#fcfcfd] flex flex-col shrink-0 overflow-hidden">
      {/* Top buttons */}
      <div className="p-3 space-y-2 border-b border-gray-200">
        <button onClick={handleNewConversation} className="w-full text-left px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700 transition text-xs font-medium">
          + New Conversation
        </button>
        <button className="w-full text-left px-3 py-1.5 rounded hover:bg-gray-100 transition">Search</button>
        <button className="w-full text-left px-3 py-1.5 rounded hover:bg-gray-100 transition">Automations</button>
        <button className="w-full text-left px-3 py-1.5 rounded hover:bg-gray-100 transition">Customize</button>
        <button onClick={toggleSettings} className="w-full text-left px-3 py-1.5 rounded hover:bg-gray-100 transition flex items-center justify-between">
          <span>Settings</span>
          <span className="text-[10px] text-gray-400">⚙</span>
        </button>
      </div>

      {/* Workspaces tree */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        <div className="px-2 py-1 text-xs text-gray-500 font-medium flex items-center justify-between">
          <span>Workspaces</span>
          <button onClick={handleAddWorkspace} className="w-4 h-4 flex items-center justify-center rounded hover:bg-gray-200 transition text-gray-500 hover:text-gray-700 leading-none">+</button>
        </div>

        {addingWorkspace && (
          <div className="mt-1 px-2 py-1.5 rounded bg-purple-50 border border-purple-300">
            <WorkspaceInput onFinish={finishAddWorkspace} />
          </div>
        )}

        <div className="mt-1">
          {workspaces.map(ws => {
            const isExpanded = expandedWorkspaces.has(ws.id);
            const isActive = ws.id === activeWorkspaceId;
            const wsConversations = ws.id === activeWorkspaceId ? conversations : [];

            return (
              <div key={ws.id} className="mt-0.5">
                <div
                  onClick={() => toggleWorkspace(ws.id)}
                  className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer ${isActive ? 'bg-purple-50 text-purple-600 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] text-gray-400">{isExpanded ? '▾' : '▸'}</span>
                    <span className="truncate text-xs">{ws.name}</span>
                  </div>
                  {wsConversations.length > 0 && (
                    <span className="text-[10px] text-gray-400 shrink-0">{wsConversations.length}</span>
                  )}
                </div>

                {isExpanded && isActive && (
                  <div className="ml-3.5 mt-0.5 space-y-0.5">
                    {wsConversations.map(conv => (
                      <div
                        key={conv.id}
                        onClick={() => selectConversation(conv)}
                        className={`px-2 py-1.5 rounded cursor-pointer text-xs flex items-center justify-between ${conv.id === activeConversationId ? 'bg-purple-50 text-purple-600 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        <span className="truncate">{conv.title}</span>
                        <span className="text-[10px] text-gray-400 shrink-0 ml-1">{timeAgo(conv.updatedAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* User */}
      <div className="p-3 border-t border-gray-200 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-purple-200 flex items-center justify-center text-[10px] text-purple-600 font-bold">L</div>
          <span>lapisy</span>
        </div>
      </div>
    </aside>
  );
}

function WorkspaceInput({ onFinish }: { onFinish: (name: string) => void }) {
  const [value, setValue] = useState('');

  return (
    <input
      type="text"
      className="w-full bg-transparent text-xs outline-none text-gray-700 placeholder-gray-400"
      placeholder="工作目录路径"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onFinish(value);
        else if (e.key === 'Escape') onFinish('');
      }}
      onBlur={() => onFinish(value)}
    />
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h`;
  return `${Math.round(diff / 86400000)}d`;
}
