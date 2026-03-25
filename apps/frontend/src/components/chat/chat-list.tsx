'use client';

import { memo, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatListItem } from './chat-list-item';
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer';
import { useAgentsContext } from '@/lib/contexts/agents-context';
import { cn } from '@/lib/utils';

export interface AgentListItem {
  id: string;
  name: string;
  avatarUrl?: string | null;
  description?: string | null;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}

interface ChatListProps {
  agents: AgentListItem[];
  activeAgentId?: string;
  className?: string;
}

export const ChatList = memo(function ChatList({
  agents,
  activeAgentId,
  className,
}: ChatListProps) {
  const router = useRouter();
  const { createAgent } = useAgentsContext();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = agents.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  const handleCreate = useCallback(async () => {
    if (creating || !newName.trim()) return;
    try {
      setCreating(true);
      const agent = await createAgent(newName.trim());
      setNewName('');
      setShowCreate(false);
      router.push(`/chats/${agent.id}`);
    } catch {
      // Error handling via toast or inline — for now silently fail
    } finally {
      setCreating(false);
    }
  }, [creating, newName, createAgent, router]);

  return (
    <div
      className={cn(
        'flex h-full w-full lg:w-[320px] xl:w-[380px] shrink-0 flex-col bg-card rounded-3xl overflow-hidden shadow-sm border border-border/50',
        className,
      )}
    >
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MobileNavDrawer />
            <h1 className="text-xl font-semibold text-foreground">Agents</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => setShowCreate((v) => !v)}
          >
            <Plus size={18} />
          </Button>
        </div>

        {showCreate && (
          <div className="flex items-center gap-2 mb-3">
            <Input
              placeholder="Chat name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="rounded-lg text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
                if (e.key === 'Escape') setShowCreate(false);
              }}
            />
            <Button
              size="sm"
              className="shrink-0 rounded-lg"
              onClick={() => void handleCreate()}
              disabled={creating || !newName.trim()}
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
            </Button>
          </div>
        )}

        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            type="text"
            placeholder="Search chats..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted border-transparent rounded-lg"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-0.5">
          {filtered.map((agent) => (
            <ChatListItem
              key={agent.id}
              agentId={agent.id}
              name={agent.name}
              avatarUrl={
                agent.avatarUrl
                  ? `/api/agents/${agent.id}/avatar?v=${encodeURIComponent(agent.avatarUrl)}`
                  : null
              }
              description={agent.description}
              lastMessage={agent.lastMessage}
              lastMessageTime={agent.lastMessageTime}
              unreadCount={agent.unreadCount}
              isActive={agent.id === activeAgentId}
            />
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {search ? 'No chats found' : 'No chats yet. Click + to create one.'}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});
