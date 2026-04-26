'use client';

import { useCallback, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface PillSwitchOption<V extends string = string> {
  value: V;
  label: React.ReactNode;
  title?: string;
}

interface PillSwitchProps<V extends string = string> {
  value: V;
  onChange: (value: V) => void;
  options: PillSwitchOption<V>[];
  /** Size of the inner items. `sm` is used for tight inline controls. */
  size?: 'sm' | 'md';
  className?: string;
  itemClassName?: string;
  'aria-label'?: string;
}

/**
 * Pill-shaped segmented control. Rounded-full capsule with an inner
 * rounded-full filled pill on the active item. Used for time-window pickers,
 * transport selectors, schedule modes, etc. across the management surfaces.
 *
 * Implements WAI-ARIA `radiogroup` keyboard semantics: roving tabindex on the
 * checked option, ArrowLeft/ArrowRight (and Up/Down) move and activate the
 * neighbour, Home/End jump to the ends.
 */
export function PillSwitch<V extends string = string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  itemClassName,
  ...aria
}: PillSwitchProps<V>) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const focusAndSelect = useCallback(
    (idx: number) => {
      const opt = options[idx];
      if (!opt) return;
      onChange(opt.value);
      // Defer focus until after re-render so the new tabindex=0 button exists.
      queueMicrotask(() => buttonsRef.current[idx]?.focus());
    },
    [onChange, options],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
      let next: number | null = null;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          next = (idx + 1) % options.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          next = (idx - 1 + options.length) % options.length;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = options.length - 1;
          break;
      }
      if (next !== null) {
        e.preventDefault();
        focusAndSelect(next);
      }
    },
    [focusAndSelect, options.length],
  );

  return (
    <div
      role="radiogroup"
      aria-label={aria['aria-label']}
      className={cn(
        'inline-flex items-center rounded-full bg-foreground/6 dark:bg-muted p-1',
        className,
      )}
    >
      {options.map((opt, idx) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              buttonsRef.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={cn(
              'h-7 rounded-full text-sm font-medium transition-colors',
              size === 'sm' ? 'px-2.5' : 'px-3',
              active
                ? 'bg-background text-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              itemClassName,
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
