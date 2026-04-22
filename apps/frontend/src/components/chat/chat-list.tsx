'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Loader2,
  LayoutList,
  FolderClosed,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
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
  tag?: string | null;
}

type ViewMode = 'flat' | 'grouped';

const VIEW_MODE_KEY = 'placet:chat-list-view';

// NOTE: We intentionally do NOT read localStorage during initial useState to
// avoid React hydration mismatches (#418) — the server always renders with
// the 'flat' default, and we hydrate the persisted value from localStorage
// in a post-mount effect below.

/** Tag group header with collapsible child items. */
function CollapsibleGroup({
  tag,
  items,
  activeAgentId,
}: {
  tag: string;
  items: AgentListItem[];
  activeAgentId?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer"
      >
        <span className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary text-xs font-semibold uppercase leading-none">
          {tag.charAt(0)}
        </span>
        <span className="flex-1 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-none">
          {tag}
        </span>
        {open ? (
          <ChevronDown size={14} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
        )}
      </button>
      {open &&
        items.map((agent) => (
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
            tag={agent.tag}
            hideTag
            isActive={agent.id === activeAgentId}
          />
        ))}
    </div>
  );
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
  const [viewMode, setViewMode] = useState<ViewMode>('flat');

  // Hydrate persisted view mode from localStorage after mount (avoids
  // SSR/CSR hydration mismatches — see note above VIEW_MODE_KEY).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY);
      if (stored === 'grouped' || stored === 'flat') {
        setViewMode(stored);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => {
      const next = prev === 'flat' ? 'grouped' : 'flat';
      try {
        localStorage.setItem(VIEW_MODE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const filtered = agents.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  // Group by tag: untagged first, then alphabetical by tag name
  const grouped = filtered.reduce<Map<string, AgentListItem[]>>((acc, agent) => {
    const key = agent.tag ?? '';
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key)!.push(agent);
    return acc;
  }, new Map());
  const groupKeys = Array.from(grouped.keys()).sort((a, b) => {
    if (a === '') return -1;
    if (b === '') return 1;
    return a.localeCompare(b);
  });

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
        'flex h-full w-full lg:w-[320px] xl:w-[380px] shrink-0 flex-col bg-card lg:rounded-r-2xl lg:rounded-l-none lg:border-l-0 overflow-hidden shadow-xs border border-border/50 border-b-0 border-t-0 lg:border-t lg:border-b',
        className,
      )}
    >
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MobileNavDrawer />
            <h1 className="text-xl font-semibold text-foreground">Agents</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={toggleViewMode}
              title={viewMode === 'flat' ? 'Switch to grouped view' : 'Switch to flat view'}
            >
              {viewMode === 'flat' ? <FolderClosed size={18} /> : <LayoutList size={18} />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => setShowCreate((v) => !v)}
            >
              <Plus size={18} />
            </Button>
          </div>
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
        <div className="p-2 space-y-2">
          {viewMode === 'grouped'
            ? /* Grouped view — collapsible sections per tag */
              groupKeys.map((tag) => {
                const items = grouped.get(tag)!;
                return tag ? (
                  <CollapsibleGroup
                    key={tag}
                    tag={tag}
                    items={items}
                    activeAgentId={activeAgentId}
                  />
                ) : (
                  <div key="untagged" className="space-y-0.5">
                    {items.map((agent) => (
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
                        tag={agent.tag}
                        isActive={agent.id === activeAgentId}
                      />
                    ))}
                  </div>
                );
              })
            : /* Flat view — simple list, tag shown as badge on each item */
              filtered.map((agent) => (
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
                  tag={agent.tag}
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
