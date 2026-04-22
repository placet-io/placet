'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { File as FileIcon, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AgentCommand } from '@placet/shared';
import { SlashCommandMenu } from './slash-command-menu';

export interface QuotedMessage {
  messageId: string;
  senderName: string;
  text: string;
}

interface MessageInputProps {
  onSend: (text: string) => void;
  onUploadFile?: (file: File, text?: string) => Promise<void>;
  disabled?: boolean;
  className?: string;
  quotedMessage?: QuotedMessage | null;
  onClearQuote?: () => void;
  commands?: AgentCommand[];
}

export const MessageInput = memo(function MessageInput({
  onSend,
  onUploadFile,
  disabled = false,
  className,
  quotedMessage,
  onClearQuote,
  commands = [],
}: MessageInputProps) {
  const [text, setText] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Slash command detection: show menu when text starts with `/`
  const slashQuery = useMemo(() => {
    if (!text.startsWith('/') || text.includes(' ') || text.includes('\n')) return null;
    return text.slice(1); // everything after the `/`
  }, [text]);

  useEffect(() => {
    setShowCommands(slashQuery !== null && commands.length > 0);
  }, [slashQuery, commands.length]);

  // Matched command for syntax highlighting (e.g. "/dream-log some-sha")
  const matchedCommand = useMemo(() => {
    if (!text.startsWith('/') || commands.length === 0) return null;
    return commands.find((c) => text === c.command || text.startsWith(c.command + ' ')) ?? null;
  }, [text, commands]);

  const handleCommandSelect = useCallback(
    (cmd: AgentCommand) => {
      const newText = cmd.acceptsArgs ? cmd.command + ' ' : cmd.command;
      setText(newText);
      setShowCommands(false);
      // Move cursor to end after React re-renders with the new value
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(newText.length, newText.length);
        }
      });
      // If command doesn't accept args, send immediately
      if (!cmd.acceptsArgs) {
        onSend(cmd.command);
        setText('');
      }
    },
    [onSend],
  );

  // Auto-resize textarea up to 3 lines
  const LINE_HEIGHT = 24; // text-base 16px * 1.5
  const PADDING_Y = 8; // py-1 = 4 + 4
  const MAX_HEIGHT = LINE_HEIGHT * 3 + PADDING_Y;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT) + 'px';
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }, [text, MAX_HEIGHT]);

  // Focus textarea when a quote is set
  useEffect(() => {
    if (quotedMessage) {
      textareaRef.current?.focus();
    }
  }, [quotedMessage]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // File upload mode
      if (pendingFile && onUploadFile) {
        try {
          setUploading(true);
          const trimmed = text.trim();
          await onUploadFile(pendingFile, trimmed || undefined);
          setPendingFile(null);
          setText('');
        } finally {
          setUploading(false);
        }
        return;
      }

      // Text message mode
      const trimmed = text.trim();
      if (!trimmed) return;

      const finalText = quotedMessage
        ? `> **${quotedMessage.senderName}:** ${quotedMessage.text.slice(0, 100)}${quotedMessage.text.length > 100 ? '…' : ''}\n\n${trimmed}`
        : trimmed;

      onSend(finalText);
      setText('');
      onClearQuote?.();
    },
    [text, onSend, quotedMessage, onClearQuote, pendingFile, onUploadFile],
  );

  const isMobile = useCallback(() => {
    return 'ontouchstart' in window && window.innerWidth < 768;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Let SlashCommandMenu handle navigation keys when open
      if (showCommands && ['ArrowUp', 'ArrowDown', 'Tab', 'Escape'].includes(e.key)) {
        return; // Handled by the menu's document keydown listener
      }
      if (showCommands && e.key === 'Enter') {
        return; // Menu handles Enter to select
      }
      if (e.key === 'Enter' && !e.shiftKey && !isMobile()) {
        e.preventDefault();
        void handleSubmit(e);
      }
    },
    [handleSubmit, isMobile, showCommands],
  );

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setPendingFile(file);
      // Clear quote when file is selected
      onClearQuote?.();
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [onClearQuote],
  );

  const handleClearFile = useCallback(() => {
    setPendingFile(null);
  }, []);

  const isImage = pendingFile?.type.startsWith('image/');
  const previewUrl = pendingFile && isImage ? URL.createObjectURL(pendingFile) : null;

  // Revoke object URL on cleanup
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const canSend = pendingFile ? !uploading : !!text.trim();

  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 shrink-0 bg-background/80 backdrop-blur px-2 py-2 sm:px-4 sm:py-4',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-4xl">
        {/* Quote preview (hidden when file is pending) */}
        {quotedMessage && !pendingFile && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-muted/50 border border-border/50 px-3 py-2">
            <div className="flex-1 min-w-0 border-l-2 border-primary/40 pl-2">
              <p className="text-xs font-medium text-muted-foreground">
                {quotedMessage.senderName}
              </p>
              <p className="text-xs text-foreground truncate">
                {quotedMessage.text || 'Attachment'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={onClearQuote}
            >
              <X size={14} />
            </Button>
          </div>
        )}

        {/* File preview */}
        {pendingFile && (
          <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-muted/50 border border-border/50 px-3 py-2">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={pendingFile.name}
                className="h-10 w-10 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                {pendingFile.type.startsWith('video/') ? (
                  <FileIcon size={16} className="text-muted-foreground" />
                ) : (
                  <FileIcon size={16} className="text-muted-foreground" />
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{pendingFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(pendingFile.size / 1024).toFixed(0)} KB
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={handleClearFile}
            >
              <X size={14} />
            </Button>
          </div>
        )}

        <div className="relative">
          <SlashCommandMenu
            commands={commands}
            query={slashQuery ?? ''}
            onSelect={handleCommandSelect}
            onClose={() => setShowCommands(false)}
            visible={showCommands}
          />
          <form
            onSubmit={handleSubmit}
            className="relative flex flex-col gap-2 bg-card rounded-2xl px-3 pt-3 pb-2 shadow-xs border border-border/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all"
          >
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

            <div className="relative">
              {/* Syntax highlight overlay for matched commands */}
              {matchedCommand && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 text-base whitespace-pre-wrap break-words py-1 pl-5"
                >
                  <span className="text-primary font-medium">{matchedCommand.command}</span>
                  <span className="text-foreground">
                    {text.slice(matchedCommand.command.length)}
                  </span>
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={pendingFile ? 'Add a message (optional)…' : 'Write a message...'}
                disabled={disabled}
                rows={1}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="sentences"
                spellCheck={false}
                inputMode="text"
                enterKeyHint="send"
                className={cn(
                  'w-full min-h-[28px] bg-transparent border-none outline-none text-base placeholder:text-muted-foreground resize-none py-1 pl-5 scrollbar-hide',
                  matchedCommand ? 'text-transparent caret-foreground' : 'text-foreground',
                )}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled || uploading || !!quotedMessage}
                  className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={handleFileSelect}
                >
                  <Paperclip size={20} />
                </Button>
              </div>

              <Button
                type="submit"
                size="icon"
                disabled={disabled || !canSend}
                className="shrink-0 rounded-full"
              >
                {uploading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                ) : (
                  <Send size={18} />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
});
