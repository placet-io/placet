'use client';

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
  return (
    <div
      role="radiogroup"
      aria-label={aria['aria-label']}
      className={cn(
        // In light mode `bg-muted` is too close to the page background, so
        // use a translucent foreground tint that stays visible on white.
        // Dark mode keeps the solid muted track.
        'inline-flex items-center rounded-full bg-foreground/6 dark:bg-muted p-1',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
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
