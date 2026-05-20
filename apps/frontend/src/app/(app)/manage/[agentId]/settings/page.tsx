'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  AlertTriangle,
  Sliders,
  Sparkles,
  Cpu,
  Globe,
} from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import { ManageCard, ManageSection, ManageEmptyState } from '@/components/manage/manage-ui';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

interface SelfImprovementSettings {
  enabled: boolean;
  model_override: string | null;
  provider_override: string | null;
  mode: string;
  auto_triggers: string[];
  interval_h: number;
  max_iterations: number;
  scopes: string[];
  validation_level: string;
}

interface SettingsResponse {
  basic: Record<string, string | null>;
  advanced: Record<string, number | string | boolean>;
  browser?: BrowserSettings;
  self_improvement?: SelfImprovementSettings;
  options: {
    providers: ProviderOption[];
    reasoning_effort: string[];
    provider_retry_mode: string[];
    browser_backends?: string[];
    self_improvement_modes?: string[];
    self_improvement_triggers?: string[];
    self_improvement_scopes?: string[];
    self_improvement_validation_levels?: string[];
  };
  changes?: string[];
  restart_needed?: boolean;
}

type Basic = Record<string, string>;
type Advanced = Record<string, number | string | boolean>;

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
  const [browser, setBrowser] = useState<BrowserSettings | null>(null);
  const [browserProxyDraft, setBrowserProxyDraft] = useState<string>('');
  const [browserProxyClear, setBrowserProxyClear] = useState<boolean>(false);
  const [selfImprovement, setSelfImprovement] = useState<SelfImprovementSettings | null>(null);

  const hydrate = useCallback((resp: SettingsResponse) => {
    const b: Basic = {};
    Object.entries(resp.basic).forEach(([k, v]) => {
      b[k] = v == null ? '' : String(v);
    });
    setBasic(b);
    setAdvanced({ ...resp.advanced });
    setBrowser(resp.browser ? { ...resp.browser } : null);
    setSelfImprovement(resp.self_improvement ? { ...resp.self_improvement } : null);
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
    if (selfImprovement && data.self_improvement) {
      if (JSON.stringify(selfImprovement) !== JSON.stringify(data.self_improvement)) return true;
    }
    return false;
  }, [data, basic, advanced, browser, browserProxyDraft, browserProxyClear, selfImprovement]);

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
      if (selfImprovement && data.self_improvement) {
        const orig = data.self_improvement;
        const sidiff: Record<string, unknown> = {};
        const keys: Array<keyof SelfImprovementSettings> = [
          'enabled',
          'model_override',
          'provider_override',
          'mode',
          'interval_h',
          'max_iterations',
          'validation_level',
        ];
        for (const k of keys) {
          if (selfImprovement[k] !== orig[k]) sidiff[k] = selfImprovement[k];
        }
        if (selfImprovement.auto_triggers.join('\n') !== orig.auto_triggers.join('\n')) {
          sidiff.auto_triggers = selfImprovement.auto_triggers;
        }
        if (selfImprovement.scopes.join('\n') !== orig.scopes.join('\n')) {
          sidiff.scopes = selfImprovement.scopes;
        }
        if (Object.keys(sidiff).length) body.self_improvement = sidiff;
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
  const improvementModes = data?.options.self_improvement_modes ?? ['off', 'review', 'auto_apply'];
  const improvementTriggers = data?.options.self_improvement_triggers ?? [
    'goal_done',
    'repeated_tool_error',
    'user_correction',
    'scheduled',
  ];
  const improvementScopes = data?.options.self_improvement_scopes ?? [
    'memory',
    'skills',
    'scripts',
    'instructions',
    'policy',
    'runtime',
  ];
  const validationLevels = data?.options.self_improvement_validation_levels ?? [
    'off',
    'standard',
    'strict',
  ];

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
      subtitle="Defaults applied to every agent run. Credential secrets are managed separately."
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

                <div className="flex items-end gap-2">
                  <div className="flex flex-1 items-center justify-between rounded-md border border-border/60 bg-background px-3 h-9">
                    <span
                      className="text-sm"
                      title="Register scheduled Reflection runs that write memory changes and create agent versions"
                    >
                      Auto-apply Reflection
                    </span>
                    <Switch
                      checked={Boolean(advanced.reflection_auto_apply ?? true)}
                      onCheckedChange={(v) =>
                        setAdvanced((a) => ({ ...a, reflection_auto_apply: Boolean(v) }))
                      }
                    />
                  </div>
                </div>
              </div>
            </ManageCard>
          </ManageSection>

          {selfImprovement && data.self_improvement && (
            <ManageSection
              title="Self-improvement"
              description="Background reviews, apply mode, trigger cadence, and editable agent-owned scopes."
            >
              <ManageCard
                title={
                  <span className="flex items-center gap-2 text-base font-semibold">
                    <Sparkles size={16} className="text-muted-foreground" /> Improvement runner
                  </span>
                }
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="flex items-end gap-2">
                    <div className="flex h-9 flex-1 items-center justify-between rounded-md border border-border/60 bg-background px-3">
                      <span className="text-sm">Enabled</span>
                      <Switch
                        checked={selfImprovement.enabled}
                        onCheckedChange={(v) =>
                          setSelfImprovement((s) => (s ? { ...s, enabled: Boolean(v) } : s))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">Mode</label>
                    <Select
                      value={selfImprovement.mode}
                      onValueChange={(v) =>
                        setSelfImprovement((s) => (s ? { ...s, mode: v ?? s.mode } : s))
                      }
                    >
                      <SelectTrigger className="h-9 w-full rounded-lg text-sm">
                        <SelectValue placeholder="Mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {improvementModes.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {mode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Scheduled interval (h)
                    </label>
                    <Input
                      type="number"
                      value={String(selfImprovement.interval_h)}
                      onChange={(e) =>
                        setSelfImprovement((s) =>
                          s ? { ...s, interval_h: Number.parseInt(e.target.value || '1', 10) } : s,
                        )
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Model override
                    </label>
                    <Input
                      value={selfImprovement.model_override ?? ''}
                      onChange={(e) =>
                        setSelfImprovement((s) =>
                          s ? { ...s, model_override: e.target.value || null } : s,
                        )
                      }
                      placeholder="Use agent default"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Provider override
                    </label>
                    <Select
                      value={selfImprovement.provider_override ?? '__default__'}
                      onValueChange={(v) =>
                        setSelfImprovement((s) =>
                          s ? { ...s, provider_override: v === '__default__' ? null : v } : s,
                        )
                      }
                    >
                      <SelectTrigger className="h-9 w-full rounded-lg text-sm">
                        <SelectValue placeholder="Use agent default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">Use agent default</SelectItem>
                        {providers
                          .filter((provider) => provider.value !== 'auto')
                          .map((provider) => (
                            <SelectItem
                              key={`improvement:${provider.value}`}
                              value={provider.value}
                            >
                              {provider.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Scopes
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {improvementScopes.map((scope) => {
                        const checked = selfImprovement.scopes.includes(scope);
                        return (
                          <label
                            key={scope}
                            className="flex h-9 items-center gap-2 rounded-md border border-border/60 bg-background px-3 text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                setSelfImprovement((s) => {
                                  if (!s) return s;
                                  const next = new Set(s.scopes);
                                  if (v) next.add(scope);
                                  else next.delete(scope);
                                  return { ...s, scopes: Array.from(next) };
                                })
                              }
                            />
                            <span className="truncate">{scope}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Max iterations
                    </label>
                    <Input
                      type="number"
                      value={String(selfImprovement.max_iterations)}
                      onChange={(e) =>
                        setSelfImprovement((s) =>
                          s
                            ? { ...s, max_iterations: Number.parseInt(e.target.value || '1', 10) }
                            : s,
                        )
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Validation level
                    </label>
                    <Select
                      value={selfImprovement.validation_level}
                      onValueChange={(v) =>
                        setSelfImprovement((s) =>
                          s ? { ...s, validation_level: v ?? s.validation_level } : s,
                        )
                      }
                    >
                      <SelectTrigger className="h-9 w-full rounded-lg text-sm">
                        <SelectValue placeholder="Validation" />
                      </SelectTrigger>
                      <SelectContent>
                        {validationLevels.map((level) => (
                          <SelectItem key={level} value={level}>
                            {level}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="block text-sm font-medium text-muted-foreground">
                      Automatic triggers
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {improvementTriggers.map((trigger) => {
                        const checked = selfImprovement.auto_triggers.includes(trigger);
                        return (
                          <label
                            key={trigger}
                            className="flex h-9 items-center gap-2 rounded-md border border-border/60 bg-background px-3 text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                setSelfImprovement((s) => {
                                  if (!s) return s;
                                  const next = new Set(s.auto_triggers);
                                  if (v) next.add(trigger);
                                  else next.delete(trigger);
                                  return { ...s, auto_triggers: Array.from(next) };
                                })
                              }
                            />
                            <span className="truncate">{trigger}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </ManageCard>
            </ManageSection>
          )}

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
        </>
      )}
    </ManagePane>
  );
}
