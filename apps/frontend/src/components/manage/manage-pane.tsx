import { type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ManagePaneProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * When set, a mobile-only back button is rendered in the header pointing to
   * the given href. Used by nested management pages to return to the agent
   * menu (or one level up, e.g. workspace file → tree).
   */
  backHref?: string;
  backLabel?: string;
}

/**
 * Shared content pane for `/manage/*` routes. Renders content directly on the
 * app background (no card wrapper) to match the chat surface; keeps a sticky
 * header for title/subtitle/actions.
 */
export function ManagePane({
  title,
  subtitle,
  actions,
  children,
  className,
  backHref,
  backLabel = 'Back',
}: ManagePaneProps) {
  return (
    <div className={cn('relative flex h-full min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <div className="sticky top-0 z-10 shrink-0 border-b border-border/50 bg-background/80 backdrop-blur px-4 md:px-8 py-4 md:py-5">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-stretch gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            {backHref && (
              <Link
                href={backHref}
                aria-label={backLabel}
                className="lg:hidden inline-flex shrink-0 items-center justify-center h-9 w-9 -ml-1 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ArrowLeft size={18} />
              </Link>
            )}
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-semibold text-foreground truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-nowrap">
              {actions}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 py-6 md:py-8">
        <div className="mx-auto w-full max-w-6xl space-y-8">{children}</div>
      </div>
    </div>
  );
}
