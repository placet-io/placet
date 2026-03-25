'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message, PaginatedResponse } from '@humanproxy/shared';
import { api } from '@/lib/api';

const PAGE_SIZE = 25;

export function useMessages(channelId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);

  // Load initial (newest) batch
  const fetchMessages = useCallback(async () => {
    if (!channelId) {
      setMessages([]);
      setLoading(false);
      setHasMore(false);
      cursorRef.current = null;
      return;
    }
    try {
      setLoading(true);
      const res = await api<PaginatedResponse<Message>>(
        `/api/messages?channel=${channelId}&limit=${PAGE_SIZE}`,
      );
      // API returns newest first, reverse to show oldest first
      const sorted = res.data.reverse();
      setMessages(sorted);
      cursorRef.current = res.nextCursor ?? null;
      setHasMore(!!res.nextCursor);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  // Load older messages (triggered on scroll up)
  const loadOlder = useCallback(async () => {
    if (!channelId || !cursorRef.current || loadingOlder) return;
    try {
      setLoadingOlder(true);
      const res = await api<PaginatedResponse<Message>>(
        `/api/messages?channel=${channelId}&limit=${PAGE_SIZE}&cursor=${cursorRef.current}`,
      );
      const older = res.data.reverse();
      setMessages((prev) => [...older, ...prev]);
      cursorRef.current = res.nextCursor ?? null;
      setHasMore(!!res.nextCursor);
    } catch {
      // Silently fail — user can retry by scrolling up again
    } finally {
      setLoadingOlder(false);
    }
  }, [channelId, loadingOlder]);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!channelId) return;
      const msg = await api<Message>('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ channelId, text }),
      });
      setMessages((prev) => [...prev, msg]);
    },
    [channelId],
  );

  const uploadFile = useCallback(
    async (file: File, text?: string) => {
      if (!channelId) return;
      const formData = new FormData();
      formData.append('channelId', channelId);
      if (text) formData.append('text', text);
      formData.append('file', file);

      const res = await fetch('/api/files/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error((body as Record<string, string>).message ?? 'Upload failed');
      }
      // Re-fetch messages to pick up the new file message
      await fetchMessages();
    },
    [channelId, fetchMessages],
  );

  const respondToReview = useCallback(
    async (messageId: string, response: Record<string, unknown>, annotationFileId?: string) => {
      const updated = await api<Message>(`/api/messages/${messageId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ response, ...(annotationFileId ? { annotationFileId } : {}) }),
      });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
    },
    [],
  );

  const sendAsMessage = useCallback(
    async (attachmentId: string) => {
      if (!channelId) return;
      const msg = await api<Message>('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ channelId, attachmentIds: [attachmentId] }),
      });
      setMessages((prev) => [...prev, msg]);
    },
    [channelId],
  );

  return {
    messages,
    loading,
    loadingOlder,
    hasMore,
    error,
    refetch: fetchMessages,
    sendMessage,
    uploadFile,
    loadOlder,
    respondToReview,
    sendAsMessage,
  };
}
