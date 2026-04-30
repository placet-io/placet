'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Save,
  Trash2,
  Plus,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  ShieldCheck,
  Link2,
  AlertTriangle,
  ExternalLink,
  Copy,
} from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import { ManageCard, ManageSection } from '@/components/manage/manage-ui';
import { ManageDataTable, type ManageTableColumn } from '@/components/manage/manage-data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { manageApi } from '@/components/manage/manage-api';
import { ApiError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SecretItem {
  key: string;
  hasValue: boolean;
  masked: string;
  exposed: boolean;
}

interface ProviderItem {
  name: string;
  label: string;
  envKey: string;
  isOauth: boolean;
  isLocal: boolean;
  isDirect: boolean;
  hasValue: boolean;
  masked: string;
}

interface SecretListResponse {
  items: SecretItem[];
}
interface ProviderListResponse {
  items: ProviderItem[];
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentCredentialsPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [secrets, setSecrets] = useState<SecretItem[]>([]);
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [secretDialog, setSecretDialog] = useState(false);
  const [providerDialog, setProviderDialog] = useState(false);
  const [oauthLogin, setOauthLogin] = useState<ProviderItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([
        manageApi<SecretListResponse>(agentId, 'credentials'),
        manageApi<ProviderListResponse>(agentId, 'credentials/providers'),
      ]);
      setSecrets(s.items ?? []);
      setProviders(p.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load credentials');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedSecrets = useMemo(
    () => [...secrets].sort((a, b) => a.key.localeCompare(b.key)),
    [secrets],
  );
  // Only show providers with a credential set or OAuth-connected.
  const sortedProviders = useMemo(
    () => providers.filter((p) => p.hasValue).sort((a, b) => a.label.localeCompare(b.label)),
    [providers],
  );

  const upsertSecret = (next: SecretItem) =>
    setSecrets((prev) => {
      const idx = prev.findIndex((i) => i.key === next.key);
      if (idx === -1) return [...prev, next];
      const copy = prev.slice();
      copy[idx] = next;
      return copy;
    });
  const removeSecret = (key: string) => setSecrets((prev) => prev.filter((i) => i.key !== key));

  const updateProvider = (next: ProviderItem) =>
    setProviders((prev) => prev.map((p) => (p.name === next.name ? next : p)));

  // --- Provider table -----------------------------------------------------

  const providerColumns: ManageTableColumn<ProviderItem>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Provider',
        className: 'font-medium',
        sort: (a, b) => a.label.localeCompare(b.label),
        cell: (r) => (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{r.label}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              <ShieldCheck size={10} />
              {r.isOauth ? 'Connected' : 'Set'}
            </span>
          </span>
        ),
      },
      {
        key: 'value',
        header: 'API key / connection',
        hideOnMobile: true,
        className: 'whitespace-normal',
        cell: (r) =>
          r.isOauth ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <Link2 size={12} /> Connected
            </span>
          ) : (
            <KeyInputCell
              hasValue={r.hasValue}
              onSave={async (value) => {
                await manageApi(agentId, `credentials/providers/${encodeURIComponent(r.name)}`, {
                  method: 'PUT',
                  body: JSON.stringify({ value }),
                });
                updateProvider({ ...r, hasValue: true, masked: '***' });
              }}
              onError={setError}
            />
          ),
      },
      {
        key: 'env',
        header: 'Env var',
        hideOnMobile: true,
        className: 'md:w-44 whitespace-nowrap font-mono text-sm text-muted-foreground',
        cell: (r) => <span className="truncate block">{r.envKey || '—'}</span>,
      },
      {
        key: 'actions',
        header: '',
        hideOnMobile: true,
        className: 'md:w-12 text-right whitespace-nowrap md:!pr-2',
        cell: (r) => (
          <DeleteButton
            label={r.isOauth ? 'Disconnect' : 'Delete key'}
            onConfirm={() =>
              manageApi(agentId, `credentials/providers/${encodeURIComponent(r.name)}`, {
                method: 'DELETE',
              })
            }
            onDeleted={() => updateProvider({ ...r, hasValue: false, masked: '' })}
            onError={setError}
          />
        ),
      },
    ],
    [agentId],
  );

  // --- Secrets table ------------------------------------------------------

  const secretColumns: ManageTableColumn<SecretItem>[] = useMemo(
    () => [
      {
        key: 'key',
        header: 'Key',
        className: 'font-mono text-sm',
        sort: (a, b) => a.key.localeCompare(b.key),
        cell: (r) => (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{r.key}</span>
            {r.hasValue && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                <ShieldCheck size={10} /> Set
              </span>
            )}
          </span>
        ),
      },
      {
        key: 'value',
        header: 'API key / connection',
        hideOnMobile: true,
        className: 'whitespace-normal',
        cell: (r) => (
          <KeyInputCell
            hasValue={r.hasValue}
            onSave={async (value) => {
              await manageApi(agentId, `credentials/${encodeURIComponent(r.key)}`, {
                method: 'PUT',
                body: JSON.stringify({ value }),
              });
              upsertSecret({ ...r, hasValue: true });
            }}
            onError={setError}
          />
        ),
      },
      {
        key: 'exposed',
        header: 'Exec env',
        hideOnMobile: true,
        className: 'md:w-44 whitespace-nowrap text-right',
        cell: (r) => (
          <ExposedSwitch agentId={agentId} item={r} onUpdated={upsertSecret} onError={setError} />
        ),
      },
      {
        key: 'actions',
        header: '',
        hideOnMobile: true,
        className: 'md:w-12 text-right whitespace-nowrap md:!pr-2',
        cell: (r) => (
          <DeleteButton
            label="Delete secret"
            onConfirm={() =>
              manageApi(agentId, `credentials/${encodeURIComponent(r.key)}`, { method: 'DELETE' })
            }
            onDeleted={() => removeSecret(r.key)}
            onError={setError}
          />
        ),
      },
    ],
    [agentId],
  );

  return (
    <ManagePane
      title="Credentials"
      backHref="/manage"
      subtitle="LLM provider keys and generic secrets. Stored values are never returned — they can only be set, replaced, or removed."
      actions={
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
      }
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      <ManageSection
        title="LLM Providers"
        actions={
          <Button
            variant="default"
            size="sm"
            onClick={() => setProviderDialog(true)}
            className="gap-1.5"
          >
            <Plus size={14} /> New provider key
          </Button>
        }
      >
        <ManageCard flush>
          <ManageDataTable<ProviderItem>
            rows={sortedProviders}
            columns={providerColumns}
            rowKey={(r) => r.name}
            pageSize={20}
            loading={loading}
            expandedOnMobileOnly
            expandedContent={(r) => (
              <div className="space-y-3">
                {r.isOauth ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    <Link2 size={12} /> Connected
                  </span>
                ) : (
                  <KeyInputCell
                    hasValue={r.hasValue}
                    onSave={async (value) => {
                      await manageApi(
                        agentId,
                        `credentials/providers/${encodeURIComponent(r.name)}`,
                        { method: 'PUT', body: JSON.stringify({ value }) },
                      );
                      updateProvider({ ...r, hasValue: true, masked: '***' });
                    }}
                    onError={setError}
                  />
                )}
                <div className="text-sm text-muted-foreground">
                  Env var: <span className="font-mono">{r.envKey || '—'}</span>
                </div>
                <div className="flex justify-end">
                  <DeleteButton
                    label={r.isOauth ? 'Disconnect' : 'Delete key'}
                    variant="full"
                    onConfirm={() =>
                      manageApi(agentId, `credentials/providers/${encodeURIComponent(r.name)}`, {
                        method: 'DELETE',
                      })
                    }
                    onDeleted={() => updateProvider({ ...r, hasValue: false, masked: '' })}
                    onError={setError}
                  />
                </div>
              </div>
            )}
            emptyText={loading ? 'Loading providers…' : 'No provider credentials configured yet.'}
          />
        </ManageCard>
      </ManageSection>

      <ManageSection
        title="Secrets"
        actions={
          <Button
            variant="default"
            size="sm"
            onClick={() => setSecretDialog(true)}
            className="gap-1.5"
          >
            <Plus size={14} /> New secret
          </Button>
        }
      >
        <ManageCard flush>
          <ManageDataTable<SecretItem>
            rows={sortedSecrets}
            columns={secretColumns}
            rowKey={(r) => r.key}
            pageSize={20}
            loading={loading}
            expandedOnMobileOnly
            expandedContent={(r) => (
              <div className="space-y-3">
                <KeyInputCell
                  hasValue={r.hasValue}
                  onSave={async (value) => {
                    await manageApi(agentId, `credentials/${encodeURIComponent(r.key)}`, {
                      method: 'PUT',
                      body: JSON.stringify({ value }),
                    });
                    upsertSecret({ ...r, hasValue: true });
                  }}
                  onError={setError}
                />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Expose to exec sandbox</span>
                  <ExposedSwitch
                    agentId={agentId}
                    item={r}
                    onUpdated={upsertSecret}
                    onError={setError}
                  />
                </div>
                <div className="flex justify-end">
                  <DeleteButton
                    label="Delete secret"
                    onConfirm={() =>
                      manageApi(agentId, `credentials/${encodeURIComponent(r.key)}`, {
                        method: 'DELETE',
                      })
                    }
                    onDeleted={() => removeSecret(r.key)}
                    onError={setError}
                  />
                </div>
              </div>
            )}
            emptyText={
              loading ? 'Loading secrets…' : 'No secrets yet. Click "New secret" to add one.'
            }
          />
        </ManageCard>
      </ManageSection>

      <NewSecretDialog
        agentId={agentId}
        open={secretDialog}
        onClose={() => setSecretDialog(false)}
        existing={sortedSecrets.map((s) => s.key)}
        onCreated={(item) => {
          upsertSecret(item);
          setSecretDialog(false);
        }}
        onConflict={(key) => {
          setSecretDialog(false);
          setConflict(`A secret named "${key}" already exists. Edit it directly in the table.`);
        }}
      />

      <NewProviderDialog
        agentId={agentId}
        open={providerDialog}
        onClose={() => setProviderDialog(false)}
        providers={providers}
        onCreated={(item) => {
          updateProvider(item);
          setProviderDialog(false);
        }}
        onConflict={(name) => {
          setProviderDialog(false);
          const p = providers.find((x) => x.name === name);
          setConflict(
            `${p?.label ?? name} already has a credential set. Edit it directly in the table.`,
          );
        }}
        onStartOauth={(p) => {
          setProviderDialog(false);
          setOauthLogin(p);
        }}
      />

      <OauthLoginDialog
        agentId={agentId}
        provider={oauthLogin}
        onClose={() => setOauthLogin(null)}
        onConnected={() => {
          setOauthLogin(null);
          void load();
        }}
      />

      <ConflictDialog message={conflict} onClose={() => setConflict(null)} />
    </ManagePane>
  );
}

