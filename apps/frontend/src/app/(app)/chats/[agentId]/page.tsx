'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatHeader } from '@/components/chat/chat-header';
import type { ChatHeaderHandle } from '@/components/chat/chat-header';
import { ChatSettings } from '@/components/chat/chat-settings';
import { MessageList } from '@/components/chat/message-list';
import { MessageInput } from '@/components/chat/message-input';
import type { QuotedMessage } from '@/components/chat/message-input';
import { PendingReviewsBar } from '@/components/chat/pending-reviews-bar';
import { useAgentsContext } from '@/lib/contexts/agents-context';
import { useMessages } from '@/lib/hooks/use-messages';
import { useCommands } from '@/lib/hooks/use-commands';
import { useSocket } from '@/lib/contexts/socket-context';

export default function ChatThreadPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const searchParams = useSearchParams();
  const highlightMessageId = searchParams.get('messageId');
  const headerRef = useRef<ChatHeaderHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [quotedMessage, setQuotedMessage] = useState<QuotedMessage | null>(null);

  const { agents, clearUnread } = useAgentsContext();
  const { markRead } = useSocket();
  const agent = agents.find((a) => a.id === agentId);
  const agentName = agent?.name ?? 'Agent';
  const agentAvatarUrl = agent?.avatarUrl
    ? `/api/agents/${agentId}/avatar?v=${encodeURIComponent(agent.avatarUrl)}`
    : null;

  const { commands } = useCommands(agentId, agent?.commands);

  const {
    messages,
    loading: messagesLoading,
    loadingOlder,
    hasMore,
    streamingMessages,
    progress,
    sendMessage,
    uploadFile,
    loadOlder,
    respondToReview,
    sendAsMessage,
    retryDelivery,
  } = useMessages(agentId);

  // Clear unread badge and mark as read on server when entering chat
  useEffect(() => {
    clearUnread(agentId);
    markRead(agentId);
  }, [agentId, clearUnread, markRead]);

  const handleSend = useCallback(
    (text: string) => {
      void sendMessage(text);
    },
    [sendMessage],
  );

  const handleLoadOlder = useCallback(() => {
    void loadOlder();
  }, [loadOlder]);

  const handleSetupWebhook = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleToggleSettings = useCallback(() => {
    setShowSettings((v) => !v);
  }, []);

  const handleReply = useCallback((messageId: string, senderName: string, text: string) => {
    setQuotedMessage({ messageId, senderName, text });
  }, []);

  const handleClearQuote = useCallback(() => {
    setQuotedMessage(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card lg:rounded-3xl lg:border lg:border-border/50 lg:shadow-sm"
    >
      <ChatHeader
        ref={headerRef}
        agentId={agentId}
        name={agentName}
        avatarUrl={agentAvatarUrl}
        description={agent?.description}
        status={agent?.status}
        showSettings={showSettings}
        onToggleSettings={handleToggleSettings}
      />
      {showSettings ? (
        <ChatSettings
          agentId={agentId}
          name={agentName}
          avatarUrl={agentAvatarUrl}
          tag={agent?.tag}
          webhookUrl={agent?.webhookUrl}
          webhookHeaders={agent?.webhookHeaders}
          webhookAuth={agent?.webhookAuth}
        />
      ) : (
        <>
          <PendingReviewsBar channelId={agentId} />
          <MessageList
            messages={messages}
            agentName={agentName}
            agentAvatarUrl={agentAvatarUrl}
            channelId={agentId}
            loading={messagesLoading}
            loadingOlder={loadingOlder}
            hasMore={hasMore}
            highlightMessageId={highlightMessageId}
            streamingMessages={streamingMessages}
            progress={progress}
            onLoadOlder={handleLoadOlder}
            onSetupWebhook={handleSetupWebhook}
            onReviewRespond={respondToReview}
            onReply={handleReply}
            onSendAsMessage={sendAsMessage}
            onRetryDelivery={retryDelivery}
          />
          <MessageInput
            onSend={handleSend}
            onUploadFile={uploadFile}
            quotedMessage={quotedMessage}
            onClearQuote={handleClearQuote}
            commands={commands}
          />
        </>
      )}
    </div>
  );
}
