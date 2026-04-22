'use client';

import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Settings, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AgentAvatar } from '@/components/shared/agent-avatar';
import { StatusBadge } from '@/components/chat/status-badge';
import type { AgentStatus } from '@placet/shared';

export interface ChatHeaderHandle {
  openSettings: () => void;
}

interface ChatHeaderProps {
  agentId: string;
  name: string;
  avatarUrl?: string | null;
  description?: string | null;
  status?: AgentStatus | null;
  statusSince?: string | null;
  showSettings?: boolean;
  onToggleSettings?: () => void;
}

export const ChatHeader = forwardRef<ChatHeaderHandle, ChatHeaderProps>(function ChatHeader(
  { agentId, name, avatarUrl, description, status, statusSince, showSettings, onToggleSettings },
  ref,
) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  useImperativeHandle(ref, () => ({
    openSettings: () => onToggleSettings?.(),
  }));

  const handleCopyId = useCallback(() => {
    void navigator.clipboard.writeText(agentId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [agentId]);

  return (
    <div className="sticky top-0 z-20 shrink-0 border-b border-border/50 bg-background/80 backdrop-blur">
      <div className="h-14 sm:h-16 flex items-center justify-between gap-2 px-4 lg:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden shrink-0 -ml-2"
            onClick={() => router.push('/chats')}
          >
            <ArrowLeft size={20} />
          </Button>
          <AgentAvatar name={name} avatarUrl={avatarUrl} size="sm" />
          {/* Name + status stack — inline on sm+, vertical on mobile.
              Uses `self-start` + `pt-0.5` on mobile so the name's top edge
              aligns with the avatar's top edge (the two-line stack is
              taller than the avatar). */}
          <div className="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2 leading-tight self-start sm:self-auto pt-0.5 sm:pt-0">
            <h2 className="text-base font-semibold text-foreground truncate">{name}</h2>
            <StatusBadge status={status} statusSince={statusSince} />
            {description && (
              <p className="text-xs text-muted-foreground truncate sm:hidden">{description}</p>
            )}
          </div>
          {description && (
            <p className="hidden sm:block text-xs text-muted-foreground truncate">{description}</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1.5 text-muted-foreground font-mono hidden sm:inline-flex"
            onClick={handleCopyId}
          >
            {copied ? <Check size={14} className="text-success-foreground" /> : <Copy size={14} />}
            <span className="truncate max-w-[120px]">{agentId}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSettings}
            className={showSettings ? 'bg-muted' : undefined}
          >
            <Settings size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
});