// ---------------------------------------------------------------------------
// Shared input cell — reused by both provider rows (non-OAuth) and secret rows
// ---------------------------------------------------------------------------

function KeyInputCell({
  hasValue,
  onSave,
  onError,
}: {
  hasValue: boolean;
  onSave: (value: string) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = value.length > 0;

  const save = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await onSave(value);
      setValue('');
      setShowValue(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [value, dirty, onSave, onError]);

  return (
    <span className="inline-flex w-full items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <span className="relative flex-1 min-w-0">
        <Input
          type={showValue ? 'text' : 'password'}
          placeholder={hasValue ? '•••••••• (unchanged)' : 'Enter value'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 pr-8 font-mono text-sm"
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
          {showValue ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      </span>
      <Button
        variant="default"
        size="sm"
        className="h-8 gap-1"
        onClick={() => void save()}
        disabled={!dirty || saving}
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
        Save
      </Button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Generic delete button (icon by default; full-button form for expand panel)
// ---------------------------------------------------------------------------

function DeleteButton({
  label,
  onConfirm,
  onDeleted,
  onError,
  variant = 'icon',
}: {
  label: string;
  onConfirm: () => Promise<unknown>;
  onDeleted: () => void;
  onError: (msg: string) => void;
  variant?: 'icon' | 'full';
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const remove = useCallback(async () => {
    setBusy(true);
    try {
      await onConfirm();
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete');
      setBusy(false);
      setConfirm(false);
    }
  }, [onConfirm, onDeleted, onError]);

  if (confirm) {
    return (
      <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Button variant="destructive" size="sm" onClick={() => void remove()} disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : 'Confirm'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirm(false)} disabled={busy}>
          Cancel
        </Button>
      </span>
    );
  }
  if (variant === 'full') {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          setConfirm(true);
        }}
      >
        <Trash2 size={14} /> {label}
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 rounded-md text-muted-foreground hover:text-destructive"
      onClick={(e) => {
        e.stopPropagation();
        setConfirm(true);
      }}
      title={label}
    >
      <Trash2 size={14} />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Exec-env exposure switch
// ---------------------------------------------------------------------------

function ExposedSwitch({
  agentId,
  item,
  onUpdated,
  onError,
}: {
  agentId: string;
  item: SecretItem;
  onUpdated: (next: SecretItem) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const toggle = useCallback(
    async (next: boolean) => {
      setBusy(true);
      try {
        await manageApi(agentId, `credentials/${encodeURIComponent(item.key)}/exposed`, {
          method: 'PUT',
          body: JSON.stringify({ exposed: next }),
        });
        onUpdated({ ...item, exposed: next });
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to update exposure');
      } finally {
        setBusy(false);
      }
    },
    [agentId, item, onUpdated, onError],
  );
  return (
    <span onClick={(e) => e.stopPropagation()} className="inline-flex">
      <Switch
        checked={item.exposed}
        onCheckedChange={(v) => void toggle(Boolean(v))}
        disabled={busy || !item.hasValue}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// New secret dialog
// ---------------------------------------------------------------------------

function NewSecretDialog({
  agentId,
  open,
  onClose,
  existing,
  onCreated,
  onConflict,
}: {
  agentId: string;
  open: boolean;
  onClose: () => void;
  existing: string[];
  onCreated: (item: SecretItem) => void;
  onConflict: (key: string) => void;
}) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [exposed, setExposed] = useState(false);
  const [showValue, setShowValue] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setKey('');
      setValue('');
      setExposed(false);
      setShowValue(false);
      setErr(null);
    }
  }, [open]);

  const keyValid = KEY_RE.test(key);
  const localDup = existing.includes(key);
  const canCreate = keyValid && !localDup && value.length > 0;

  const create = useCallback(async () => {
    if (!canCreate) return;
    setCreating(true);
    setErr(null);
    try {
      await manageApi(agentId, 'credentials', {
        method: 'POST',
        body: JSON.stringify({ key, value, exposed }),
      });
      onCreated({ key, hasValue: true, masked: '***', exposed });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        onConflict(key);
        return;
      }
      setErr(e instanceof Error ? e.message : 'Failed to create secret');
    } finally {
      setCreating(false);
    }
  }, [agentId, key, value, exposed, canCreate, onCreated, onConflict]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New secret</DialogTitle>
          <DialogDescription>
            Generic secret stored on the agent. Available to skills and tools as{' '}
            <span className="font-mono">${'{credentials.KEY}'}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-muted-foreground">Key</label>
            <Input
              placeholder="e.g. SLACK_WEBHOOK"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="h-9 font-mono text-sm"
              autoFocus
            />
            {key && !keyValid && (
              <p className="text-sm text-destructive">
                Letters, digits, and underscores only. Must start with a letter or underscore.
              </p>
            )}
            {keyValid && localDup && (
              <p className="text-sm text-destructive">
                A secret named &quot;{key}&quot; already exists. Edit it directly in the table.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-muted-foreground">Value</label>
            <div className="relative">
              <Input
                type={showValue ? 'text' : 'password'}
                placeholder="Enter value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-9 pr-9 font-mono text-sm"
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
          <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Expose to exec sandbox</div>
              <p className="text-sm text-muted-foreground">
                Inject as an env var inside the agent&apos;s shell-exec sandbox.
              </p>
            </div>
            <Switch
              checked={exposed}
              onCheckedChange={(v) => setExposed(Boolean(v))}
              disabled={creating}
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={() => void create()}
            disabled={!canCreate || creating}
            className="gap-1.5"
          >
            {creating && <Loader2 size={14} className="animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// New provider dialog
// ---------------------------------------------------------------------------

function NewProviderDialog({
  agentId,
  open,
  onClose,
  providers,
  onCreated,
  onConflict,
  onStartOauth,
}: {
  agentId: string;
  open: boolean;
  onClose: () => void;
  providers: ProviderItem[];
  onCreated: (item: ProviderItem) => void;
  onConflict: (name: string) => void;
  onStartOauth: (p: ProviderItem) => void;
}) {
  const [selected, setSelected] = useState<string>('');
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Providers without an existing api_key / OAuth connection.
  // OAuth providers are included so the user can pick them and either
  // launch the device flow (github_copilot) or see the CLI hint (openai_codex).
  const candidates = useMemo(
    () => providers.filter((p) => !p.hasValue && (p.isOauth || p.envKey !== '')),
    [providers],
  );

  useEffect(() => {
    if (!open) {
      setSelected('');
      setValue('');
      setShowValue(false);
      setErr(null);
    }
  }, [open]);

  const spec = providers.find((p) => p.name === selected);
  const canCreate = !!spec && !spec.isOauth && value.length > 0;

  const create = useCallback(async () => {
    if (!canCreate || !spec) return;
    setCreating(true);
    setErr(null);
    try {
      await manageApi(agentId, 'credentials/providers', {
        method: 'POST',
        body: JSON.stringify({ name: spec.name, value }),
      });
      onCreated({ ...spec, hasValue: true, masked: '***' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        onConflict(spec.name);
        return;
      }
      setErr(e instanceof Error ? e.message : 'Failed to set provider key');
    } finally {
      setCreating(false);
    }
  }, [agentId, spec, value, canCreate, onCreated, onConflict]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New provider key</DialogTitle>
          <DialogDescription>
            Set the API key for an LLM provider. The key is stored under{' '}
            <span className="font-mono">config.providers.&lt;name&gt;.api_key</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-muted-foreground">Provider</label>
            <Select value={selected} onValueChange={(v) => setSelected(v ?? '')}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select a provider…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.length === 0 ? (
                  <div className="px-2 py-2 text-sm text-muted-foreground italic">
                    All providers already configured.
                  </div>
                ) : (
                  candidates.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          {spec && !spec.isOauth && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-muted-foreground">API key</label>
              <div className="relative">
                <Input
                  type={showValue ? 'text' : 'password'}
                  placeholder="Paste API key"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="h-9 pr-9 font-mono text-sm"
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
          )}
          {spec?.isOauth && spec.name === 'github_copilot' && (
            <Button variant="default" className="w-full gap-1.5" onClick={() => onStartOauth(spec)}>
              <Link2 size={14} /> Login with {spec.label}
            </Button>
          )}
          {spec?.isOauth && spec.name !== 'github_copilot' && (
            <div className="space-y-1.5 rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 text-sm">
              <p className="text-muted-foreground">
                {spec.label} can only be connected via your agent&apos;s local CLI (fixed OAuth
                redirect to <span className="font-mono">localhost:1455</span>). Use your
                agent&apos;s OAuth login command there.
              </p>
            </div>
          )}
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          {!spec?.isOauth && (
            <Button
              onClick={() => void create()}
              disabled={!canCreate || creating}
              className="gap-1.5"
            >
              {creating && <Loader2 size={14} className="animate-spin" />}
              Create
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Conflict modal (shared)
// ---------------------------------------------------------------------------

function ConflictDialog({ message, onClose }: { message: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!message} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" /> Entry already exists
          </DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// OAuth device-flow login dialog
// ---------------------------------------------------------------------------

interface OauthStartResponse {
  sessionId: string;
  mode: 'device';
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

interface OauthPollResponse {
  status: 'pending' | 'ok' | 'error';
  error?: string;
  account?: string;
}

function OauthLoginDialog({
  agentId,
  provider,
  onClose,
  onConnected,
}: {
  agentId: string;
  provider: ProviderItem | null;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [session, setSession] = useState<OauthStartResponse | null>(null);
  const [status, setStatus] = useState<'starting' | 'pending' | 'ok' | 'error'>('starting');
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset on open/close
  useEffect(() => {
    if (!provider) {
      setSession(null);
      setStatus('starting');
      setErr(null);
      setCopied(false);
      return;
    }
    let cancelled = false;
    setStatus('starting');
    setErr(null);
    setSession(null);
    (async () => {
      try {
        const resp = await manageApi<OauthStartResponse>(
          agentId,
          `credentials/providers/${encodeURIComponent(provider.name)}/oauth/start`,
          { method: 'POST' },
        );
        if (cancelled) return;
        setSession(resp);
        setStatus('pending');
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setErr(e instanceof Error ? e.message : 'Failed to start OAuth flow');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, provider]);

  // Poll loop
  useEffect(() => {
    if (!provider || !session || status !== 'pending') return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const r = await manageApi<OauthPollResponse>(
          agentId,
          `credentials/providers/${encodeURIComponent(provider.name)}/oauth/poll?session_id=${encodeURIComponent(session.sessionId)}`,
        );
        if (cancelled) return;
        if (r.status === 'ok') {
          setStatus('ok');
          window.setTimeout(onConnected, 800);
          return;
        }
        if (r.status === 'error') {
          setStatus('error');
          setErr(r.error ?? 'OAuth flow failed');
          return;
        }
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setErr(e instanceof Error ? e.message : 'OAuth poll failed');
        return;
      }
      window.setTimeout(tick, Math.max(2, session.interval) * 1000);
    };
    const t = window.setTimeout(tick, Math.max(2, session.interval) * 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [agentId, provider, session, status, onConnected]);

  const copyCode = useCallback(async () => {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.userCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }, [session]);

  return (
    <Dialog open={!!provider} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 size={16} /> Connect {provider?.label}
          </DialogTitle>
          <DialogDescription>
            Authorize via the provider&apos;s device flow. This dialog updates automatically once
            you complete the login in your browser.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {status === 'starting' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Starting flow…
            </div>
          )}
          {session && status === 'pending' && (
            <>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-muted-foreground">Your code</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-base tracking-widest">
                    {session.userCode}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyCode()}
                    className="gap-1.5"
                  >
                    <Copy size={14} /> {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
              <Button
                variant="default"
                className="w-full gap-1.5"
                onClick={() =>
                  window.open(session.verificationUri, '_blank', 'noopener,noreferrer')
                }
              >
                <ExternalLink size={14} /> Open verification page
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Waiting for authorization…
              </div>
            </>
          )}
          {status === 'ok' && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <ShieldCheck size={14} /> Connected.
            </div>
          )}
          {status === 'error' && (
            <p className="text-sm text-destructive">{err ?? 'OAuth flow failed.'}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {status === 'ok' ? 'Close' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
