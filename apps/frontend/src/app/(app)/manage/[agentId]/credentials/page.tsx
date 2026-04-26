'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Key,
  Save,
  Trash2,
  Plus,
  Loader2,
  RefreshCw,
  X,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import { ManageCard, ManageEmptyState } from '@/components/manage/manage-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { manageApi } from '@/components/manage/manage-api';

interface SecretItem {
  key: string;
  hasValue: boolean;
  masked: string;
  exposed: boolean;
}

interface ListResponse {
  items: SecretItem[];
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export default function AgentCredentialsPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [items, setItems] = useState<SecretItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await manageApi<ListResponse>(agentId, 'credentials');
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load secrets');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => [...items].sort((a, b) => a.key.localeCompare(b.key)), [items]);

  const upsertLocal = (next: SecretItem) =>
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.key === next.key);
      if (idx === -1) return [...prev, next];
      const copy = prev.slice();
      copy[idx] = next;
      return copy;
    });

  const removeLocal = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));

  return (
    <ManagePane
      title="Secrets"
      backHref="/manage"
      subtitle="Credentials and API keys. Stored values are never returned — they can only be set, replaced, or removed."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setAdding(true)}
            className="gap-1.5"
            disabled={adding}
          >
            <Plus size={14} /> New secret
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => void load()}
            disabled={loading}
            title="Refresh"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </Button>
        </div>
      }
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      {adding && (
        <NewSecretCard
          agentId={agentId}
          existing={sorted.map((i) => i.key)}
          onCancel={() => setAdding(false)}
          onCreated={(item) => {
            upsertLocal(item);
            setAdding(false);
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {!loading && sorted.length === 0 && !adding && (
        <ManageCard className="border-dashed">
          <ManageEmptyState
            icon={Key}
            title="No secrets yet"
            description="Add a secret to give this agent access to an API key or token."
          />
        </ManageCard>
      )}

      {sorted.map((item) => (
        <SecretCard
          key={item.key}
          agentId={agentId}
          item={item}
          onUpdated={upsertLocal}
          onDeleted={() => removeLocal(item.key)}
          onError={(msg) => setError(msg)}
        />
      ))}
    </ManagePane>
  );
}

// ---------------------------------------------------------------------------
// Existing secret row
// ---------------------------------------------------------------------------

function SecretCard({
  agentId,
  item,
  onUpdated,
  onDeleted,
  onError,
}: {
  agentId: string;
  item: SecretItem;
  onUpdated: (next: SecretItem) => void;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingExposed, setTogglingExposed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = value.length > 0;

  const save = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await manageApi(agentId, `credentials/${encodeURIComponent(item.key)}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      });
      onUpdated({ ...item, hasValue: true });
      setValue('');
      setShowValue(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save secret');
    } finally {
      setSaving(false);
    }
  }, [agentId, item, value, dirty, onUpdated, onError]);

  const toggleExposed = useCallback(
    async (next: boolean) => {
      setTogglingExposed(true);
      try {
        await manageApi(agentId, `credentials/${encodeURIComponent(item.key)}/exposed`, {
          method: 'PUT',
          body: JSON.stringify({ exposed: next }),
        });
        onUpdated({ ...item, exposed: next });
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to update exposure');
      } finally {
        setTogglingExposed(false);
      }
    },
    [agentId, item, onUpdated, onError],
  );

  const remove = useCallback(async () => {
    setDeleting(true);
    try {
      await manageApi(agentId, `credentials/${encodeURIComponent(item.key)}`, {
        method: 'DELETE',
      });
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete secret');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [agentId, item, onDeleted, onError]);

  return (
    <ManageCard
      title={
        <span className="flex items-center gap-2 text-base font-semibold">
          <Key size={16} className="text-muted-foreground" />
          <span className="font-mono">{item.key}</span>
          {item.hasValue && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              <ShieldCheck size={10} /> Set
            </span>
          )}
        </span>
      }
      actions={
        confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">Delete?</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void remove()}
              disabled={deleting}
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : 'Yes'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            title="Delete secret"
          >
            <Trash2 size={14} />
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {/* Value row */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-muted-foreground">
            {item.hasValue ? 'Replace value' : 'Value'}
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Input
                type={showValue ? 'text' : 'password'}
                placeholder={item.hasValue ? '•••••••• (unchanged)' : 'Enter value'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-9 text-sm rounded-md pr-9 font-mono"
                autoComplete="new-password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && dirty) void save();
                }}
              />
              <button
                type="button"
                onClick={() => setShowValue((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title={showValue ? 'Hide' : 'Show'}
                tabIndex={-1}
              >
                {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => void save()}
              disabled={!dirty || saving}
              className="gap-1.5"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Stored values are never returned. Leave blank to keep the existing value.
          </p>
        </div>

        {/* Exposed toggle */}
        <div className="flex items-start justify-between gap-4 rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Expose to shell exec</div>
            <p className="text-sm text-muted-foreground">
              When on, the agent reads <span className="font-mono">{item.key}</span> as an
              environment variable inside the sandbox. Off keeps it strictly server-side.
            </p>
          </div>
          <Switch
            checked={item.exposed}
            onCheckedChange={(v) => void toggleExposed(Boolean(v))}
            disabled={togglingExposed}
          />
        </div>
      </div>
    </ManageCard>
  );
}

// ---------------------------------------------------------------------------
// Inline "new secret" card
// ---------------------------------------------------------------------------

function NewSecretCard({
  agentId,
  existing,
  onCancel,
  onCreated,
  onError,
}: {
  agentId: string;
  existing: string[];
  onCancel: () => void;
  onCreated: (item: SecretItem) => void;
  onError: (msg: string) => void;
}) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [exposed, setExposed] = useState(false);
  const [showValue, setShowValue] = useState(false);
  const [creating, setCreating] = useState(false);

  const keyValid = KEY_RE.test(key);
  const keyExists = existing.includes(key);
  const valueValid = value.length > 0;
  const canCreate = keyValid && !keyExists && valueValid;

  const create = useCallback(async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      await manageApi(agentId, `credentials/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      });
      if (exposed) {
        await manageApi(agentId, `credentials/${encodeURIComponent(key)}/exposed`, {
          method: 'PUT',
          body: JSON.stringify({ exposed: true }),
        });
      }
      onCreated({ key, hasValue: true, masked: '***', exposed });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to create secret');
      setCreating(false);
    }
  }, [agentId, key, value, exposed, canCreate, onCreated, onError]);

  return (
    <ManageCard
      title={
        <span className="flex items-center gap-2 text-base font-semibold">
          <Plus size={16} className="text-muted-foreground" /> New secret
        </span>
      }
      actions={
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={onCancel}
          title="Cancel"
          disabled={creating}
        >
          <X size={14} />
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-muted-foreground">Key</label>
          <Input
            placeholder="e.g. OPENAI_API_KEY"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="h-9 text-sm rounded-md max-w-md font-mono"
            autoFocus
          />
          {key && !keyValid && (
            <p className="text-sm text-destructive">
              Letters, digits, and underscores only. Must start with a letter or underscore.
            </p>
          )}
          {keyValid && keyExists && (
            <p className="text-sm text-destructive">
              A secret named &quot;{key}&quot; already exists.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-muted-foreground">Value</label>
          <div className="relative max-w-md">
            <Input
              type={showValue ? 'text' : 'password'}
              placeholder="Enter value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-9 text-sm rounded-md pr-9 font-mono"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowValue((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title={showValue ? 'Hide' : 'Show'}
              tabIndex={-1}
            >
              {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Expose to shell exec</div>
            <p className="text-sm text-muted-foreground">
              When on, the agent reads this value as an environment variable inside the sandbox.
            </p>
          </div>
          <Switch
            checked={exposed}
            onCheckedChange={(v) => setExposed(Boolean(v))}
            disabled={creating}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            variant="default"
            size="sm"
            onClick={() => void create()}
            disabled={!canCreate || creating}
            className="gap-1.5"
          >
            {creating && <Loader2 size={14} className="animate-spin" />}
            Create
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={creating}>
            Cancel
          </Button>
        </div>
      </div>
    </ManageCard>
  );
}
