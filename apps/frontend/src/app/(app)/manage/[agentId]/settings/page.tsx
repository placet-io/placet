'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  AlertTriangle,
  KeyRound,
  Sliders,
  Cpu,
} from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import { ManageCard, ManageSection, ManageEmptyState } from '@/components/manage/manage-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { manageApi } from '@/components/manage/manage-api';
import { cn } from '@/lib/utils';

interface ProviderOption {
  value: string;
  label: string;
}

interface ApiKeyEntry {
  key: string;
  label: string;
  description: string;
  has_value: boolean;
}

interface SettingsResponse {
  basic: Record<string, string | null>;
  advanced: Record<string, number | string | boolean>;
  api_keys: ApiKeyEntry[];
  options: {
    providers: ProviderOption[];
    reasoning_effort: string[];
    provider_retry_mode: string[];
  };
  changes?: string[];
  restart_needed?: boolean;
}

type Basic = Record<string, string>;
type Advanced = Record<string, number | string | boolean>;
type ApiKeyDraft = Record<string, string>;

const BASIC_GROUPS: Array<{
  title: string;
  rows: Array<{
    model: { key: string; label: string };
    provider: { key: string; label: string };
  }>;
}> = [
  {
    title: 'Chat',
    rows: [
      {
        model: { key: 'model', label: 'Model' },
        provider: { key: 'provider', label: 'Provider' },
      },
    ],
  },
  {
    title: 'Sub-agents',
    rows: [
      {
        model: { key: 'subagent_model', label: 'Sub-agent model' },
        provider: { key: 'subagent_provider', label: 'Sub-agent provider' },
      },
    ],
  },
  {
    title: 'Vision',
    rows: [
      {
        model: { key: 'vision_model', label: 'Vision model' },
        provider: { key: 'vision_provider', label: 'Vision provider' },
      },
    ],
  },
  {
    title: 'Image generation',
    rows: [
      {
        model: { key: 'image_model', label: 'Image model' },
        provider: { key: 'image_provider', label: 'Image provider' },
      },
    ],
  },
  {
    title: 'Video generation',
    rows: [
      {
        model: { key: 'video_model', label: 'Video model' },
        provider: { key: 'video_provider', label: 'Video provider' },
      },
    ],
  },
];

const ADVANCED_NUM_FIELDS: Array<{ key: string; label: string; hint?: string }> = [
  { key: 'temperature', label: 'Temperature', hint: '0 – 2' },
  { key: 'max_tokens', label: 'Max tokens' },
  { key: 'context_window_tokens', label: 'Context window tokens' },
  { key: 'max_tool_iterations', label: 'Max tool iterations' },
  { key: 'max_tool_result_chars', label: 'Max tool result chars' },
  { key: 'max_concurrent_requests', label: 'Max concurrent requests' },
  { key: 'max_concurrent_cron_jobs', label: 'Max concurrent cron jobs' },
  { key: 'dream_interval_h', label: 'Dream interval (h)' },
];

