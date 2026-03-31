'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useInboxReviews } from '@/lib/hooks/use-inbox-reviews';
import type { ReviewStatusFilter, ReviewSort } from '@/lib/hooks/use-inbox-reviews';
import type { Message } from '@placet/shared';

interface InboxContextValue {
  reviews: Message[];
  loading: boolean;
  error: string | null;
  statusFilter: ReviewStatusFilter;
  sort: ReviewSort;
  setSort: (sort: ReviewSort) => void;
  setStatusFilter: (status: ReviewStatusFilter) => void;
  refetch: () => Promise<void>;
  respondToReview: (messageId: string, response: Record<string, unknown>) => Promise<Message>;
}

const InboxContext = createContext<InboxContextValue | null>(null);

export function InboxProvider({ children }: { children: ReactNode }) {
  const value = useInboxReviews();
  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export function useInboxContext() {
  const ctx = useContext(InboxContext);
  if (!ctx) throw new Error('useInboxContext must be used within InboxProvider');
  return ctx;
}
