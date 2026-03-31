'use client';

import { useParams } from 'next/navigation';
import { AgentsProvider, useAgentsContext } from '@/lib/contexts/agents-context';
import { InboxProvider, useInboxContext } from '@/lib/contexts/inbox-context';
import { InboxList } from '@/components/inbox/inbox-list';

function InboxLayoutInner({ children }: { children: React.ReactNode }) {
  const params = useParams<{ messageId?: string }>();
  const messageId = params.messageId;
  const { agents } = useAgentsContext();
  const { reviews, loading } = useInboxContext();

  const agentInfos = agents.map((a) => ({
    id: a.id,
    name: a.name,
    avatarUrl: a.avatarUrl,
  }));

  return (
    <>
      <InboxList
        reviews={reviews}
        agents={agentInfos}
        loading={loading}
        activeReviewId={messageId}
        className={messageId ? 'hidden lg:flex' : undefined}
      />
      {children}
    </>
  );
}

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <AgentsProvider>
      <InboxProvider>
        <InboxLayoutInner>{children}</InboxLayoutInner>
      </InboxProvider>
    </AgentsProvider>
  );
}
