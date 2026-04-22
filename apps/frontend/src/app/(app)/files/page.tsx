'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Download,
  Search,
  MoreVertical,
  Trash2,
  Share2,
  Eye,
  X,
  CheckSquare,
  Loader2,
} from 'lucide-react';
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFiles } from '@/lib/hooks/use-files';
import { useAgents } from '@/lib/hooks/use-agents';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/format-date';
import { getFileIcon, formatFileSize } from '@/lib/file-utils';
import { FilePreview } from '@/components/files/file-preview';
import { FileTypeBadge } from '@/components/files/file-type-badge';

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Images' },
  { key: 'application/pdf', label: 'PDFs' },
  { key: 'video', label: 'Videos' },
  { key: 'audio', label: 'Audio' },
] as const;

export default function FilesPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareExpiresIn, setShareExpiresIn] = useState<number | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const { agents } = useAgents();
  const {
    files,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    deleteFile,
    deleteFiles,
    getDownloadUrl,
    downloadZip,
  } = useFiles({
    type: typeFilter !== 'all' ? typeFilter : undefined,
    agentId: agentFilter || undefined,
    search: debouncedSearch || undefined,
  });

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  }, []);

  // Agent name lookup
  const agentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) map.set(a.id, a.name);
    return map;
  }, [agents]);

  // Selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === files.length) return new Set();
      return new Set(files.map((f) => f.id));
    });
  }, [files]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selected.size === 0) return;
    await deleteFiles([...selected]);
    exitSelectMode();
  }, [selected, deleteFiles, exitSelectMode]);

  const handleBulkDownload = useCallback(async () => {
    if (selected.size === 0) return;
    if (selected.size === 1) {
      window.open(getDownloadUrl([...selected][0]), '_blank');
      return;
    }
    await downloadZip([...selected]);
  }, [selected, getDownloadUrl, downloadZip]);

  const handleShare = useCallback(async (id: string) => {
    try {
      const data = await api<{ url: string; expiresIn: number }>(`/api/files/${id}/share`);
      setShareUrl(data.url);
      setShareExpiresIn(data.expiresIn);
      setShareDialogOpen(true);
    } catch {
      // silently fail
    }
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteFile(id);
      if (previewFileId === id) setPreviewFileId(null);
    },
    [deleteFile, previewFileId],
  );

  const handleDownload = useCallback(
    (id: string) => {
      window.open(getDownloadUrl(id), '_blank');
    },
    [getDownloadUrl],
  );

  const previewFile = files.find((f) => f.id === previewFileId);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-card lg:rounded-2xl shadow-xs border border-border/50 border-t-0 border-b-0 lg:border p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <MobileNavDrawer />
          <h1 className="text-xl md:text-3xl font-semibold md:font-bold text-foreground">Files</h1>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search files..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
          <div className="flex gap-2">
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? 'all')}>
              <SelectTrigger className="w-[130px] rounded-xl">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_FILTERS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={agentFilter || undefined} onValueChange={(v) => setAgentFilter(v ?? '')}>
              <SelectTrigger className="w-[160px] rounded-xl">
                <SelectValue placeholder="All chats" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All chats</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!selectMode ? (
              <Button
                variant="outline"
                size="icon"
                className="rounded-xl"
                onClick={() => setSelectMode(true)}
              >
                <CheckSquare size={16} />
              </Button>
            ) : (
              <Button variant="outline" size="icon" className="rounded-xl" onClick={exitSelectMode}>
                <X size={16} />
              </Button>
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {selectMode && selected.size > 0 && (
          <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-muted/50 border border-border">
            <Checkbox
              checked={selected.size === files.length && files.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={handleBulkDownload}
              >
                <Download size={14} className="mr-1" /> Download
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="rounded-xl"
                onClick={handleBulkDelete}
              >
                <Trash2 size={14} className="mr-1" /> Delete
              </Button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {/* File Grid */}
        {!loading && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {files.map((file) => {
                const Icon = getFileIcon(file.mimeType, file.filename);
                const isSelected = selected.has(file.id);
                return (
                  <div
                    key={file.id}
                    className="relative flex items-center p-4 rounded-2xl bg-muted/30 border border-border hover:border-primary/50 transition-all group cursor-pointer"
                    onClick={() => (selectMode ? toggleSelect(file.id) : setPreviewFileId(file.id))}
                  >
                    {selectMode && (
                      <div className="mr-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(file.id)}
                        />
                      </div>
                    )}
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-background border border-border mr-3 shrink-0">
                      <Icon size={20} className="text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm text-foreground truncate">
                        {file.filename}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {agentMap.get(file.message?.channelId ?? '') ?? 'Unknown'} &middot;{' '}
                        {formatFileSize(file.size)} &middot; {formatRelativeTime(file.createdAt)}
                      </p>
                    </div>
                    {!selectMode && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <MoreVertical size={16} />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setPreviewFileId(file.id)}>
                              <Eye size={14} className="mr-2" /> Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownload(file.id)}>
                              <Download size={14} className="mr-2" /> Download
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void handleShare(file.id)}>
                              <Share2 size={14} className="mr-2" /> Share link
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleDelete(file.id)}
                            >
                              <Trash2 size={14} className="mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Empty state */}
            {files.length === 0 && (
              <p className="py-16 text-center text-sm text-muted-foreground">No files found</p>
            )}

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center mt-6">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                  Load more
                </Button>
              </div>
            )}
          </>
        )}

        {/* Preview Dialog */}
        <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFileId(null)}>
          {previewFile && (
            <DialogContent className="w-[90vw] sm:max-w-6xl max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="truncate">{previewFile.filename}</DialogTitle>
              </DialogHeader>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                <FileTypeBadge mimeType={previewFile.mimeType} filename={previewFile.filename} />
                <span>{formatFileSize(previewFile.size)}</span>
                <span>&middot;</span>
                <span>{agentMap.get(previewFile.message?.channelId ?? '') ?? 'Unknown'}</span>
                <span>&middot;</span>
                <span>{formatRelativeTime(previewFile.createdAt)}</span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto rounded-xl bg-muted/30 border border-border flex items-center justify-center p-4">
                <FilePreview
                  mimeType={previewFile.mimeType}
                  fileId={previewFile.id}
                  filename={previewFile.filename}
                />
              </div>
              <div className="flex gap-2 mt-4 justify-center">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon"
                        className="rounded-xl"
                        onClick={() => handleDownload(previewFile.id)}
                      >
                        <Download size={16} />
                      </Button>
                    }
                  />
                  <TooltipContent>Download</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon"
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => void handleShare(previewFile.id)}
                      >
                        <Share2 size={16} />
                      </Button>
                    }
                  />
                  <TooltipContent>Share</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon"
                        variant="destructive"
                        className="rounded-xl"
                        onClick={() => handleDelete(previewFile.id)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    }
                  />
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </div>
            </DialogContent>
          )}
        </Dialog>

        {/* Share URL Dialog */}
        <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Share Link</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground mb-2">
              Download link — no login required.
              {shareExpiresIn != null && (
                <>
                  {' '}
                  Expires in{' '}
                  <span className="font-medium text-foreground">
                    {shareExpiresIn >= 3600
                      ? `${Math.round(shareExpiresIn / 3600)}h`
                      : `${Math.round(shareExpiresIn / 60)}m`}
                  </span>
                  .
                </>
              )}
            </p>
            <div className="flex gap-2">
              <Input value={shareUrl ?? ''} readOnly className="rounded-xl text-xs font-mono" />
              <Button
                variant="outline"
                className="shrink-0 rounded-xl"
                onClick={() => {
                  if (shareUrl) void navigator.clipboard.writeText(shareUrl);
                }}
              >
                Copy
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
