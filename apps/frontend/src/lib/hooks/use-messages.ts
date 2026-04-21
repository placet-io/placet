'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Message, PaginatedResponse } from '@placet/shared';
import { api } from '@/lib/api';
import { useSocket } from '@/lib/contexts/socket-context';

const PAGE_SIZE = 25;
const PENDING_MESSAGES_STORAGE_KEY = 'placet:pending-messages';

export type ChatDeliveryStatus = Message['deliveryStatus'] | 'unsent';
export interface ChatMessage extends Omit<Message, 'deliveryStatus'> {
  deliveryStatus?: ChatDeliveryStatus;
}

export interface StreamingMessage {
  streamId: string;
  content: string;
  complete: boolean;
  createdAt: string;
}

function getPendingMessagesStorageKey(channelId: string) {
  return `${PENDING_MESSAGES_STORAGE_KEY}:${channelId}`;
}

function getMessageClientId(metadata: ChatMessage['metadata']): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const clientId = metadata.clientId;
  return typeof clientId === 'string' ? clientId : null;
}

function createPendingMessage(channelId: string, text: string, clientId: string): ChatMessage {
  return {
    id: `pending:${clientId}`,
    channelId,
    senderType: 'user',
    senderId: 'local',
    text,
    status: null,
    review: null,
    metadata: { clientId, pending: true },
    deliveryStatus: 'unsent',
    iterationGroupId: null,
    iteration: null,
    createdAt: new Date().toISOString(),
    attachments: [],
  };
}

function readPendingMessages(channelId: string): ChatMessage[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(getPendingMessagesStorageKey(channelId));
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

function writePendingMessages(channelId: string, messages: ChatMessage[]) {
  if (typeof window === 'undefined') return;

  const key = getPendingMessagesStorageKey(channelId);
  if (messages.length === 0) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(messages));
}

function reconcilePendingMessages(pending: ChatMessage[], persisted: Message[]) {
  const persistedClientIds = new Set(
    persisted
      .map((message) => getMessageClientId(message.metadata))
      .filter((clientId): clientId is string => !!clientId),
  );

  return pending.filter((message) => {
    const clientId = getMessageClientId(message.metadata);
    return !clientId || !persistedClientIds.has(clientId);
  });
}

