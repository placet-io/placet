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
  Globe,
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

interface BrowserSettings {
  enable: boolean;
  backend: string;
  command_timeout: number;
  inactivity_timeout: number;
  max_concurrent_sessions: number;
  max_named_sessions: number;
  allow_private_urls: boolean;
  domain_allowlist: string[];
  domain_denylist: string[];
  record_sessions: boolean;
  user_agent: string;
  snapshot_max_chars: number;
  proxy: string | null;
  proxy_set: boolean;
  camoufox: { humanize: boolean; geoip: string | null };
  playwright: { headless: boolean; extra_args: string[] };
  stealth: { advertise_stealth: boolean; block_trackers: boolean };
}

interface SettingsResponse {
  basic: Record<string, string | null>;
  advanced: Record<string, number | string | boolean>;
  api_keys: ApiKeyEntry[];
  browser?: BrowserSettings;
  options: {
    providers: ProviderOption[];
    reasoning_effort: string[];
    provider_retry_mode: string[];
    browser_backends?: string[];
  };
  changes?: string[];
  restart_needed?: boolean;
}

type Basic = Record<string, string>;
type Advanced = Record<string, number | string | boolean>;
type ApiKeyDraft = Record<string, string>;
/**
 * Per-key intent for the API-keys section. The previous implementation
 * encoded "user wants this slot cleared" as the literal value `'__CLEAR__'`
 * in the same map as the in-progress draft secret, which made it possible
 * to confuse a real secret with the sentinel and forced extra branching
 * everywhere a draft was read. The intent is now tracked separately.
 */
