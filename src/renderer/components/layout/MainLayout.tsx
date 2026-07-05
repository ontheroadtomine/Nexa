import ChatPanel from '../chat/ChatPanel';

export default function MainLayout() {
  return (
    <div className="h-screen bg-[var(--background)] text-[var(--foreground)] text-sm overflow-hidden">
      <ChatPanel />
    </div>
  );
}