export function useMessages(channelId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingMessages, setStreamingMessages] = useState<StreamingMessage[]>([]);
  const [progress, setProgress] = useState<{
    content: string;
    toolHint: boolean;
  } | null>(null);
  const cursorRef = useRef<string | null>(null);
  const retryingPendingIdsRef = useRef<Set<string>>(new Set());
  const { socket, connected, subscribe, unsubscribe, markRead } = useSocket();

  const allMessages = useMemo(() => {
    const reconciledPending = reconcilePendingMessages(pendingMessages, messages);
    return [...messages, ...reconciledPending].sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );
  }, [messages, pendingMessages]);

  const removePendingMessage = useCallback((match: { id?: string; clientId?: string }) => {
    setPendingMessages((prev) =>
      prev.filter((message) => {
        if (match.id && message.id === match.id) return false;
        if (match.clientId && getMessageClientId(message.metadata) === match.clientId) return false;
        return true;
      }),
    );
  }, []);

  const addOrReplaceMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      if (prev.some((existing) => existing.id === message.id)) {
        return prev;
      }
      return [...prev, message];
    });
  }, []);

  const submitPendingMessage = useCallback(
    async (pendingMessage: ChatMessage) => {
      if (!channelId || !pendingMessage.text) return;
      if (retryingPendingIdsRef.current.has(pendingMessage.id)) return;

      retryingPendingIdsRef.current.add(pendingMessage.id);
      const clientId = getMessageClientId(pendingMessage.metadata);

      try {
        const persisted = await api<Message>('/api/messages', {
          method: 'POST',
          body: JSON.stringify({
            channelId,
            text: pendingMessage.text,
            ...(clientId ? { clientId } : {}),
          }),
        });

        if (clientId) {
          removePendingMessage({ clientId });
        } else {
          removePendingMessage({ id: pendingMessage.id });
        }
        addOrReplaceMessage(persisted);
        setError(null);
      } catch {
        setPendingMessages((prev) =>
          prev.map((message) =>
            message.id === pendingMessage.id ? { ...message, deliveryStatus: 'unsent' } : message,
          ),
        );
      } finally {
        retryingPendingIdsRef.current.delete(pendingMessage.id);
      }
    },
    [addOrReplaceMessage, channelId, removePendingMessage],
  );

  // Load initial (newest) batch
  const fetchMessages = useCallback(async () => {
    if (!channelId) {
      setMessages([]);
      setPendingMessages([]);
      setLoading(false);
      setHasMore(false);
      setStreamingMessages([]);
      setProgress(null);
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
      setPendingMessages((prev) => reconcilePendingMessages(prev, sorted));
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

  useEffect(() => {
    if (!channelId) {
      setPendingMessages([]);
      return;
    }

    const stored = readPendingMessages(channelId);
    setPendingMessages(stored);

    if (connected) {
      stored.forEach((message) => {
        void submitPendingMessage(message);
      });
    }
  }, [channelId, connected, submitPendingMessage]);

  useEffect(() => {
    if (!channelId) return;
    writePendingMessages(channelId, pendingMessages);
  }, [channelId, pendingMessages]);

  // ── WebSocket: subscribe to channel + listen for real-time events ──
  useEffect(() => {
    if (!channelId || !socket || !connected) return;

    subscribe(channelId);
    markRead(channelId);

    const handleMessageCreated = (msg: Message) => {
      if (msg.channelId !== channelId) return;
      // Clear streaming/progress state when final message arrives
      setProgress(null);
      setStreamingMessages((prev) => {
        if (prev.length === 0) return prev;
        const completedStream = prev.find((stream) => stream.complete);
        const streamToClear = completedStream ?? prev[0];
        return prev.filter((stream) => stream.streamId !== streamToClear.streamId);
      });
      const clientId = getMessageClientId(msg.metadata);
      if (clientId) {
        removePendingMessage({ clientId });
      }
      addOrReplaceMessage(msg);
    };

    const handleReviewResponded = (msg: Message) => {
      if (msg.channelId !== channelId) return;
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
    };

    const handleDelivery = (event: { messageId: string; deliveryStatus: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === event.messageId
            ? { ...m, deliveryStatus: event.deliveryStatus as Message['deliveryStatus'] }
            : m,
        ),
      );
    };

    socket.on('message:created', handleMessageCreated);
    socket.on('review:responded', handleReviewResponded);
    socket.on('message:delivery', handleDelivery);

    const handleDelta = (data: {
      channelId: string;
      delta: string;
      streamId?: string;
      streamEnd?: boolean;
    }) => {
      if (data.channelId !== channelId) return;
      const streamId = data.streamId ?? '__default__';
      if (data.streamEnd) {
        // Stream segment finished — keep content visible until message:created
        // arrives to avoid a flash where the bubble disappears and reappears.
        // Just stop accumulating; handleMessageCreated will clean up.
        setStreamingMessages((prev) =>
          prev.map((stream) =>
            stream.streamId === streamId ? { ...stream, complete: true } : stream,
          ),
        );
        return;
      }
      setStreamingMessages((prev) => {
        const existing = prev.find((stream) => stream.streamId === streamId);
        if (!existing) {
          return [
            ...prev,
            {
              streamId,
              content: data.delta,
              complete: false,
              createdAt: new Date().toISOString(),
            },
          ];
        }

        return prev.map((stream) =>
          stream.streamId === streamId
            ? { ...stream, content: `${stream.content}${data.delta}`, complete: false }
            : stream,
        );
      });
      // Clear progress when streaming starts
      setProgress(null);
    };

    const handleProgress = (data: { channelId: string; content: string; toolHint?: boolean }) => {
      if (data.channelId !== channelId) return;
      setProgress({
        content: data.content,
        toolHint: !!data.toolHint,
      });
    };

    socket.on('message:delta', handleDelta);
    socket.on('message:progress', handleProgress);

    return () => {
      socket.off('message:created', handleMessageCreated);
      socket.off('review:responded', handleReviewResponded);
      socket.off('message:delivery', handleDelivery);
      socket.off('message:delta', handleDelta);
      socket.off('message:progress', handleProgress);
      unsubscribe(channelId);
    };
  }, [
    channelId,
    socket,
    connected,
    subscribe,
    unsubscribe,
    markRead,
    addOrReplaceMessage,
    removePendingMessage,
  ]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!channelId) return;
      const clientId = crypto.randomUUID();
      const pendingMessage = createPendingMessage(channelId, text, clientId);

      setPendingMessages((prev) => [...prev, pendingMessage]);

      try {
        const msg = await api<Message>('/api/messages', {
          method: 'POST',
          body: JSON.stringify({ channelId, text, clientId }),
        });
        removePendingMessage({ clientId });
        addOrReplaceMessage(msg);
      } catch {
        setPendingMessages((prev) =>
          prev.map((message) =>
            message.id === pendingMessage.id ? { ...message, deliveryStatus: 'unsent' } : message,
          ),
        );
      }
    },
    [addOrReplaceMessage, channelId, removePendingMessage],
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
    async (
      messageId: string,
      response: Record<string, unknown>,
      modifiedFileIds?: Record<string, string>,
      options?: { feedback?: string },
    ) => {
      const updated = await api<Message>(`/api/messages/${messageId}/respond`, {
        method: 'POST',
        body: JSON.stringify({
          response,
          ...(modifiedFileIds && Object.keys(modifiedFileIds).length ? { modifiedFileIds } : {}),
          ...(options?.feedback ? { feedback: options.feedback } : {}),
        }),
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
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    },
    [channelId],
  );

  const retryDelivery = useCallback(
    async (messageId: string) => {
      const pendingMessage = pendingMessages.find((message) => message.id === messageId);
      if (pendingMessage) {
        await submitPendingMessage(pendingMessage);
        return;
      }

      await api<{ retried: boolean }>(`/api/messages/${messageId}/retry`, {
        method: 'POST',
      });
    },
    [pendingMessages, submitPendingMessage],
  );

  return {
    messages: allMessages,
    loading,
    loadingOlder,
    hasMore,
    error,
    streamingMessages,
    progress,
    refetch: fetchMessages,
    sendMessage,
    uploadFile,
    loadOlder,
    respondToReview,
    sendAsMessage,
    retryDelivery,
  };
}
