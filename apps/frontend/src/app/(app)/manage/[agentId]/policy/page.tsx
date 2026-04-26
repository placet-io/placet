'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Trash2,
  Plus,
  Loader2,
  RefreshCw,
  X,
  Save,
} from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import { ManageCard, ManageEmptyState } from '@/components/manage/manage-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { manageApi } from '@/components/manage/manage-api';

interface PolicyRule {
  action: 'allow' | 'deny';
  tool: string;
  params: Record<string, string>;
  added_at?: string;
  added_by?: string;
}

interface ListResponse {
  enabled: boolean;
  skipCron: boolean;
  path: string;
  rules: PolicyRule[];
}

type PolicyAction = 'allow' | 'deny';

export default function AgentPolicyPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [policyEnabled, setPolicyEnabled] = useState(true);
  const [skipCron, setSkipCron] = useState(false);
  const [savingFlag, setSavingFlag] = useState<'enabled' | 'skipCron' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await manageApi<ListResponse>(agentId, 'policy');
      setRules(data.rules ?? []);
      setPolicyEnabled(Boolean(data.enabled));
      setSkipCron(Boolean(data.skipCron));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load policy rules');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () =>
      [...rules].sort((a, b) => {
        if (a.action !== b.action) return a.action === 'deny' ? -1 : 1;
        return a.tool.localeCompare(b.tool);
      }),
    [rules],
  );

  const removeLocal = (rule: PolicyRule) =>
    setRules((prev) =>
      prev.filter(
        (r) =>
          !(
            r.action === rule.action &&
            r.tool === rule.tool &&
            JSON.stringify(r.params) === JSON.stringify(rule.params)
          ),
      ),
    );

  const clearAll = useCallback(async () => {
    setClearing(true);
    try {
      await manageApi(agentId, 'policy/all', { method: 'DELETE' });
      setRules([]);
      setConfirmClear(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear rules');
    } finally {
      setClearing(false);
    }
  }, [agentId]);

  const updateFlag = useCallback(
    async (flag: 'enabled' | 'skipCron', value: boolean) => {
      const prevEnabled = policyEnabled;
      const prevSkip = skipCron;
      if (flag === 'enabled') setPolicyEnabled(value);
      else setSkipCron(value);
      setSavingFlag(flag);
      try {
        await manageApi(agentId, 'policy/settings', {
          method: 'PATCH',
          body: JSON.stringify({ [flag]: value }),
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        // Revert on failure
        setPolicyEnabled(prevEnabled);
        setSkipCron(prevSkip);
        setError(e instanceof Error ? e.message : 'Failed to update policy settings');
      } finally {
        setSavingFlag(null);
      }
    },
    [agentId, policyEnabled, skipCron],
  );

  return (
    <ManagePane
      title="Tool Policy"
      backHref="/manage"
      subtitle="Persistent allow/deny rules for tool calls."
      actions={
        <div className="flex items-center gap-2">
          {confirmClear ? (
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">Clear all?</span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void clearAll()}
                disabled={clearing}
              >
                {clearing ? <Loader2 size={14} className="animate-spin" /> : 'Yes'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmClear(false)}
                disabled={clearing}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmClear(true)}
              disabled={loading || rules.length === 0}
              className="gap-1.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={14} /> Clear all
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            onClick={() => setAdding(true)}
            className="gap-1.5"
            disabled={adding}
          >
            <Plus size={14} /> New rule
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

      <ManageCard className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Tool policy enabled</p>
            <p className="text-xs text-muted-foreground">
              Master switch for the allow/deny gate. When off, all tool calls run without prompts
              and the rules below are ignored.
            </p>
          </div>
          <Switch
            checked={policyEnabled}
            onCheckedChange={(v) => void updateFlag('enabled', Boolean(v))}
            disabled={savingFlag === 'enabled'}
          />
        </div>
        <div className="mt-2 flex items-start justify-between gap-4 border-t pt-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Skip policy for cron jobs</p>
            <p className="text-xs text-muted-foreground">
              When on, tool calls triggered by scheduled cron jobs bypass the approval prompt (rules
              below still apply for non-cron callers).
            </p>
          </div>
          <Switch
            checked={skipCron}
            onCheckedChange={(v) => void updateFlag('skipCron', Boolean(v))}
            disabled={savingFlag === 'skipCron' || !policyEnabled}
          />
        </div>
      </ManageCard>

      {adding && (
        <NewRuleCard
          agentId={agentId}
          onCancel={() => setAdding(false)}
          onCreated={(rule) => {
            setRules((prev) => [...prev, rule]);
            setAdding(false);
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {!loading && sorted.length === 0 && !adding && (
        <ManageCard className="border-dashed">
          <ManageEmptyState
            icon={Shield}
            title="No policy rules yet"
            description="Add an allow or deny rule to skip the approval prompt for matching tool calls."
          />
        </ManageCard>
      )}

      {sorted.map((rule, idx) => (
        <RuleCard
          key={`${rule.action}|${rule.tool}|${JSON.stringify(rule.params)}|${idx}`}
          agentId={agentId}
          rule={rule}
          onDeleted={() => removeLocal(rule)}
          onError={(msg) => setError(msg)}
        />
      ))}
    </ManagePane>
  );
}

// ---------------------------------------------------------------------------
// Existing rule row
// ---------------------------------------------------------------------------

function RuleCard({
  agentId,
  rule,
  onDeleted,
  onError,
}: {
  agentId: string;
  rule: PolicyRule;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const remove = useCallback(async () => {
    setDeleting(true);
    try {
      await manageApi(agentId, 'policy', {
        method: 'DELETE',
        body: JSON.stringify({
          action: rule.action,
          tool: rule.tool,
          params: rule.params,
        }),
      });
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete rule');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [agentId, rule, onDeleted, onError]);

  const isDeny = rule.action === 'deny';
  const Icon = isDeny ? ShieldAlert : ShieldCheck;
  const paramEntries = Object.entries(rule.params || {});

  return (
    <ManageCard
      title={
        <span className="flex items-center gap-2 text-base font-semibold">
          <Icon
            size={16}
            className={isDeny ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}
          />
          <span
            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-sm font-medium uppercase tracking-wider ${
              isDeny
                ? 'bg-destructive/10 text-destructive'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {rule.action}
          </span>
          <span className="font-mono">{rule.tool}</span>
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
            title="Delete rule"
          >
            <Trash2 size={14} />
          </Button>
        )
      }
    >
      <div className="space-y-2">
        {paramEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No parameter constraints — matches every call to{' '}
            <span className="font-mono">{rule.tool}</span>.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {paramEntries.map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-sm"
              >
                <span className="text-muted-foreground">{k}</span>
                <span>=</span>
                <span>{v}</span>
              </span>
            ))}
          </div>
        )}
        {(rule.added_by || rule.added_at) && (
          <p className="text-sm text-muted-foreground">
            {rule.added_by ? `Added by ${rule.added_by}` : 'Added'}
            {rule.added_at ? ` · ${new Date(rule.added_at).toLocaleString()}` : ''}
          </p>
        )}
      </div>
    </ManageCard>
  );
}

// ---------------------------------------------------------------------------
// Inline "new rule" card
// ---------------------------------------------------------------------------

interface ParamRow {
  id: number;
  key: string;
  value: string;
}

function NewRuleCard({
  agentId,
  onCancel,
  onCreated,
  onError,
}: {
  agentId: string;
  onCancel: () => void;
  onCreated: (rule: PolicyRule) => void;
  onError: (msg: string) => void;
}) {
  const [action, setAction] = useState<PolicyAction>('allow');
  const [tool, setTool] = useState('');
  const [paramRows, setParamRows] = useState<ParamRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const nextId = useMemo(() => {
    let n = 0;
    return () => {
      n += 1;
      return n;
    };
  }, []);

  const addRow = () => setParamRows((prev) => [...prev, { id: nextId(), key: '', value: '' }]);
  const removeRow = (id: number) => setParamRows((prev) => prev.filter((r) => r.id !== id));
  const updateRow = (id: number, patch: Partial<ParamRow>) =>
    setParamRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const submit = useCallback(async () => {
    setLocalError(null);
    if (!tool.trim()) {
      setLocalError('Tool name is required.');
      return;
    }
    const params: Record<string, string> = {};
    for (const row of paramRows) {
      const k = row.key.trim();
      if (!k) continue;
      params[k] = row.value;
    }
    setSaving(true);
    try {
      const created = await manageApi<PolicyRule>(agentId, 'policy', {
        method: 'POST',
        body: JSON.stringify({ action, tool: tool.trim(), params }),
      });
      onCreated(created);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create rule';
      setLocalError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  }, [agentId, action, tool, paramRows, onCreated, onError]);

  return (
    <ManageCard
      title={<span className="text-base font-semibold">New rule</span>}
      actions={
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={onCancel}
          disabled={saving}
          title="Cancel"
        >
          <X size={14} />
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-muted-foreground">Action</label>
            <div className="inline-flex rounded-md border border-border/50 bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setAction('allow')}
                className={`inline-flex items-center gap-1 rounded-sm px-3 py-1 text-sm font-medium transition ${
                  action === 'allow'
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                disabled={saving}
              >
                <ShieldCheck size={14} /> Allow
              </button>
              <button
                type="button"
                onClick={() => setAction('deny')}
                className={`inline-flex items-center gap-1 rounded-sm px-3 py-1 text-sm font-medium transition ${
                  action === 'deny'
                    ? 'bg-destructive/10 text-destructive'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                disabled={saving}
              >
                <ShieldAlert size={14} /> Deny
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-muted-foreground">Tool name</label>
            <Input
              value={tool}
              onChange={(e) => setTool(e.target.value)}
              placeholder="e.g. shell_exec, mcp:github:*, web_search"
              className="h-9 font-mono text-sm"
              disabled={saving}
            />
            <p className="text-sm text-muted-foreground">
              Wildcards <span className="font-mono">*</span> are supported (e.g.{' '}
              <span className="font-mono">mcp:github:*</span>).
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-muted-foreground">
              Parameter constraints (optional)
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={addRow}
              className="gap-1 text-sm"
              disabled={saving}
            >
              <Plus size={12} /> Add param
            </Button>
          </div>
          {paramRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No constraints — rule matches every call to this tool.
            </p>
          ) : (
            <div className="space-y-2">
              {paramRows.map((row) => (
                <div key={row.id} className="flex items-center gap-2">
                  <Input
                    value={row.key}
                    onChange={(e) => updateRow(row.id, { key: e.target.value })}
                    placeholder="param"
                    className="h-9 max-w-48 font-mono text-sm"
                    disabled={saving}
                  />
                  <span className="text-muted-foreground">=</span>
                  <Input
                    value={row.value}
                    onChange={(e) => updateRow(row.id, { value: e.target.value })}
                    placeholder="value"
                    className="h-9 flex-1 font-mono text-sm"
                    disabled={saving}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(row.id)}
                    disabled={saving}
                    title="Remove"
                  >
                    <X size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {localError && <p className="text-sm text-destructive">{localError}</p>}

        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => void submit()}
            disabled={saving || !tool.trim()}
            className="gap-1.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save rule
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    </ManageCard>
  );
}
