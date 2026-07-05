import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import LeftSidebar from './LeftSidebar';
import ChatPanel from '../chat/ChatPanel';
import RightSidebar from './RightSidebar';
import TopHeader from './TopHeader';
export default function MainLayout() {
    return (_jsxs("div", { className: "h-screen flex flex-col bg-gray-50 text-gray-800 text-sm overflow-hidden", children: [_jsx(TopHeader, {}), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsx(LeftSidebar, {}), _jsx(ChatPanel, {}), _jsx(RightSidebar, {})] })] }));
}
