'use client';

import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Settings, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AgentAvatar } from '@/components/shared/agent-avatar';

export interface ChatHeaderHandle {
  openSettings: () => void;
}

interface ChatHeaderProps {
  agentId: string;
  name: string;
  avatarUrl?: string | null;
  description?: string | null;
  showSettings?: boolean;
  onToggleSettings?: () => void;
}

export const ChatHeader = forwardRef<ChatHeaderHandle, ChatHeaderProps>(function ChatHeader(
  { agentId, name, avatarUrl, description, showSettings, onToggleSettings },
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
    <div className="border-b border-border/50 bg-card/95 backdrop-blur z-10">
      <div className="h-16 flex items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden shrink-0"
            onClick={() => router.push('/chats')}
          >
            <ArrowLeft size={20} />
          </Button>
          <AgentAvatar name={name} avatarUrl={avatarUrl} size="sm" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate">{name}</h2>
            {description && <p className="text-xs text-muted-foreground truncate">{description}</p>}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1.5 text-muted-foreground font-mono"
            onClick={handleCopyId}
          >
            {copied ? <Check size={14} className="text-success-foreground" /> : <Copy size={14} />}
            <span className="hidden sm:inline truncate max-w-[120px]">{agentId}</span>
            <span className="sm:hidden">ID</span>
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
