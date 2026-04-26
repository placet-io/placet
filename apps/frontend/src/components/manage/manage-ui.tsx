import { type ReactNode } from 'react';
import { Construction } from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import { cn } from '@/lib/utils';

/**
 * Shared primitives for /manage/* pages. Keep page files thin by reusing
 * these building blocks; domain-specific components should live alongside
 * their page instead of bloating this module.
 */

interface ManageCardProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Removes default body padding (useful when body is a table). */
  flush?: boolean;
}

/**
 * Surface card used for lists, forms and rich content on /manage. Matches
 * the Logs page chrome (`bg-card rounded-2xl border`) for consistency.
 */
export function ManageCard({
  title,
  actions,
  children,
  className,
  bodyClassName,
  flush = false,
}: ManageCardProps) {
  return (
    <div
      className={cn(
        'bg-card rounded-2xl shadow-xs border border-border/50 overflow-hidden',
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-4 md:px-5 py-3 border-b border-border/50">
          {title && <div className="text-sm font-semibold text-foreground truncate">{title}</div>}
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={cn(!flush && 'p-4 md:p-5', bodyClassName)}>{children}</div>
    </div>
  );
}

interface ManageSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Vertical section used to group cards under a heading. Heading sits on
 * the background (no card chrome) so multiple sections can breathe.
 */
export function ManageSection({
  title,
  description,
  actions,
  children,
  className,
}: ManageSectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {title}
              </h2>
            )}
            {description && <p className="text-sm text-muted-foreground/80 mt-1">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

type StatTone = 'muted' | 'ok' | 'error' | 'primary';

interface ManageStatTileProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  className?: string;
}

const TONE_CLASS: Record<StatTone, string> = {
  muted: 'text-foreground',
  ok: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-destructive',
  primary: 'text-primary',
};

export function ManageStatTile({
  label,
  value,
  hint,
  tone = 'muted',
  className,
}: ManageStatTileProps) {
  return (
    <div
      className={cn('bg-card rounded-2xl shadow-xs border border-border/50 px-4 py-3', className)}
    >
      <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider truncate">
        {label}
      </p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums truncate', TONE_CLASS[tone])}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground truncate">{hint}</p>}
    </div>
  );
}

/**
 * Placeholder content for list cards where real data is not yet wired.
 * Keeps layout stable while we iterate.
 */
export function ManageEmptyState({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-10 px-4">
      {Icon && <Icon size={24} className="text-muted-foreground/70" />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground max-w-sm">{description}</p>}
      {action}
    </div>
  );
}

/**
 * Full-page stub rendered inside ManagePane. Used for sub-pages whose
 * real logic has not landed yet so they are still navigable and visibly
 * consistent with the rest of the /manage UI.
 */
export function ManageStubPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <ManagePane title={title} subtitle={subtitle}>
      <ManageCard>
        <ManageEmptyState
          icon={Construction}
          title="Coming soon"
          description="This page is scaffolded; wiring is on the roadmap."
        />
      </ManageCard>
      {children}
    </ManagePane>
  );
}
