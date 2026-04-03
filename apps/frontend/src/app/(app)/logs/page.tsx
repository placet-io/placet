'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { LogRow } from '@/components/logs/log-row';
import type { ApiLog, PaginatedResponse } from '@placet/shared';

const PAGE_SIZE = 25;

export default function LogsPage() {
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);

  const fetchPage = useCallback(async (cursor: string | null) => {
    try {
      setLoading(true);
      const qs = cursor
        ? `/api/logs?limit=${PAGE_SIZE}&cursor=${cursor}`
        : `/api/logs?limit=${PAGE_SIZE}`;
      const res = await api<PaginatedResponse<ApiLog>>(qs);
      setLogs(res.data);
      setHasNext(!!res.nextCursor);
      return res.nextCursor ?? null;
    } catch {
      setLogs([]);
      setHasNext(false);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPage(null);
  }, [fetchPage]);

  const refresh = useCallback(() => {
    setPage(0);
    setCursors([null]);
    void fetchPage(null);
  }, [fetchPage]);

  const goNext = useCallback(async () => {
    if (!hasNext || loading) return;
    const lastLog = logs[logs.length - 1];
    if (!lastLog) return;
    const nextCursor = await fetchPage(lastLog.id);
    const nextPage = page + 1;
    setPage(nextPage);
    setCursors((prev) => {
      const updated = [...prev];
      updated[nextPage + 1] = nextCursor;
      return updated;
    });
  }, [hasNext, loading, logs, page, fetchPage]);

  const goPrev = useCallback(async () => {
    if (page <= 0 || loading) return;
    const prevPage = page - 1;
    await fetchPage(cursors[prevPage] ?? null);
    setPage(prevPage);
  }, [page, loading, cursors, fetchPage]);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-card rounded-t-3xl lg:rounded-b-3xl shadow-sm border border-border/50 border-b-0 lg:border-b p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 md:mb-8">
          <div className="flex items-center gap-2">
            <MobileNavDrawer />
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">API Logs</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>

        {/* Loading */}
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground text-sm">
            No API logs yet. Logs appear when agents make API requests.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-muted/30 rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-6 py-3.5 font-medium">Time</th>
                    <th className="px-6 py-3.5 font-medium">Method</th>
                    <th className="px-6 py-3.5 font-medium">Endpoint</th>
                    <th className="px-6 py-3.5 font-medium">Status</th>
                    <th className="px-6 py-3.5 font-medium">Latency</th>
                    <th className="px-4 py-3.5 font-medium w-16" />
                  </tr>
                </thead>
                <tbody className={cn('divide-y divide-border', loading && 'opacity-50')}>
                  {logs.map((log) => (
                    <LogRow key={log.id} log={log} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className={cn('md:hidden space-y-2', loading && 'opacity-50')}>
              {logs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-muted-foreground">Page {page + 1}</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void goPrev()}
                  disabled={page === 0 || loading}
                >
                  <ChevronLeft size={16} />
                  <span className="hidden sm:inline ml-1">Previous</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void goNext()}
                  disabled={!hasNext || loading}
                >
                  <span className="hidden sm:inline mr-1">Next</span>
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
