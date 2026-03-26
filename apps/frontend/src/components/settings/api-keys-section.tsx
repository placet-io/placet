'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import { Key, Plus, Trash2, Copy, Check, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ApiKey, CreateApiKeyResponse } from '@humanproxy/shared';

export const ApiKeysSection = memo(function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const data = await api<ApiKey[]>('/api/api-keys');
      setKeys(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  const handleCreate = useCallback(async () => {
    if (creating) return;
    try {
      setCreating(true);
      setError(null);
      const res = await api<CreateApiKeyResponse>('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ label: newLabel || 'Default' }),
      });
      setNewKey(res.key);
      setNewLabel('');
      setShowCreate(false);
      void fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setCreating(false);
    }
  }, [creating, newLabel, fetchKeys]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (deletingId) return;
      try {
        setDeletingId(id);
        setError(null);
        await api(`/api/api-keys/${id}`, { method: 'DELETE' });
        setKeys((prev) => prev.filter((k) => k.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete key');
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId],
  );

  const handleCopy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Key className="text-muted-foreground" size={24} />
          <h2 className="text-xl font-semibold text-foreground">API Keys</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => {
            setShowCreate(true);
            setNewKey(null);
          }}
        >
          <Plus size={16} className="mr-1" />
          New Key
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        API keys authenticate your agents. Use{' '}
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">Bearer hp_...</code> in the
        Authorization header.
      </p>

      {error && (
        <div className="flex items-center gap-2 text-sm text-error-foreground bg-error-muted rounded-lg px-4 py-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* New key reveal banner */}
      {newKey && (
        <div className="bg-success-muted border border-success/15 rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-success-foreground">
            Key created! Copy it now — it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-background rounded-lg px-3 py-2 font-mono truncate border">
              {newKey}
            </code>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => handleCopy(newKey)}
            >
              {copied ? (
                <Check size={16} className="text-success-foreground" />
              ) : (
                <Copy size={16} />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="Key label (e.g. CI Pipeline)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="rounded-xl"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
          />
          <Button
            className="rounded-xl shrink-0"
            onClick={() => void handleCreate()}
            disabled={creating}
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : 'Create'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => setShowCreate(false)}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Keys list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No API keys yet. Create one to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between bg-muted/30 rounded-xl border border-border px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-foreground truncate">
                    {k.label || 'Unnamed'}
                  </span>
                  <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {k.keyPrefix}...
                  </code>
                </div>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(k.createdAt).toLocaleDateString()}
                  {k.lastUsedAt && <> · Last used {new Date(k.lastUsedAt).toLocaleDateString()}</>}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'shrink-0 text-muted-foreground hover:text-error-foreground',
                  deletingId === k.id && 'pointer-events-none opacity-50',
                )}
                onClick={() => void handleDelete(k.id)}
              >
                {deletingId === k.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