export default function AgentSettingsPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [restartNeeded, setRestartNeeded] = useState(false);

  const [basic, setBasic] = useState<Basic>({});
  const [advanced, setAdvanced] = useState<Advanced>({});
  const [apiKeyDrafts, setApiKeyDrafts] = useState<ApiKeyDraft>({});

  const hydrate = useCallback((resp: SettingsResponse) => {
    const b: Basic = {};
    Object.entries(resp.basic).forEach(([k, v]) => {
      b[k] = v == null ? '' : String(v);
    });
    setBasic(b);
    setAdvanced({ ...resp.advanced });
    setApiKeyDrafts({});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await manageApi<SettingsResponse>(agentId, 'settings');
      setData(resp);
      hydrate(resp);
      setRestartNeeded(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [agentId, hydrate]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!data) return false;
    for (const [k, v] of Object.entries(basic)) {
      const orig = data.basic[k];
      const origStr = orig == null ? '' : String(orig);
      if (origStr !== v) return true;
    }
    for (const [k, v] of Object.entries(advanced)) {
      if (data.advanced[k] !== v) return true;
    }
    for (const [, v] of Object.entries(apiKeyDrafts)) {
      if (v !== '') return true;
    }
    return false;
  }, [data, basic, advanced, apiKeyDrafts]);

  const save = async () => {
    if (!data || saving) return;
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(basic)) {
        const orig = data.basic[k];
        const origStr = orig == null ? '' : String(orig);
        if (origStr !== v) {
          body[k] = v;
        }
      }
      for (const [k, v] of Object.entries(advanced)) {
        if (data.advanced[k] !== v) body[k] = v;
      }
      const apiKeysToSend: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(apiKeyDrafts)) {
        if (v === '') continue;
        apiKeysToSend[k] = v === '__CLEAR__' ? null : v;
      }
      if (Object.keys(apiKeysToSend).length) {
        body.api_keys = apiKeysToSend;
      }
      const resp = await manageApi<SettingsResponse>(agentId, 'settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setData(resp);
      hydrate(resp);
      setRestartNeeded(Boolean(resp.restart_needed));
      setFlash(
        resp.changes && resp.changes.length
          ? `Saved ${resp.changes.length} change${resp.changes.length === 1 ? '' : 's'}.`
          : 'No changes to save.',
      );
      setTimeout(() => setFlash(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const reasoningOpts = data?.options.reasoning_effort ?? [];
  const retryOpts = data?.options.provider_retry_mode ?? [];
  const providers = data?.options.providers ?? [];

  const providerSelect = (key: string, value: string, onChange: (v: string) => void) => (
    <Select value={value || undefined} onValueChange={(v) => onChange(v ?? '')}>
      <SelectTrigger className="h-9 w-full rounded-lg text-sm">
        <SelectValue placeholder="Provider" />
      </SelectTrigger>
      <SelectContent>
        {providers.length === 0 ? (
          <SelectItem value="__none__" disabled>
            —
          </SelectItem>
        ) : (
          providers.map((p) => (
            <SelectItem key={`${key}:${p.value}`} value={p.value}>
              {p.label}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );

  return (
    <ManagePane
      title="Settings"
      backHref="/manage"
      subtitle="Defaults applied to every agent run. Secrets are write-only and never returned."
      actions={
        <div className="flex items-center gap-1">
          {flash && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400 pr-2">{flash}</span>
          )}
          <Button
            variant="default"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => void save()}
            disabled={!dirty || saving}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => void load()}
            disabled={loading}
            title="Reload"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </Button>
        </div>
      }
    >
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <AlertTriangle size={14} className="text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {restartNeeded && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm">Some changes require restarting the agent to take full effect.</p>
        </div>
      )}

      {loading && !data && (
        <ManageCard className="border-dashed">
          <ManageEmptyState
            icon={SettingsIcon}
            title="Loading…"
            description="Fetching current settings."
          />
        </ManageCard>
      )}

      {data && (
        <>
          <ManageSection title="Models" description="Default model + provider per capability.">
            <ManageCard
              title={
                <span className="flex items-center gap-2 text-base font-semibold">
                  <Cpu size={16} className="text-muted-foreground" /> Defaults
                </span>
              }
            >
              <div className="space-y-4">
                {BASIC_GROUPS.map((g) => (
                  <div key={g.title} className="space-y-2">
                    <div className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                      {g.title}
                    </div>
                    {g.rows.map((r) => (
                      <div
                        key={r.model.key}
                        className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_220px]"
                      >
                        <Input
                          value={basic[r.model.key] ?? ''}
                          onChange={(e) =>
                            setBasic((b) => ({ ...b, [r.model.key]: e.target.value }))
                          }
                          placeholder={r.model.label}
                          className="h-9 text-sm"
                        />
                        {providerSelect(r.provider.key, basic[r.provider.key] ?? '', (v) =>
                          setBasic((b) => ({ ...b, [r.provider.key]: v })),
                        )}
                      </div>
                    ))}
                  </div>
                ))}

                <div className="grid grid-cols-1 gap-3 pt-2 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Reasoning effort
                    </label>
                    <Select
                      value={basic.reasoning_effort || '__default__'}
                      onValueChange={(v) =>
                        setBasic((b) => ({
                          ...b,
                          reasoning_effort: v === '__default__' ? '' : (v ?? ''),
                        }))
                      }
                    >
                      <SelectTrigger className="h-9 w-full rounded-lg text-sm">
                        <SelectValue placeholder="(default)">
                          {(val: string | null) =>
                            !val || val === '__default__' ? '(default)' : val
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">(default)</SelectItem>
                        {reasoningOpts.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Timezone
                    </label>
                    <Input
                      value={basic.timezone ?? ''}
                      onChange={(e) => setBasic((b) => ({ ...b, timezone: e.target.value }))}
                      placeholder="Europe/Berlin"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              </div>
            </ManageCard>
          </ManageSection>

          <ManageSection
            title="Advanced"
            description="Generation, session, and concurrency limits."
          >
            <ManageCard
              title={
                <span className="flex items-center gap-2 text-base font-semibold">
                  <Sliders size={16} className="text-muted-foreground" /> Runtime
                </span>
              }
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {ADVANCED_NUM_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">
                      {f.label}
                      {f.hint && <span className="ml-1 text-muted-foreground/70">({f.hint})</span>}
                    </label>
                    <Input
                      type="number"
                      value={String(advanced[f.key] ?? '')}
                      onChange={(e) =>
                        setAdvanced((a) => ({
                          ...a,
                          [f.key]:
                            f.key === 'temperature'
                              ? Number(e.target.value)
                              : Number.parseInt(e.target.value || '0', 10),
                        }))
                      }
                      step={f.key === 'temperature' ? '0.1' : '1'}
                      className="h-9 text-sm"
                    />
                  </div>
                ))}

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-muted-foreground">
                    Provider retry mode
                  </label>
                  <Select
                    value={String(advanced.provider_retry_mode ?? '') || undefined}
                    onValueChange={(v) =>
                      setAdvanced((a) => ({ ...a, provider_retry_mode: v ?? '' }))
                    }
                  >
                    <SelectTrigger className="h-9 w-full rounded-lg text-sm">
                      <SelectValue placeholder="Retry mode" />
                    </SelectTrigger>
                    <SelectContent>
                      {retryOpts.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex flex-1 items-center justify-between rounded-md border border-border/60 bg-background px-3 h-9">
                    <span className="text-sm">Unified session</span>
                    <Switch
                      checked={Boolean(advanced.unified_session)}
                      onCheckedChange={(v) =>
                        setAdvanced((a) => ({ ...a, unified_session: Boolean(v) }))
                      }
                    />
                  </div>
                </div>
              </div>
            </ManageCard>
          </ManageSection>

          <ManageSection
            title="API keys"
            description="Values are write-only. The stored secrets are never returned by the server."
          >
            <ManageCard
              title={
                <span className="flex items-center gap-2 text-base font-semibold">
                  <KeyRound size={16} className="text-muted-foreground" /> Provider credentials
                </span>
              }
            >
              {data.api_keys.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No API-key slots are registered for this agent.
                </p>
              ) : (
                <div className="space-y-3">
                  {data.api_keys.map((k) => {
                    const draft = apiKeyDrafts[k.key] ?? '';
                    const willClear = draft === '__CLEAR__';
                    return (
                      <div key={k.key} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm">{k.key}</span>
                              {k.has_value && !willClear && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-muted px-2 py-0.5 text-sm font-medium text-success-foreground">
                                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                                  Set
                                </span>
                              )}
                              {willClear && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-error-muted px-2 py-0.5 text-sm font-medium text-error-foreground">
                                  <span className="h-1.5 w-1.5 rounded-full bg-error" />
                                  Will clear
                                </span>
                              )}
                            </div>
                            {k.description && (
                              <p className="text-sm text-muted-foreground/90">{k.description}</p>
                            )}
                          </div>
                          {k.has_value && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn('h-7 text-sm', willClear && 'text-destructive')}
                              onClick={() =>
                                setApiKeyDrafts((d) => ({
                                  ...d,
                                  [k.key]: willClear ? '' : '__CLEAR__',
                                }))
                              }
                            >
                              {willClear ? 'Undo clear' : 'Clear'}
                            </Button>
                          )}
                        </div>
                        <Input
                          type="password"
                          value={willClear ? '' : draft}
                          onChange={(e) =>
                            setApiKeyDrafts((d) => ({ ...d, [k.key]: e.target.value }))
                          }
                          placeholder={k.has_value ? '•••••• (leave blank to keep)' : k.label}
                          className="h-9 text-sm font-mono"
                          disabled={willClear}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </ManageCard>
          </ManageSection>
        </>
      )}
    </ManagePane>
  );
}
