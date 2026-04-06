'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Message } from '@placet/shared';
import { api } from '@/lib/api';
import { useSocket } from '@/lib/contexts/socket-context';

export type ReviewStatusFilter = 'pending' | 'completed' | 'changes_requested' | 'all';
export type ReviewSort = 'newest' | 'oldest';

export function useInboxReviews() {
  const [reviews, setReviews] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter>('pending');
  const [sort, setSort] = useState<ReviewSort>('newest');
  const { socket, connected } = useSocket();

  const fetchReviews = useCallback(
    async (status?: ReviewStatusFilter) => {
      try {
        setLoading(true);
        const s = status ?? statusFilter;
        const data = await api<Message[]>(`/api/messages/reviews?status=${s}`);
        setReviews(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load reviews');
      } finally {
        setLoading(false);
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    void fetchReviews();
  }, [fetchReviews]);

  // Listen for real-time review completions to remove from list
  useEffect(() => {
    if (!socket || !connected) return;

    const handleReviewResponded = (msg: Message) => {
      if (statusFilter === 'pending') {
        setReviews((prev) => prev.filter((r) => r.id !== msg.id));
      } else {
        // Update the review status in-place for 'all' or 'completed' views
        setReviews((prev) => prev.map((r) => (r.id === msg.id ? { ...r, review: msg.review } : r)));
      }
    };

    // Also add newly created reviews to the list
    const handleMessageCreated = (msg: Message) => {
      if (msg.review && msg.review.status === 'pending') {
        setReviews((prev) => {
          if (prev.some((r) => r.id === msg.id)) return prev;
          return [msg, ...prev];
        });
      }
    };

    const handleReviewExpired = (msg: Message) => {
      if (statusFilter === 'pending') {
        setReviews((prev) => prev.filter((r) => r.id !== msg.id));
      } else {
        setReviews((prev) => prev.map((r) => (r.id === msg.id ? { ...r, review: msg.review } : r)));
      }
    };

    socket.on('review:responded', handleReviewResponded);
    socket.on('review:expired', handleReviewExpired);
    socket.on('message:created', handleMessageCreated);

    return () => {
      socket.off('review:responded', handleReviewResponded);
      socket.off('review:expired', handleReviewExpired);
      socket.off('message:created', handleMessageCreated);
    };
  }, [socket, connected, statusFilter]);

  const respondToReview = useCallback(
    async (
      messageId: string,
      response: Record<string, unknown>,
      modifiedFileIds?: Record<string, string>,
      options?: { requestChanges?: boolean; feedback?: string },
    ) => {
      const updated = await api<Message>(`/api/messages/${messageId}/respond`, {
        method: 'POST',
        body: JSON.stringify({
          response,
          ...(modifiedFileIds && Object.keys(modifiedFileIds).length ? { modifiedFileIds } : {}),
          ...(options?.requestChanges ? { requestChanges: true } : {}),
          ...(options?.feedback ? { feedback: options.feedback } : {}),
        }),
      });
      // Optimistically remove from pending list (or keep if changes_requested)
      if (options?.requestChanges) {
        setReviews((prev) => prev.map((r) => (r.id === messageId ? updated : r)));
      } else {
        setReviews((prev) => prev.filter((r) => r.id !== messageId));
      }
      return updated;
    },
    [],
  );

  const changeStatusFilter = useCallback(
    (status: ReviewStatusFilter) => {
      setStatusFilter(status);
      void fetchReviews(status);
    },
    [fetchReviews],
  );

  const sortedReviews = sort === 'oldest' ? [...reviews].reverse() : reviews;

  return {
    reviews: sortedReviews,
    loading,
    error,
    statusFilter,
    sort,
    setSort,
    setStatusFilter: changeStatusFilter,
    refetch: fetchReviews,
    respondToReview,
  };
}
