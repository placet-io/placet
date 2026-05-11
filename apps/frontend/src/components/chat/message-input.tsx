'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, File as FileIcon, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AgentCommand } from '@placet/shared';
import { SlashCommandMenu } from './slash-command-menu';

export interface QuotedMessage {
  messageId: string;
  senderName: string;
  text: string;
}

const MAX_FILES = 10;

interface MessageInputProps {
  onSend: (text: string) => void;
  onUploadFiles?: (files: File[], text?: string) => Promise<void>;
  disabled?: boolean;
  className?: string;
  quotedMessage?: QuotedMessage | null;
  onClearQuote?: () => void;
  commands?: AgentCommand[];
}

export const MessageInput = memo(function MessageInput({
  onSend,
  onUploadFiles,
  disabled = false,
  className,
  quotedMessage,
  onClearQuote,
  commands = [],
}: MessageInputProps) {
  const [text, setText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasPending = pendingFiles.length > 0;

  // Slash command detection: show menu when text starts with `/`
  const slashQuery = useMemo(() => {
    if (!text.startsWith('/') || text.includes(' ') || text.includes('\n')) return null;
    return text.slice(1); // everything after the `/`
  }, [text]);

  useEffect(() => {
    setShowCommands(slashQuery !== null && commands.length > 0);
  }, [slashQuery, commands.length]);

  // Matched command for syntax highlighting (e.g. "/reflection-log some-sha")
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
      if (hasPending && onUploadFiles) {
        try {
          setUploading(true);
          const trimmed = text.trim();
          await onUploadFiles(pendingFiles, trimmed || undefined);
          setPendingFiles([]);
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
    [text, onSend, quotedMessage, onClearQuote, hasPending, pendingFiles, onUploadFiles],
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

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setPendingFiles((prev) => {
        const slots = MAX_FILES - prev.length;
        if (slots <= 0) return prev;
        return [...prev, ...files.slice(0, slots)];
      });
      onClearQuote?.();
    },
    [onClearQuote],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      addFiles(files);
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [addFiles],
  );

  const handleRemoveFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLFormElement>) => {
      if (!onUploadFiles) return;
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setIsDragging(true);
    },
    [onUploadFiles],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLFormElement>) => {
      if (!onUploadFiles) return;
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [onUploadFiles],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLFormElement>) => {
      if (!onUploadFiles) return;
      e.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDragging(false);
    },
    [onUploadFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLFormElement>) => {
      if (!onUploadFiles) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);
      if (disabled || uploading) return;
      const dropped = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
      addFiles(dropped);
    },
    [onUploadFiles, disabled, uploading, addFiles],
  );

  // Object URLs for image previews, recomputed when the file list changes.
  const previewUrls = useMemo(
    () => pendingFiles.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)),
    [pendingFiles],
  );

  // Revoke object URLs on cleanup / when the file list changes
  useEffect(() => {
    return () => {
      for (const url of previewUrls) if (url) URL.revokeObjectURL(url);
    };
  }, [previewUrls]);

  const canSend = hasPending ? !uploading : !!text.trim();
  const canAddMoreFiles = pendingFiles.length < MAX_FILES;

  // Horizontal scroll state for the pending-files chip row.
  // Used on desktop only to decide whether to show left/right scroll chevrons.
  const filesScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = filesScrollRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = filesScrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState, pendingFiles]);

  const scrollFilesBy = useCallback((direction: 'left' | 'right') => {
    const el = filesScrollRef.current;
    if (!el) return;
    const amount = Math.max(160, Math.round(el.clientWidth * 0.6));
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  }, []);

  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 shrink-0 bg-background/80 backdrop-blur px-2 py-2 sm:px-4 sm:py-4',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-4xl">
        {/* Quote preview (hidden when files are pending) */}
        {quotedMessage && !hasPending && (
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

        {/* Pending file previews — compact chips, horizontally scrollable.
         * Mobile: native horizontal swipe. Desktop: left/right chevrons appear
         * when the row overflows and the user can scroll that direction. */}
        {hasPending && (
          <div className="relative mb-2">
            <div
              ref={filesScrollRef}
              className="flex items-center gap-2 overflow-x-auto scrollbar-hide"
            >
              {pendingFiles.map((file, idx) => {
                const preview = previewUrls[idx];
                return (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center gap-2 rounded-xl bg-muted/50 border border-border/50 pl-2 pr-1 py-1.5 shrink-0 max-w-55"
                  >
                    {preview ? (
                      <img
                        src={preview}
                        alt={file.name}
                        className="h-7 w-7 rounded-md object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <FileIcon size={14} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{file.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {(file.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => handleRemoveFile(idx)}
                      aria-label={`Remove ${file.name}`}
                    >
                      <X size={12} />
                    </Button>
                  </div>
                );
              })}
            </div>
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => scrollFilesBy('left')}
                aria-label="Scroll attachments left"
                className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 h-7 w-7 items-center justify-center rounded-full bg-background/90 border border-border/50 shadow-xs text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <ChevronLeft size={14} />
              </button>
            )}
            {canScrollRight && (
              <button
                type="button"
                onClick={() => scrollFilesBy('right')}
                aria-label="Scroll attachments right"
                className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 h-7 w-7 items-center justify-center rounded-full bg-background/90 border border-border/50 shadow-xs text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <ChevronRight size={14} />
              </button>
            )}
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
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              // Mobile: single row — [paperclip | textarea | send] centered.
              // Desktop: flex-wrap forces textarea (basis-full) to its own
              // line; paperclip + send flow onto a second line.
              'relative flex flex-wrap items-center gap-1 bg-card rounded-2xl px-3 py-2 md:px-4 md:pt-3 md:pb-2 md:gap-2 shadow-xs border border-border/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all',
              isDragging && 'border-primary ring-2 ring-primary/40 bg-primary/5',
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="relative order-2 flex-1 min-w-0 px-2 md:order-1 md:basis-full md:flex-none md:w-full md:px-3">
              {/* Syntax highlight overlay for matched commands */}
              {matchedCommand && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 text-base whitespace-pre-wrap break-words py-1"
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
                placeholder={hasPending ? 'Add a message (optional)…' : 'Write a message...'}
                disabled={disabled}
                rows={1}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="sentences"
                spellCheck={false}
                inputMode="text"
                enterKeyHint="send"
                className={cn(
                  // Mobile: taller min-height + symmetric py so the text
                  // visually centers alongside the icon buttons in the row.
                  'w-full min-h-9 py-2 bg-transparent border-none outline-none text-base placeholder:text-muted-foreground resize-none scrollbar-hide md:min-h-[28px] md:py-1 leading-6',
                  matchedCommand ? 'text-transparent caret-foreground' : 'text-foreground',
                )}
              />
            </div>

            <div className="order-1 flex items-center gap-1 md:order-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || uploading || !!quotedMessage || !canAddMoreFiles}
                className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                onClick={handleFileSelect}
                aria-label={canAddMoreFiles ? 'Attach files' : `Maximum ${MAX_FILES} files`}
              >
                <Paperclip size={20} />
              </Button>
            </div>

            <Button
              type="submit"
              size="icon"
              disabled={disabled || !canSend}
              className="order-3 shrink-0 rounded-full md:ml-auto"
            >
              {uploading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <Send size={18} />
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
});
