'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Inbox, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAgentsContext } from '@/lib/contexts/agents-context';
import { useInboxContext } from '@/lib/contexts/inbox-context';
import { InboxDetail } from '@/components/inbox/inbox-detail';
import { api } from '@/lib/api';
import type { Message } from '@placet/shared';

export default function InboxDetailPage({ params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = use(params);
  const router = useRouter();
  const { reviews, loading, respondToReview, markRead } = useInboxContext();
  const { agents } = useAgentsContext();
  const [fallbackResult, setFallbackResult] = useState<{
    id: string;
    message: Message | null;
  } | null>(null);

  const message = reviews.find((r) => r.id === messageId);
  const fallbackMessage =
    !message && !loading && fallbackResult?.id === messageId ? fallbackResult.message : null;
  const fallbackLoading = !message && !loading && fallbackResult?.id !== messageId;

  // Mark as read when opening
  useEffect(() => {
    markRead(messageId);
  }, [messageId, markRead]);

  // Fallback: fetch message directly when not in the current reviews list
  // (e.g. navigating to a completed iteration via breadcrumbs)
  useEffect(() => {
    if (message || loading) return;
    let cancelled = false;
    api<Message>(`/api/messages/${messageId}`)
      .then((msg) => {
        if (!cancelled) setFallbackResult({ id: messageId, message: msg });
      })
      .catch(() => {
        if (!cancelled) setFallbackResult({ id: messageId, message: null });
      });
    return () => {
      cancelled = true;
    };
  }, [messageId, message, loading]);

  if (loading || fallbackLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-card rounded-t-3xl lg:rounded-b-3xl shadow-sm border border-border/50 border-b-0 lg:border-b">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const resolved = message ?? fallbackMessage;

  if (!resolved) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-card rounded-t-3xl lg:rounded-b-3xl shadow-sm border border-border/50 border-b-0 lg:border-b">
        <CheckCircle2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-foreground">Review not found</p>
        <p className="text-xs text-muted-foreground mt-1">It may have been completed or expired.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/inbox')}>
          <Inbox className="mr-1.5 h-3.5 w-3.5" />
          Back to Inbox
        </Button>
      </div>
    );
  }

  const agent = agents.find((a) => a.id === resolved.channelId);

  return (
    <InboxDetail
      message={resolved}
      agentName={agent?.name ?? 'Unknown Agent'}
      agentAvatarUrl={agent?.avatarUrl}
      onRespond={respondToReview}
    />
  );
}
