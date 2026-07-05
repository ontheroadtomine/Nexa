import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
export default function LeftSidebar() {
    const { workspaces, activeWorkspaceId, expandedWorkspaces, conversations, activeConversationId, addWorkspace, toggleWorkspace, createConversation, selectConversation, toggleSettings, } = useAppStore();
    const [addingWorkspace, setAddingWorkspace] = useState(false);
    const handleNewConversation = async () => {
        if (!activeWorkspaceId)
            return;
        await createConversation(activeWorkspaceId, 'New conversation');
    };
    const handleAddWorkspace = () => {
        setAddingWorkspace(true);
    };
    const finishAddWorkspace = async (name) => {
        setAddingWorkspace(false);
        if (name.trim()) {
            await addWorkspace(name.trim(), `/tmp/${name.trim()}`);
        }
    };
    const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
    return (_jsxs("aside", { id: "leftSidebar", className: "w-60 border-r border-gray-200 bg-[#fcfcfd] flex flex-col shrink-0 overflow-hidden", children: [_jsxs("div", { className: "p-3 space-y-2 border-b border-gray-200", children: [_jsx("button", { onClick: handleNewConversation, className: "w-full text-left px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700 transition text-xs font-medium", children: "+ New Conversation" }), _jsx("button", { className: "w-full text-left px-3 py-1.5 rounded hover:bg-gray-100 transition", children: "Search" }), _jsx("button", { className: "w-full text-left px-3 py-1.5 rounded hover:bg-gray-100 transition", children: "Automations" }), _jsx("button", { className: "w-full text-left px-3 py-1.5 rounded hover:bg-gray-100 transition", children: "Customize" }), _jsxs("button", { onClick: toggleSettings, className: "w-full text-left px-3 py-1.5 rounded hover:bg-gray-100 transition flex items-center justify-between", children: [_jsx("span", { children: "Settings" }), _jsx("span", { className: "text-[10px] text-gray-400", children: "\u2699" })] })] }), _jsxs("div", { className: "flex-1 overflow-y-auto scrollbar-thin p-2", children: [_jsxs("div", { className: "px-2 py-1 text-xs text-gray-500 font-medium flex items-center justify-between", children: [_jsx("span", { children: "Workspaces" }), _jsx("button", { onClick: handleAddWorkspace, className: "w-4 h-4 flex items-center justify-center rounded hover:bg-gray-200 transition text-gray-500 hover:text-gray-700 leading-none", children: "+" })] }), addingWorkspace && (_jsx("div", { className: "mt-1 px-2 py-1.5 rounded bg-purple-50 border border-purple-300", children: _jsx(WorkspaceInput, { onFinish: finishAddWorkspace }) })), _jsx("div", { className: "mt-1", children: workspaces.map(ws => {
                            const isExpanded = expandedWorkspaces.has(ws.id);
                            const isActive = ws.id === activeWorkspaceId;
                            const wsConversations = ws.id === activeWorkspaceId ? conversations : [];
                            return (_jsxs("div", { className: "mt-0.5", children: [_jsxs("div", { onClick: () => toggleWorkspace(ws.id), className: `flex items-center justify-between px-2 py-1.5 rounded cursor-pointer ${isActive ? 'bg-purple-50 text-purple-600 font-medium' : 'text-gray-600 hover:bg-gray-100'}`, children: [_jsxs("div", { className: "flex items-center gap-1.5 min-w-0", children: [_jsx("span", { className: "text-[10px] text-gray-400", children: isExpanded ? '▾' : '▸' }), _jsx("span", { className: "truncate text-xs", children: ws.name })] }), wsConversations.length > 0 && (_jsx("span", { className: "text-[10px] text-gray-400 shrink-0", children: wsConversations.length }))] }), isExpanded && isActive && (_jsx("div", { className: "ml-3.5 mt-0.5 space-y-0.5", children: wsConversations.map(conv => (_jsxs("div", { onClick: () => selectConversation(conv), className: `px-2 py-1.5 rounded cursor-pointer text-xs flex items-center justify-between ${conv.id === activeConversationId ? 'bg-purple-50 text-purple-600 font-medium' : 'text-gray-600 hover:bg-gray-100'}`, children: [_jsx("span", { className: "truncate", children: conv.title }), _jsx("span", { className: "text-[10px] text-gray-400 shrink-0 ml-1", children: timeAgo(conv.updatedAt) })] }, conv.id))) }))] }, ws.id));
                        }) })] }), _jsx("div", { className: "p-3 border-t border-gray-200 text-xs text-gray-500", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-5 h-5 rounded-full bg-purple-200 flex items-center justify-center text-[10px] text-purple-600 font-bold", children: "L" }), _jsx("span", { children: "lapisy" })] }) })] }));
}
function WorkspaceInput({ onFinish }) {
    const [value, setValue] = useState('');
    return (_jsx("input", { type: "text", className: "w-full bg-transparent text-xs outline-none text-gray-700 placeholder-gray-400", placeholder: "\u5DE5\u4F5C\u76EE\u5F55\u8DEF\u5F84", autoFocus: true, value: value, onChange: (e) => setValue(e.target.value), onKeyDown: (e) => {
            if (e.key === 'Enter')
                onFinish(value);
            else if (e.key === 'Escape')
                onFinish('');
        }, onBlur: () => onFinish(value) }));
}
function timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 3600000)
        return `${Math.round(diff / 60000)}m`;
    if (diff < 86400000)
        return `${Math.round(diff / 3600000)}h`;
    return `${Math.round(diff / 86400000)}d`;
}
