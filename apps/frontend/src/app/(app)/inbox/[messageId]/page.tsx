'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Inbox, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAgentsContext } from '@/lib/contexts/agents-context';
import { useInboxContext } from '@/lib/contexts/inbox-context';
import { InboxDetail } from '@/components/inbox/inbox-detail';

export default function InboxDetailPage({ params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = use(params);
  const router = useRouter();
  const { reviews, loading, respondToReview } = useInboxContext();
  const { agents } = useAgentsContext();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-card rounded-t-3xl lg:rounded-b-3xl shadow-sm border border-border/50 border-b-0 lg:border-b">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const message = reviews.find((r) => r.id === messageId);

  if (!message) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-card rounded-t-3xl lg:rounded-b-3xl shadow-sm border border-border/50 border-b-0 lg:border-b">
        <CheckCircle2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-foreground">Review no longer pending</p>
        <p className="text-xs text-muted-foreground mt-1">It may have been completed or expired.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/inbox')}>
          <Inbox className="mr-1.5 h-3.5 w-3.5" />
          Back to Inbox
        </Button>
      </div>
    );
  }

  const agent = agents.find((a) => a.id === message.channelId);

  return (
    <InboxDetail
      message={message}
      agentName={agent?.name ?? 'Unknown Agent'}
      agentAvatarUrl={agent?.avatarUrl}
      onRespond={respondToReview}
    />
  );
}
