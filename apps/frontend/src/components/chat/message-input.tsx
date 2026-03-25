'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { File as FileIcon, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
}

export const MessageInput = memo(function MessageInput({
  onSend,
  onUploadFile,
  disabled = false,
  className,
  quotedMessage,
  onClearQuote,
}: MessageInputProps) {
  const [text, setText] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit(e);
      }
    },
    [handleSubmit],
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
    <div className={cn('bg-card', className)}>
      {/* Quote preview (hidden when file is pending) */}
      {quotedMessage && !pendingFile && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-xl bg-muted/50 border border-border/50 px-3 py-2">
          <div className="flex-1 min-w-0 border-l-2 border-primary/40 pl-2">
            <p className="text-[10px] font-medium text-muted-foreground">
              {quotedMessage.senderName}
            </p>
            <p className="text-xs text-foreground truncate">{quotedMessage.text || 'Attachment'}</p>
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
        <div className="mx-4 mt-2 flex items-center gap-2.5 rounded-xl bg-muted/50 border border-border/50 px-3 py-2">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
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
            <p className="text-[10px] text-muted-foreground">
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

      <div className="p-4">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 bg-muted/50 rounded-3xl p-2 border border-border/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all"
        >
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
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

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pendingFile ? 'Add a message (optional)…' : 'Write a message...'}
            disabled={disabled}
            rows={1}
            className="flex-1 max-h-32 min-h-[40px] bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground text-foreground resize-none py-2.5"
          />

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
        </form>
      </div>
    </div>
  );
});
