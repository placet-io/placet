'use client';

import { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import type { AgentCommand } from '@placet/shared';
import { cn } from '@/lib/utils';

interface SlashCommandMenuProps {
  commands: AgentCommand[];
  query: string;
  onSelect: (command: AgentCommand) => void;
  onClose: () => void;
  visible: boolean;
}

export const SlashCommandMenu = memo(function SlashCommandMenu({
  commands,
  query,
  onSelect,
  onClose,
  visible,
}: SlashCommandMenuProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevQuery, setPrevQuery] = useState(query);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter commands based on query (text after `/`)
  const filtered = useMemo(() => {
    return commands.filter((c) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        c.command.slice(1).toLowerCase().startsWith(q) || c.description.toLowerCase().includes(q)
      );
    });
  }, [commands, query]);

  // Reset selection when query changes (setState during render is the
  // React-recommended pattern for deriving state from props)
  if (prevQuery !== query) {
    setPrevQuery(query);
    setActiveIndex(0);
  }

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || filtered.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1) % filtered.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          onSelect(filtered[activeIndex]);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [visible, filtered, activeIndex, onSelect, onClose],
  );

  useEffect(() => {
    if (!visible) return;
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [visible, handleKeyDown]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 max-h-56 overflow-y-auto scrollbar-hide rounded-xl border border-border/50 bg-popover shadow-lg ring-1 ring-foreground/5 z-50"
      role="listbox"
    >
      {filtered.map((cmd, i) => (
        <button
          key={cmd.command}
          role="option"
          aria-selected={i === activeIndex}
          className={cn(
            'flex w-full items-baseline gap-3 px-3 py-2 text-left text-sm transition-colors',
            i === activeIndex
              ? 'bg-accent text-accent-foreground'
              : 'text-foreground hover:bg-accent/50',
          )}
          onMouseEnter={() => setActiveIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault(); // Keep textarea focus
            onSelect(cmd);
          }}
        >
          <span className="font-mono font-medium text-primary shrink-0">{cmd.command}</span>
          <span className="text-muted-foreground truncate">{cmd.description}</span>
          {cmd.argHint && (
            <span className="ml-auto text-xs text-muted-foreground/60 shrink-0">{cmd.argHint}</span>
          )}
        </button>
      ))}
    </div>
  );
});