type ApiKeyIntent = 'unchanged' | 'clear';

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
  { key: 'max_goal_turns', label: 'Max goal turns', hint: '0 = unlimited' },
  { key: 'max_tool_result_chars', label: 'Max tool result chars' },
  { key: 'max_concurrent_requests', label: 'Max concurrent requests' },
  { key: 'max_concurrent_cron_jobs', label: 'Max concurrent cron jobs' },
  { key: 'reflection_interval_h', label: 'Reflection interval (h)' },
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
  const [apiKeyIntents, setApiKeyIntents] = useState<Record<string, ApiKeyIntent>>({});
  const [browser, setBrowser] = useState<BrowserSettings | null>(null);
  const [browserProxyDraft, setBrowserProxyDraft] = useState<string>('');
  const [browserProxyClear, setBrowserProxyClear] = useState<boolean>(false);

  const hydrate = useCallback((resp: SettingsResponse) => {
    const b: Basic = {};
    Object.entries(resp.basic).forEach(([k, v]) => {
      b[k] = v == null ? '' : String(v);
    });
    setBasic(b);
    setAdvanced({ ...resp.advanced });
    setApiKeyDrafts({});
    setApiKeyIntents({});
    setBrowser(resp.browser ? { ...resp.browser } : null);
    setBrowserProxyDraft('');
    setBrowserProxyClear(false);
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
    for (const [, intent] of Object.entries(apiKeyIntents)) {
      if (intent === 'clear') return true;
    }
    if (browser && data.browser) {
      const orig = data.browser;
      const keys: (keyof BrowserSettings)[] = [
        'enable',
        'backend',
        'command_timeout',
        'inactivity_timeout',
        'max_concurrent_sessions',
        'max_named_sessions',
        'allow_private_urls',
        'record_sessions',
        'user_agent',
        'snapshot_max_chars',
      ];
      for (const k of keys) {
        if (browser[k] !== orig[k]) return true;
      }
      if (browser.domain_allowlist.join('\n') !== orig.domain_allowlist.join('\n')) return true;
      if (browser.domain_denylist.join('\n') !== orig.domain_denylist.join('\n')) return true;
      if (browser.camoufox.humanize !== orig.camoufox.humanize) return true;
      if (browser.playwright.headless !== orig.playwright.headless) return true;
      if (browser.stealth.advertise_stealth !== orig.stealth.advertise_stealth) return true;
      if (browser.stealth.block_trackers !== orig.stealth.block_trackers) return true;
      if (browserProxyDraft !== '' || browserProxyClear) return true;
    }
    return false;
  }, [
    data,
    basic,
    advanced,
    apiKeyDrafts,
    apiKeyIntents,
    browser,
    browserProxyDraft,
    browserProxyClear,
  ]);

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
      for (const [k, intent] of Object.entries(apiKeyIntents)) {
        if (intent === 'clear') apiKeysToSend[k] = null;
      }
      for (const [k, v] of Object.entries(apiKeyDrafts)) {
        if (v === '') continue;
        // A draft secret overrides a pending clear — typing a new value
        // implicitly cancels the clear request.
        apiKeysToSend[k] = v;
      }
      if (Object.keys(apiKeysToSend).length) {
        body.api_keys = apiKeysToSend;
      }
      if (browser && data.browser) {
        const orig = data.browser;
        const bdiff: Record<string, unknown> = {};
        const flatKeys: (keyof BrowserSettings)[] = [
          'enable',
          'backend',
          'command_timeout',
          'inactivity_timeout',
          'max_concurrent_sessions',
          'max_named_sessions',
          'allow_private_urls',
          'record_sessions',
          'user_agent',
          'snapshot_max_chars',
        ];
        for (const k of flatKeys) {
          if (browser[k] !== orig[k]) bdiff[k] = browser[k];
        }
        if (browser.domain_allowlist.join('\n') !== orig.domain_allowlist.join('\n')) {
          bdiff.domain_allowlist = browser.domain_allowlist;
        }
        if (browser.domain_denylist.join('\n') !== orig.domain_denylist.join('\n')) {
          bdiff.domain_denylist = browser.domain_denylist;
        }
        const cf: Record<string, unknown> = {};
        if (browser.camoufox.humanize !== orig.camoufox.humanize)
          cf.humanize = browser.camoufox.humanize;
        if (Object.keys(cf).length) bdiff.camoufox = cf;
        const pw: Record<string, unknown> = {};
        if (browser.playwright.headless !== orig.playwright.headless)
          pw.headless = browser.playwright.headless;
        if (Object.keys(pw).length) bdiff.playwright = pw;
        const st: Record<string, unknown> = {};
        if (browser.stealth.advertise_stealth !== orig.stealth.advertise_stealth)
          st.advertise_stealth = browser.stealth.advertise_stealth;
        if (browser.stealth.block_trackers !== orig.stealth.block_trackers)
          st.block_trackers = browser.stealth.block_trackers;
        if (Object.keys(st).length) bdiff.stealth = st;
        if (browserProxyClear) bdiff.proxy = null;
        else if (browserProxyDraft) bdiff.proxy = browserProxyDraft;
        if (Object.keys(bdiff).length) body.browser = bdiff;
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

                <div className="flex items-end gap-2">
                  <div className="flex flex-1 items-center justify-between rounded-md border border-border/60 bg-background px-3 h-9">
                    <span
                      className="text-sm"
                      title="Master switch for tool allow/deny + approval prompts"
                    >
                      Tool policy enabled
                    </span>
                    <Switch
                      checked={Boolean(advanced.policy_enabled ?? true)}
                      onCheckedChange={(v) =>
                        setAdvanced((a) => ({ ...a, policy_enabled: Boolean(v) }))
                      }
                    />
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex flex-1 items-center justify-between rounded-md border border-border/60 bg-background px-3 h-9">
                    <span
                      className="text-sm"
                      title="Bypass approval prompts for cron-triggered tool calls"
                    >
                      Skip policy for cron
                    </span>
                    <Switch
                      checked={Boolean(advanced.policy_skip_cron)}
                      onCheckedChange={(v) =>
                        setAdvanced((a) => ({ ...a, policy_skip_cron: Boolean(v) }))
                      }
                    />
                  </div>
                </div>
              </div>
            </ManageCard>
          </ManageSection>

          {browser && data.browser && (
            <ManageSection
              title="Browser automation"
              description="Local browser-use stack (Camoufox/Playwright). Sessions run inside the agent container."
            >
              <ManageCard
                title={
                  <span className="flex items-center gap-2 text-base font-semibold">
                    <Globe size={16} className="text-muted-foreground" /> Browser tools
                  </span>
                }
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="flex items-end gap-2">
                    <div className="flex flex-1 items-center justify-between rounded-md border border-border/60 bg-background px-3 h-9">
                      <span className="text-sm">Enable browser tools</span>
                      <Switch
                        checked={browser.enable}
                        onCheckedChange={(v) =>
                          setBrowser((b) => (b ? { ...b, enable: Boolean(v) } : b))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Backend
                    </label>
                    <Select
                      value={browser.backend}
                      onValueChange={(v) =>
                        setBrowser((b) => (b ? { ...b, backend: v ?? 'auto' } : b))
                      }
                    >
                      <SelectTrigger className="h-9 w-full rounded-lg text-sm">
                        <SelectValue placeholder="Backend" />
                      </SelectTrigger>
                      <SelectContent>
                        {(data.options.browser_backends ?? ['auto', 'camoufox', 'playwright']).map(
                          (opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Max concurrent sessions
                    </label>
                    <Input
                      type="number"
                      value={String(browser.max_concurrent_sessions)}
                      onChange={(e) =>
                        setBrowser((b) =>
                          b
                            ? {
                                ...b,
                                max_concurrent_sessions: Number.parseInt(e.target.value || '1', 10),
                              }
                            : b,
                        )
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Max named sessions (catalogue)
                    </label>
                    <Input
                      type="number"
                      value={String(browser.max_named_sessions)}
                      onChange={(e) =>
                        setBrowser((b) =>
                          b
                            ? {
                                ...b,
                                max_named_sessions: Number.parseInt(e.target.value || '1', 10),
                              }
                            : b,
                        )
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Inactivity timeout (s)
                    </label>
                    <Input
                      type="number"
                      value={String(browser.inactivity_timeout)}
                      onChange={(e) =>
                        setBrowser((b) =>
                          b
                            ? {
                                ...b,
                                inactivity_timeout: Number.parseInt(e.target.value || '0', 10),
                              }
                            : b,
                        )
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Command timeout (s)
                    </label>
                    <Input
                      type="number"
                      value={String(browser.command_timeout)}
                      onChange={(e) =>
                        setBrowser((b) =>
                          b
                            ? { ...b, command_timeout: Number.parseInt(e.target.value || '0', 10) }
                            : b,
                        )
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Snapshot max chars
                    </label>
                    <Input
                      type="number"
                      value={String(browser.snapshot_max_chars)}
                      onChange={(e) =>
                        setBrowser((b) =>
                          b
                            ? {
                                ...b,
                                snapshot_max_chars: Number.parseInt(e.target.value || '0', 10),
                              }
                            : b,
                        )
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">
                      User-Agent override
                    </label>
                    <Input
                      value={browser.user_agent}
                      onChange={(e) =>
                        setBrowser((b) => (b ? { ...b, user_agent: e.target.value } : b))
                      }
                      placeholder="(default)"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-muted-foreground">
                        Proxy URL
                        {browser.proxy_set && (
                          <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-success-muted px-2 py-0.5 text-sm font-medium text-success-foreground">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" />
                            Set
                          </span>
                        )}
                      </label>
                      {browser.proxy_set && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn('h-7 text-sm', browserProxyClear && 'text-destructive')}
                          onClick={() => {
                            setBrowserProxyClear((c) => !c);
                            if (!browserProxyClear) setBrowserProxyDraft('');
                          }}
                        >
                          {browserProxyClear ? 'Undo clear' : 'Clear'}
                        </Button>
                      )}
                    </div>
                    <Input
                      type="password"
                      value={browserProxyClear ? '' : browserProxyDraft}
                      onChange={(e) => {
                        setBrowserProxyDraft(e.target.value);
                        if (e.target.value && browserProxyClear) setBrowserProxyClear(false);
                      }}
                      placeholder={
                        browser.proxy_set
                          ? `${browser.proxy ?? '•••••'} (leave blank to keep)`
                          : 'http://user:pass@host:port'
                      }
                      className="h-9 text-sm font-mono"
                      disabled={browserProxyClear}
                    />
                    <p className="text-sm text-muted-foreground/80">
                      Applied container-wide (HTTP_PROXY/HTTPS_PROXY) when set.
                    </p>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex flex-1 items-center justify-between rounded-md border border-border/60 bg-background px-3 h-9">
                      <span
                        className="text-sm"
                        title="Allow navigation to private/loopback IP ranges"
                      >
                        Allow private URLs
                      </span>
                      <Switch
                        checked={browser.allow_private_urls}
                        onCheckedChange={(v) =>
                          setBrowser((b) => (b ? { ...b, allow_private_urls: Boolean(v) } : b))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Domain allowlist (one per line; empty = no restriction)
                    </label>
                    <textarea
                      value={browser.domain_allowlist.join('\n')}
                      onChange={(e) =>
                        setBrowser((b) =>
                          b
                            ? {
                                ...b,
                                domain_allowlist: e.target.value
                                  .split('\n')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              }
                            : b,
                        )
                      }
                      rows={3}
                      placeholder="example.com&#10;github.com"
                      className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Domain denylist (always blocked, even if allowlisted)
                    </label>
                    <textarea
                      value={browser.domain_denylist.join('\n')}
                      onChange={(e) =>
                        setBrowser((b) =>
                          b
                            ? {
                                ...b,
                                domain_denylist: e.target.value
                                  .split('\n')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              }
                            : b,
                        )
                      }
                      rows={3}
                      placeholder="ads.example.com&#10;tracker.net"
                      className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex flex-1 items-center justify-between rounded-md border border-border/60 bg-background px-3 h-9">
                      <span className="text-sm">Camoufox humanize</span>
                      <Switch
                        checked={browser.camoufox.humanize}
                        onCheckedChange={(v) =>
                          setBrowser((b) =>
                            b ? { ...b, camoufox: { ...b.camoufox, humanize: Boolean(v) } } : b,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex flex-1 items-center justify-between rounded-md border border-border/60 bg-background px-3 h-9">
                      <span className="text-sm">Playwright headless</span>
                      <Switch
                        checked={browser.playwright.headless}
                        onCheckedChange={(v) =>
                          setBrowser((b) =>
                            b ? { ...b, playwright: { ...b.playwright, headless: Boolean(v) } } : b,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex flex-1 items-center justify-between rounded-md border border-border/60 bg-background px-3 h-9">
                      <span className="text-sm" title="Tell the model when stealth mode is active">
                        Advertise stealth
                      </span>
                      <Switch
                        checked={browser.stealth.advertise_stealth}
                        onCheckedChange={(v) =>
                          setBrowser((b) =>
                            b
                              ? { ...b, stealth: { ...b.stealth, advertise_stealth: Boolean(v) } }
                              : b,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex flex-1 items-center justify-between rounded-md border border-border/60 bg-background px-3 h-9">
                      <span className="text-sm">Block trackers</span>
                      <Switch
                        checked={browser.stealth.block_trackers}
                        onCheckedChange={(v) =>
                          setBrowser((b) =>
                            b ? { ...b, stealth: { ...b.stealth, block_trackers: Boolean(v) } } : b,
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              </ManageCard>
            </ManageSection>
          )}

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
                    const willClear = apiKeyIntents[k.key] === 'clear';
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
                              onClick={() => {
                                setApiKeyIntents((m) => ({
                                  ...m,
                                  [k.key]: willClear ? 'unchanged' : 'clear',
                                }));
                                if (!willClear) {
                                  // Drop any in-progress draft when arming a clear
                                  setApiKeyDrafts((d) => ({ ...d, [k.key]: '' }));
                                }
                              }}
                            >
                              {willClear ? 'Undo clear' : 'Clear'}
                            </Button>
                          )}
                        </div>
                        <Input
                          type="password"
                          value={willClear ? '' : draft}
                          onChange={(e) => {
                            const next = e.target.value;
                            setApiKeyDrafts((d) => ({ ...d, [k.key]: next }));
                            // Typing a value cancels any pending clear.
                            if (next && willClear) {
                              setApiKeyIntents((m) => ({ ...m, [k.key]: 'unchanged' }));
                            }
                          }}
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
