import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import MainLayout from './components/layout/MainLayout';
import SettingsModal from './components/settings/SettingsModal';
import { useAppStore } from './stores/app-store';
export default function App() {
    const { initialized, init, settingsOpen } = useAppStore();
    useEffect(() => {
        init();
    }, []);
    if (!initialized) {
        return (_jsx("div", { className: "h-screen flex items-center justify-center bg-gray-50", children: _jsx("div", { className: "text-gray-400", children: "Loading PigAgent..." }) }));
    }
    return (_jsxs(_Fragment, { children: [_jsx(MainLayout, {}), settingsOpen && _jsx(SettingsModal, {})] }));
}
