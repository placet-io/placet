'use client';

import { useParams } from 'next/navigation';
import { ManageSidebar } from '@/components/manage/manage-sidebar';
import { AgentsProvider } from '@/lib/contexts/agents-context';

function ManageLayoutInner({ children }: { children: React.ReactNode }) {
  const params = useParams<{ agentId?: string }>();
  const agentId = params.agentId;

  return (
    <>
      {/* Sidebar — always rendered, hidden on mobile when an agent section is open */}
      <ManageSidebar className={agentId ? 'hidden lg:flex' : undefined} />
      {children}
    </>
  );
}

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  return (
    <AgentsProvider>
      <ManageLayoutInner>{children}</ManageLayoutInner>
    </AgentsProvider>
  );
}
