import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
export default function TopHeader() {
    const { toggleSettings } = useAppStore();
    const [leftOpen, setLeftOpen] = useState(true);
    const [rightOpen, setRightOpen] = useState(true);
    return (_jsxs("header", { className: "h-9 border-b border-gray-200 flex items-center px-3 text-xs bg-white shrink-0 select-none", children: [_jsxs("div", { className: "flex items-center gap-4 text-gray-600", children: [_jsxs("span", { className: "font-semibold text-gray-800", children: [_jsx("span", { className: "text-purple-600", children: "Pig" }), "Agent"] }), _jsx("span", { children: "File" }), _jsx("span", { children: "Edit" }), _jsx("span", { children: "View" }), _jsx("span", { children: "Help" })] }), _jsx("div", { className: "flex-1 flex justify-center", children: _jsx("span", { className: "text-gray-500", children: "PigAgent" }) }), _jsxs("div", { className: "flex items-center gap-3 text-gray-500", children: [_jsx("button", { onClick: () => { document.getElementById('leftSidebar')?.classList.toggle('hidden'); setLeftOpen(!leftOpen); }, className: "hover:text-gray-800 transition", children: "\u2630" }), _jsx("button", { onClick: () => { document.getElementById('rightSidebar')?.classList.toggle('hidden'); setRightOpen(!rightOpen); }, className: "hover:text-gray-800 transition", children: "\u25D0" }), _jsx("div", { className: "w-2 h-2 rounded-full bg-green-500" })] })] }));
}
