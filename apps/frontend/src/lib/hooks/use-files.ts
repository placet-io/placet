'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Attachment } from '@humanproxy/shared';
import { api } from '@/lib/api';

interface AttachmentWithChannel extends Attachment {
  message: { channelId: string; createdAt: string };
}

interface FilesResponse {
  data: AttachmentWithChannel[];
  nextCursor: string | null;
}

const PAGE_SIZE = 30;

export function useFiles(filters: { type?: string; agentId?: string; search?: string }) {
  const [files, setFiles] = useState<AttachmentWithChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    if (filters.type && filters.type !== 'all') params.set('type', filters.type);
    if (filters.agentId) params.set('agent', filters.agentId);
    if (filters.search) params.set('search', filters.search);
    return params;
  }, [filters.type, filters.agentId, filters.search]);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      const params = buildQuery();
      const res = await api<FilesResponse>(`/api/files?${params.toString()}`);
      setFiles(res.data);
      cursorRef.current = res.nextCursor ?? null;
      setHasMore(!!res.nextCursor);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  const loadMore = useCallback(async () => {
    if (!cursorRef.current || loadingMore) return;
    try {
      setLoadingMore(true);
      const params = buildQuery();
      params.set('cursor', cursorRef.current);
      const res = await api<FilesResponse>(`/api/files?${params.toString()}`);
      setFiles((prev) => [...prev, ...res.data]);
      cursorRef.current = res.nextCursor ?? null;
      setHasMore(!!res.nextCursor);
    } catch {
      // Silently fail — user can retry
    } finally {
      setLoadingMore(false);
    }
  }, [buildQuery, loadingMore]);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  const deleteFile = useCallback(async (id: string) => {
    await api(`/api/files/${id}`, { method: 'DELETE' });
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const deleteFiles = useCallback(async (ids: string[]) => {
    await api('/api/files/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    const idSet = new Set(ids);
    setFiles((prev) => prev.filter((f) => !idSet.has(f.id)));
  }, []);

  const getDownloadUrl = useCallback((id: string) => {
    return `/api/files/${id}/download`;
  }, []);

  const downloadZip = useCallback(async (ids: string[]) => {
    const res = await fetch('/api/files/bulk-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'files.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  return {
    files,
    loading,
    loadingMore,
    hasMore,
    error,
    refetch: fetchFiles,
    loadMore,
    deleteFile,
    deleteFiles,
    getDownloadUrl,
    downloadZip,
  };
}
