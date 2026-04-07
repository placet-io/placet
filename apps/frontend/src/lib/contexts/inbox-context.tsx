'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useInboxReviews } from '@/lib/hooks/use-inbox-reviews';
import type { ReviewStatusFilter, ReviewSort } from '@/lib/hooks/use-inbox-reviews';
import type { Message } from '@placet/shared';

const STORAGE_KEY = 'placet:inbox-read';
const MAX_READ_IDS = 500;

function loadReadIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function persistReadIds(ids: Set<string>) {
  try {
    // Keep only the most recent entries to prevent unbounded growth
    const arr = [...ids];
    const trimmed = arr.length > MAX_READ_IDS ? arr.slice(-MAX_READ_IDS) : arr;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota exceeded – ignore */
  }
}

interface InboxContextValue {
  reviews: Message[];
  loading: boolean;
  error: string | null;
  statusFilter: ReviewStatusFilter;
  sort: ReviewSort;
  setSort: (sort: ReviewSort) => void;
  setStatusFilter: (status: ReviewStatusFilter) => void;
  refetch: () => Promise<void>;
  respondToReview: (
    messageId: string,
    response: Record<string, unknown>,
    modifiedFileIds?: Record<string, string>,
    options?: { feedback?: string },
  ) => Promise<Message>;
  /** Mark a message as read (client-side, persisted in localStorage). */
  markRead: (messageId: string) => void;
  /** Check whether a message is unread. */
  isUnread: (messageId: string) => boolean;
}

const InboxContext = createContext<InboxContextValue | null>(null);

export function InboxProvider({ children }: { children: ReactNode }) {
  const inbox = useInboxReviews();
  const [readIds, setReadIds] = useState<Set<string>>(loadReadIds);

  const markRead = useCallback((messageId: string) => {
    setReadIds((prev) => {
      if (prev.has(messageId)) return prev;
      const next = new Set(prev);
      next.add(messageId);
      persistReadIds(next);
      return next;
    });
  }, []);

  const isUnread = useCallback((messageId: string) => !readIds.has(messageId), [readIds]);

  const value: InboxContextValue = { ...inbox, markRead, isUnread };
  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export function useInboxContext() {
  const ctx = useContext(InboxContext);
  if (!ctx) throw new Error('useInboxContext must be used within InboxProvider');
  return ctx;
}
