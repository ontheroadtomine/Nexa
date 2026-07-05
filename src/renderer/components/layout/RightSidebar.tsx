import React from 'react';
import { useAppStore } from '../../stores/app-store';

export default function RightSidebar() {
  const { contextFiles, removeContextFile } = useAppStore();

  return (
    <aside id="rightSidebar" className="w-56 border-l border-gray-200 bg-[#fcfcfd] flex flex-col shrink-0 overflow-hidden">
      <div className="p-3 border-b border-gray-200">
        <div className="text-xs font-medium text-gray-600">Context Files</div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
        {contextFiles.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-400">No files added</div>
        ) : (
          contextFiles.map(f => (
            <div key={f} className="px-3 py-2 rounded bg-purple-50 text-purple-600 cursor-pointer text-xs flex items-center justify-between">
              <span className="truncate">{f.split('/').pop()}</span>
              <button onClick={() => removeContextFile(f)} className="text-gray-400 hover:text-red-500 ml-1">×</button>
            </div>
          ))
        )}
      </div>

      <div className="p-3 border-t border-gray-200">
        <div className="text-xs font-medium text-gray-600 mb-2">Output</div>
        <div className="text-[10px] text-green-600 font-mono bg-gray-50 rounded p-2 max-h-24 overflow-y-auto scrollbar-thin">
          ✓ Ready
        </div>
        <button className="w-full text-left text-xs text-gray-500 hover:text-gray-700 mt-2">↗ Open Terminal</button>
      </div>
    </aside>
  );
}
