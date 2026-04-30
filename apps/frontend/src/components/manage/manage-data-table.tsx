'use client';

import { type ReactNode, Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ManageTableColumn<T> {
  key: string;
  header: ReactNode;
  /** Renderer for the cell. Receives the row. */
  cell: (row: T) => ReactNode;
  /** Sort comparator — enables header click to sort. */
  sort?: (a: T, b: T) => number;
  /** Additional td/th className (e.g. widths, alignment). */
  className?: string;
  /** Hide on small screens, only visible on md+. */
  hideOnMobile?: boolean;
}

interface ManageDataTableProps<T> {
  rows: T[];
  columns: ManageTableColumn<T>[];
  /** Stable key per row. */
  rowKey: (row: T) => string;
  pageSize?: number;
  /** Default column key to sort by. */
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  /** Text shown when rows is empty. */
  emptyText?: ReactNode;
  /** Optional row click handler — makes the row a button. */
  onRowClick?: (row: T) => void;
  /** Optional renderer for an expandable detail row shown beneath the row. */
  expandedContent?: (row: T) => ReactNode;
  /** When ``true`` (and ``expandedContent`` is set), the chevron column and
   * the expanded row are only rendered on mobile (md and below). On desktop
   * the row is not clickable. */
  expandedOnMobileOnly?: boolean;
  /** Optional loading flag to dim the body. */
  loading?: boolean;
  className?: string;
  /**
   * Enable server-side sorting. When provided, the table stops sorting rows
   * locally and instead calls this handler whenever the user clicks a
   * sortable header. The caller owns ``sortKey`` / ``sortDir`` via
   * ``controlledSort``.
   */
  onSortChange?: (key: string, dir: 'asc' | 'desc') => void;
  /** Current sort state when using server-side sorting. */
  controlledSort?: { key: string | null; dir: 'asc' | 'desc' };
}

/**
 * Reusable table for /manage list pages. Client-side sort + slice pagination.
 * Keep the data shape flat (or pre-denormalize) so comparators stay trivial.
 */
export function ManageDataTable<T>({
  rows,
  columns,
  rowKey,
  pageSize = 20,
  defaultSortKey,
  defaultSortDir = 'desc',
  emptyText = 'No entries.',
  onRowClick,
  expandedContent,
  expandedOnMobileOnly = false,
  loading,
  className,
  onSortChange,
  controlledSort,
}: ManageDataTableProps<T>) {
  const controlled = !!onSortChange;
  const [localSortKey, setLocalSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [localSortDir, setLocalSortDir] = useState<'asc' | 'desc'>(defaultSortDir);
  const sortKey = controlled ? (controlledSort?.key ?? null) : localSortKey;
  const sortDir = controlled ? (controlledSort?.dir ?? 'desc') : localSortDir;
  const [page, setPage] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const sortable = useMemo(
    () =>
      new Map(
        columns
          // In controlled mode a column is sortable whenever the caller
          // provides a ``sort`` comparator OR marks it sortable via its key.
          .filter((c) => !!c.sort)
          .map((c) => [c.key, c.sort!]),
      ),
    [columns],
  );

  const sorted = useMemo(() => {
    if (controlled) return rows;
    if (!sortKey) return rows;
    const cmp = sortable.get(sortKey);
    if (!cmp) return rows;
    const copy = rows.slice();
    copy.sort(sortDir === 'asc' ? cmp : (a, b) => cmp(b, a));
    return copy;
  }, [rows, sortKey, sortDir, sortable, controlled]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = useMemo(
    () => sorted.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [sorted, safePage, pageSize],
  );

  const toggleSort = (key: string) => {
    if (!sortable.has(key)) return;
    const nextDir: 'asc' | 'desc' = sortKey === key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc';
    if (controlled) {
      onSortChange?.(key, nextDir);
    } else {
      setLocalSortKey(key);
      setLocalSortDir(nextDir);
    }
    setPage(0);
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground italic">{emptyText}</div>
      ) : (
        <>
          <div className="overflow-x-auto md:overflow-x-visible">
            <table className="w-full text-left text-sm md:table-fixed">
              <thead className="bg-muted/50 text-muted-foreground border-b border-border/50">
                <tr>
                  {expandedContent && (
                    <th aria-hidden className={cn('w-8', expandedOnMobileOnly && 'md:hidden')} />
                  )}
                  {columns.map((c) => {
                    const isSortable = !!c.sort;
                    const isActive = sortKey === c.key;
                    return (
                      <th
                        key={c.key}
                        className={cn(
                          'px-4 md:px-5 py-2.5 font-medium text-sm uppercase tracking-wider',
                          isSortable && 'cursor-pointer select-none',
                          c.hideOnMobile && 'hidden md:table-cell',
                          c.className,
                        )}
                        onClick={() => toggleSort(c.key)}
                      >
                        <span className="inline-flex items-center gap-1">
                          {c.header}
                          {isSortable && isActive ? (
                            sortDir === 'asc' ? (
                              <ChevronUp size={12} />
                            ) : (
                              <ChevronDown size={12} />
                            )
                          ) : null}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className={cn('divide-y divide-border/50', loading && 'opacity-50')}>
                {pageRows.map((row) => {
                  const key = rowKey(row);
                  const expandable = !!expandedContent;
                  const isExpanded = expandable && expandedKey === key;
                  const clickable = expandable || !!onRowClick;
                  const handleClick = () => {
                    if (expandable) {
                      setExpandedKey((prev) => (prev === key ? null : key));
                    }
                    onRowClick?.(row);
                  };
                  return (
                    <Fragment key={key}>
                      <tr
                        onClick={clickable ? handleClick : undefined}
                        className={cn(
                          'transition-colors',
                          clickable && 'cursor-pointer hover:bg-muted/40',
                          expandable &&
                            expandedOnMobileOnly &&
                            'md:cursor-default md:hover:bg-transparent',
                          isExpanded && 'bg-muted/40',
                          isExpanded && expandedOnMobileOnly && 'md:bg-transparent',
                        )}
                      >
                        {expandable && (
                          <td
                            className={cn(
                              'pl-4 pr-0 py-2.5 w-8 text-muted-foreground',
                              expandedOnMobileOnly && 'md:hidden',
                            )}
                          >
                            <ChevronDown
                              size={14}
                              className={cn('transition-transform', !isExpanded && '-rotate-90')}
                            />
                          </td>
                        )}
                        {columns.map((c) => (
                          <td
                            key={c.key}
                            className={cn(
                              'px-4 md:px-5 py-2.5 truncate',
                              c.hideOnMobile && 'hidden md:table-cell',
                              c.className,
                            )}
                          >
                            {c.cell(row)}
                          </td>
                        ))}
                      </tr>
                      {isExpanded && expandedContent && (
                        <tr className={cn('bg-muted/20', expandedOnMobileOnly && 'md:hidden')}>
                          <td colSpan={columns.length + 1} className="px-4 md:px-5 py-3">
                            {expandedContent(row)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 md:px-5 py-2 border-t border-border/50">
              <p className="text-sm text-muted-foreground">
                Page {safePage + 1} of {totalPages} · {sorted.length} entries
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft size={14} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
