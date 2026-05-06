'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Message, MessageStatusEvent, PaginatedResponse } from '@placet/shared';
import { api } from '@/lib/api';
import { useSocket } from '@/lib/contexts/socket-context';

const PAGE_SIZE = 25;
const PENDING_MESSAGES_STORAGE_KEY = 'placet:pending-messages';

export type ChatDeliveryStatus = Message['deliveryStatus'] | 'unsent';
export interface ChatMessage extends Omit<Message, 'deliveryStatus'> {
  deliveryStatus?: ChatDeliveryStatus;
}

/**
 * @deprecated Streaming drafts are now first-class persisted messages
 * with `streamState === 'streaming'` and live directly in `messages`.
 * The legacy `StreamingMessage` shape is kept for backwards compatibility
 * with components that still receive an empty array.
 */
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
  /**
   * Status events that have arrived (via WS) before the matching agent
   * draft message exists. Keyed by streamId. Once the draft lands, the
   * orphan list is merged into the message and the entry is dropped.
   * This is the only ephemeral state for status — there is no longer a
   * separate single-slot `progress` field; status events are the single
   * source of truth and survive a refresh because they're persisted.
   */
  const [orphanStatusByStream, setOrphanStatusByStream] = useState<
    Record<string, MessageStatusEvent[]>
  >({});
  /**
   * Single-slot ephemeral progress used as a fallback for non-streaming
   * agents that emit `message:progress` but never open a streaming draft
   * (so the persistent status pipeline is silent for them). Cleared on
   * the next `message:created` for the channel.
   */
  const [ephemeralProgress, setEphemeralProgress] = useState<{
    content: string;
    toolHint: boolean;
  } | null>(null);
  // Mirror of `orphanStatusByStream` for read access inside socket handlers
  // — keeping it as a ref means the effect doesn't re-subscribe every time
  // a status event lands.
  const orphanStatusRef = useRef<Record<string, MessageStatusEvent[]>>({});
  useEffect(() => {
    orphanStatusRef.current = orphanStatusByStream;
  }, [orphanStatusByStream]);
  const cursorRef = useRef<string | null>(null);
  const retryingPendingIdsRef = useRef<Set<string>>(new Set());
  const { socket, connected, subscribe, unsubscribe, markRead } = useSocket();

  const allMessages = useMemo(() => {
    const reconciledPending = reconcilePendingMessages(pendingMessages, messages);
    // Sort strictly by `createdAt`. Streaming drafts are pinned to the
    // bottom of the rendered timeline by `streamState === 'streaming'`
    // (see `MessageList`), so we never need to reorder rows when a row
    // is updated post-creation (acknowledge, webhook delivery, etc.).
    const keyOf = (m: { createdAt: string }) => new Date(m.createdAt).getTime();
    return [...messages, ...reconciledPending].sort((left, right) => keyOf(left) - keyOf(right));
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
      // De-dup by id (primary): same persisted row arriving twice (e.g. from
      // multi-room WS delivery) is a no-op.
      if (prev.some((existing) => existing.id === message.id)) {
        return prev;
      }
      // De-dup by clientId (defense in depth): if a message with the same
      // clientId already exists under a different id, replace it rather than
      // appending — prevents visual duplicates when an optimistic/pre-existing
      // entry shadows the canonical persisted form.
      const incomingClientId = getMessageClientId(message.metadata);
      if (incomingClientId) {
        const dupIndex = prev.findIndex(
          (existing) => getMessageClientId(existing.metadata) === incomingClientId,
        );
        if (dupIndex !== -1) {
          const next = prev.slice();
          next[dupIndex] = message;
          return next;
        }
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
      setOrphanStatusByStream({});
      setEphemeralProgress(null);
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
    // Debounce the localStorage write — typing in the composer triggers a
    // pending-message update on every keystroke once the network is offline,
    // and writing JSON to storage on every key blocks the main thread.
    const handle = window.setTimeout(() => {
      writePendingMessages(channelId, pendingMessages);
    }, 80);
    return () => {
      window.clearTimeout(handle);
    };
  }, [channelId, pendingMessages]);

  // ── WebSocket: subscribe to channel + listen for real-time events ──
  useEffect(() => {
    if (!channelId || !socket || !connected) return;

    subscribe(channelId);
    markRead(channelId);

    const handleMessageCreated = (msg: Message) => {
      if (msg.channelId !== channelId) return;
      // Streaming drafts are now persisted from the very first delta, so a
      // `message:created` for an agent stream may arrive *before* any delta
      // (the POST returns it). `addOrReplaceMessage` dedups by id; subsequent
      // PATCH-driven `message:updated` events refresh the same row in place.
      // If status events for this stream landed before the draft, fold them
      // in now and drop the orphan entry.
      let merged = msg;
      if (msg.streamId) {
        const orphaned = orphanStatusRef.current[msg.streamId];
        if (orphaned && orphaned.length > 0) {
          const existing = msg.statusEvents ?? [];
          const seen = new Set(existing.map((e) => e.id));
          merged = {
            ...msg,
            statusEvents: [...existing, ...orphaned.filter((e) => !seen.has(e.id))].sort(
              (a, b) => a.index - b.index,
            ),
          };
          setOrphanStatusByStream((prev) => {
            const { [msg.streamId!]: _drop, ...rest } = prev;
            return rest;
          });
        }
      }
      const clientId = getMessageClientId(merged.metadata);
      if (clientId) {
        removePendingMessage({ clientId });
      }
      // The final agent message has landed — drop the ephemeral progress.
      setEphemeralProgress(null);
      addOrReplaceMessage(merged);
      // Keep the channel's read marker fresh while the chat is open. Without
      // this the server's lastReadAt stays at the moment the chat was
      // opened, so the next agent list refresh re-introduces an unread
      // badge for messages that arrived while the user was viewing.
      if (merged.senderType === 'agent') {
        markRead(channelId);
      }
    };

    const handleMessageUpdated = (msg: Message) => {
      if (msg.channelId !== channelId) return;
      // Authoritative replace by id: PATCH from the agent during streaming
      // and the final `complete` PATCH both flow through this path. The
      // payload doesn't carry `statusEvents` (those flow via the dedicated
      // `message:status` channel), so preserve any we've already collected.
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msg.id);
        if (idx === -1) return [...prev, msg];
        const next = prev.slice();
        next[idx] = { ...msg, statusEvents: prev[idx].statusEvents ?? msg.statusEvents };
        return next;
      });
      if (msg.senderType === 'agent') {
        if (msg.streamState && msg.streamState !== 'streaming') {
          setEphemeralProgress(null);
        }
        markRead(channelId);
      }
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
    socket.on('message:updated', handleMessageUpdated);
    socket.on('review:responded', handleReviewResponded);
    socket.on('message:delivery', handleDelivery);

    /**
     * Delta-driven optimistic text append. The agent emits one
     * ``message:delta`` per chunk for instant UI update; the server-side
     * truth catches up via throttled ``message:updated`` events and the
     * final ``message:created``/PATCH-driven update. Matching the right
     * draft uses ``streamBaseId`` (the column on `Message`) and falls
     * back to the legacy per-segment ``streamId`` for older agents that
     * haven't been redeployed yet.
     */
    const handleDelta = (data: {
      channelId: string;
      delta: string;
      streamId?: string;
      streamBaseId?: string;
      streamStartedAt?: string;
      streamEnd?: boolean;
    }) => {
      if (data.channelId !== channelId) return;
      if (data.streamEnd) return; // segment marker — wait for PATCH/created
      if (!data.delta) return;

      const baseId =
        data.streamBaseId ??
        (data.streamId ? data.streamId.split(':').slice(0, -1).join(':') || data.streamId : null);
      if (!baseId) return;

      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.streamId === baseId);
        if (idx === -1) return prev; // draft not POSTed yet — PATCH will catch up
        const existing = prev[idx];
        const next = prev.slice();
        next[idx] = { ...existing, text: (existing.text ?? '') + data.delta };
        return next;
      });
    };

    /**
     * Persistent status step (``message:status``). When the matching draft
     * already exists we append directly to its `statusEvents`; otherwise we
     * stash the event in `orphanStatusByStream` so it can be folded in once
     * the draft is created. Idempotent on `id`.
     */
    const handleStatusEvent = (event: MessageStatusEvent) => {
      if (event.channelId !== channelId) return;
      setEphemeralProgress(null);
      let attached = false;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.streamId === event.streamId);
        if (idx === -1) return prev;
        attached = true;
        const existing = prev[idx];
        const events = existing.statusEvents ?? [];
        if (events.some((e) => e.id === event.id)) return prev;
        const next = prev.slice();
        next[idx] = { ...existing, statusEvents: [...events, event] };
        return next;
      });
      if (!attached) {
        setOrphanStatusByStream((prev) => {
          const list = prev[event.streamId] ?? [];
          if (list.some((e) => e.id === event.id)) return prev;
          return { ...prev, [event.streamId]: [...list, event] };
        });
      }
    };

    /**
     * Ephemeral progress fallback. Used by agents that emit
     * `message:progress` but don't open a streaming draft. When the
     * persistent status pipeline is active for the same turn, the
     * frontend prefers that one (see `MessageList`); the ephemeral slot
     * just keeps the UI alive while no persistent state exists yet.
     */
    const handleProgress = (data: {
      channelId: string;
      content: string;
      toolHint?: boolean;
      streamId?: string;
    }) => {
      if (data.channelId !== channelId) return;
      if (data.streamId) {
        setEphemeralProgress(null);
        return;
      }
      setEphemeralProgress({ content: data.content, toolHint: !!data.toolHint });
    };

    socket.on('message:delta', handleDelta);
    socket.on('message:status', handleStatusEvent);
    socket.on('message:progress', handleProgress);

    return () => {
      socket.off('message:created', handleMessageCreated);
      socket.off('message:updated', handleMessageUpdated);
      socket.off('review:responded', handleReviewResponded);
      socket.off('message:delivery', handleDelivery);
      socket.off('message:delta', handleDelta);
      socket.off('message:status', handleStatusEvent);
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

  const uploadFiles = useCallback(
    async (files: File[], text?: string) => {
      if (!channelId || files.length === 0) return;

      // Step 1: upload each file individually as an orphan attachment.
      // Sequential to stay within per-request multipart limits and to surface
      // partial failures clearly (earlier files remain stored on failure of a later one).
      const attachmentIds: string[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('channelId', channelId);
        formData.append('file', file);

        const res = await fetch('/api/files/store', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error((body as Record<string, string>).message ?? 'Upload failed');
        }
        const attachment = (await res.json()) as { id: string };
        attachmentIds.push(attachment.id);
      }

      // Step 2: create one message referencing all uploaded attachments.
      await api<Message>('/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          channelId,
          ...(text ? { text } : {}),
          attachmentIds,
        }),
      });

      // Re-fetch to pick up the new message with its attachments
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
    orphanStatusByStream,
    ephemeralProgress,
    refetch: fetchMessages,
    sendMessage,
    uploadFiles,
    loadOlder,
    respondToReview,
    sendAsMessage,
    retryDelivery,
  };
}
