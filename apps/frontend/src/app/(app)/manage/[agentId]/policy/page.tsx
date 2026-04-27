'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Plus,
  Loader2,
  RefreshCw,
  X,
  Save,
  Pencil,
} from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import { ManageCard } from '@/components/manage/manage-ui';
import { ManageDataTable, type ManageTableColumn } from '@/components/manage/manage-data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

/** Tools whose names start with `mcp:` / `mcp_` are MCP-wrapped (incl. `*` wildcards). */
function inferToolType(tool: string): 'MCP' | 'Built-in' {
  return /^mcp[:_]/i.test(tool) ? 'MCP' : 'Built-in';
}

/** Stable identity for a rule (same triple = same row). */
function ruleKey(r: PolicyRule): string {
  return `${r.action}|${r.tool}|${JSON.stringify(r.params ?? {})}`;
}

export default function AgentPolicyPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [policyEnabled, setPolicyEnabled] = useState(true);
  const [skipCron, setSkipCron] = useState(false);
  const [savingFlag, setSavingFlag] = useState<'enabled' | 'skipCron' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Dialog state: `null` = closed, `'new'` = create, otherwise the rule being edited. */
  const [dialogState, setDialogState] = useState<'new' | PolicyRule | null>(null);
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

  const removeRule = useCallback(
    async (rule: PolicyRule) => {
      const key = ruleKey(rule);
      // Optimistic remove; revert on failure
      setRules((prev) => prev.filter((r) => ruleKey(r) !== key));
      try {
        await manageApi(agentId, 'policy', {
          method: 'DELETE',
          body: JSON.stringify({
            action: rule.action,
            tool: rule.tool,
            params: rule.params,
          }),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete rule');
        setRules((prev) => [...prev, rule]);
      }
    },
    [agentId],
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

  const columns: ManageTableColumn<PolicyRule>[] = useMemo(
    () => [
      {
        key: 'action',
        header: 'Action',
        // Override the table's default `truncate` with `overflow-visible` so the
        // pill never gets clipped to "..." on tight columns. Icon-only below md
        // keeps the column compact on mobile without truncation artefacts.
        className: 'w-12 md:w-24 overflow-visible whitespace-nowrap',
        sort: (a, b) => a.action.localeCompare(b.action),
        cell: (r) => {
          const isDeny = r.action === 'deny';
          const Icon = isDeny ? ShieldAlert : ShieldCheck;
          return (
            <span
              title={r.action}
              className={`inline-flex items-center gap-1 rounded-full px-1.5 md:px-2 py-0.5 text-sm font-medium uppercase ${
                isDeny
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              }`}
            >
              <Icon size={12} />
              <span className="hidden md:inline">{r.action}</span>
            </span>
          );
        },
      },
      {
        key: 'tool',
        header: 'Tool',
        className: 'font-mono text-sm',
        sort: (a, b) => a.tool.localeCompare(b.tool),
        cell: (r) => <span className="truncate block">{r.tool}</span>,
      },
      {
        key: 'params',
        header: 'Parameters',
        // Allow the cell content to wrap and individual values to truncate
        // inside their own pill — the table-level `truncate` would otherwise
        // clip long URLs at the column edge.
        className: 'whitespace-normal',
        cell: (r) => {
          const entries = Object.entries(r.params || {});
          if (entries.length === 0) {
            return <span className="text-sm text-muted-foreground italic">any</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {entries.map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-sm max-w-full"
                >
                  <span className="text-muted-foreground shrink-0">{k}</span>
                  <span className="shrink-0">=</span>
                  <span className="truncate min-w-0 max-w-48 md:max-w-72 lg:max-w-96" title={v}>
                    {v}
                  </span>
                </span>
              ))}
            </div>
          );
        },
      },
      {
        key: 'type',
        header: 'Type',
        // Hidden below lg — second to disappear after "Added".
        className: 'w-28 hidden lg:table-cell',
        sort: (a, b) => inferToolType(a.tool).localeCompare(inferToolType(b.tool)),
        cell: (r) => {
          const t = inferToolType(r.tool);
          return (
            <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-sm font-normal text-foreground">
              {t}
            </span>
          );
        },
      },
      {
        key: 'added',
        header: 'Added',
        // First to disappear on smaller screens.
        className: 'w-32 text-sm text-muted-foreground hidden xl:table-cell',
        sort: (a, b) =>
          (a.added_at ? Date.parse(a.added_at) : 0) - (b.added_at ? Date.parse(b.added_at) : 0),
        cell: (r) => {
          if (!r.added_at) return <span>—</span>;
          return (
            <span className="block truncate" title={new Date(r.added_at).toLocaleString()}>
              {new Date(r.added_at).toLocaleDateString()}
            </span>
          );
        },
      },
      {
        key: 'actions',
        header: '',
        className: 'w-20 text-right whitespace-nowrap overflow-visible',
        cell: (r) => (
          <div className="flex items-center justify-end gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
              onClick={() => setDialogState(r)}
              title="Edit rule"
            >
              <Pencil size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-destructive"
              onClick={() => void removeRule(r)}
              title="Delete rule"
            >
              <X size={14} />
            </Button>
          </div>
        ),
      },
    ],
    [removeRule],
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
            onClick={() => setDialogState('new')}
            className="gap-1.5"
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

      <ManageCard flush>
        <ManageDataTable<PolicyRule>
          rows={rules}
          columns={columns}
          rowKey={ruleKey}
          pageSize={20}
          defaultSortKey="action"
          defaultSortDir="asc"
          loading={loading}
          emptyText={
            loading ? 'Loading rules…' : 'No policy rules yet. Click "New rule" to add one.'
          }
        />
      </ManageCard>

      <RuleDialog
        agentId={agentId}
        state={dialogState}
        onClose={() => setDialogState(null)}
        onSaved={(prev, next) => {
          setRules((rules) => {
            // Replace by key when editing, append when creating
            if (prev) {
              const k = ruleKey(prev);
              const idx = rules.findIndex((r) => ruleKey(r) === k);
              if (idx >= 0) {
                const copy = rules.slice();
                copy[idx] = next;
                return copy;
              }
            }
            return [...rules, next];
          });
          setDialogState(null);
        }}
        onError={(msg) => setError(msg)}
      />
    </ManagePane>
  );
}

// ---------------------------------------------------------------------------
// Create/edit rule dialog (single component, prefilled in edit mode)
// ---------------------------------------------------------------------------

interface ParamRow {
  id: number;
  key: string;
  value: string;
}

function RuleDialog({
  agentId,
  state,
  onClose,
  onSaved,
  onError,
}: {
  agentId: string;
  /** `null` = closed, `'new'` = create, otherwise the rule being edited. */
  state: 'new' | PolicyRule | null;
  onClose: () => void;
  /** `prev` is the rule being replaced when editing, `null` when creating. */
  onSaved: (prev: PolicyRule | null, next: PolicyRule) => void;
  onError: (msg: string) => void;
}) {
  const open = state !== null;
  const editing = state !== null && state !== 'new' ? state : null;
  const isEdit = editing !== null;

  const [action, setAction] = useState<PolicyAction>('allow');
  const [tool, setTool] = useState('');
  const [paramRows, setParamRows] = useState<ParamRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [nextRowId, setNextRowId] = useState(1);

  // Re-seed the form whenever the dialog opens or switches between rules.
  // Stable via JSON identity of the rule key so we don't reset on every render.
  const stateKey = state === null ? null : state === 'new' ? 'new' : ruleKey(state);
  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    if (editing) {
      setAction(editing.action);
      setTool(editing.tool);
      const entries = Object.entries(editing.params || {});
      setParamRows(entries.map((entry, i) => ({ id: i + 1, key: entry[0], value: entry[1] })));
      setNextRowId(entries.length + 1);
    } else {
      setAction('allow');
      setTool('');
      setParamRows([]);
      setNextRowId(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey]);

  const addRow = () => {
    setParamRows((prev) => [...prev, { id: nextRowId, key: '', value: '' }]);
    setNextRowId((n) => n + 1);
  };
  const removeRow = (id: number) => setParamRows((prev) => prev.filter((r) => r.id !== id));
  const updateRow = (id: number, patch: Partial<ParamRow>) =>
    setParamRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const submit = useCallback(async () => {
    setLocalError(null);
    const trimmedTool = tool.trim();
    if (!trimmedTool) {
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
      // Edit mode: backend has no PATCH for a single rule, so delete the
      // original triple first, then add the new one. Order matters in case
      // the new rule collides with the old one's tool/params.
      if (editing) {
        await manageApi(agentId, 'policy', {
          method: 'DELETE',
          body: JSON.stringify({
            action: editing.action,
            tool: editing.tool,
            params: editing.params,
          }),
        });
      }
      const created = await manageApi<PolicyRule>(agentId, 'policy', {
        method: 'POST',
        body: JSON.stringify({ action, tool: trimmedTool, params }),
      });
      onSaved(editing, created);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save rule';
      setLocalError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  }, [agentId, action, tool, paramRows, editing, onSaved, onError]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit rule' : 'New rule'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Change the action, tool name, or parameter constraints. Saving replaces the original rule.'
              : 'Add a persistent allow or deny rule that skips the approval prompt for matching tool calls.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
              <span className="font-mono">mcp:github:*</span> matches every GitHub MCP tool).
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-muted-foreground">
                Parameter constraints
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
                  <div
                    key={row.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-2 sm:flex"
                  >
                    <Input
                      value={row.key}
                      onChange={(e) => updateRow(row.id, { key: e.target.value })}
                      placeholder="param"
                      className="h-9 font-mono text-sm sm:order-1 sm:max-w-48 sm:flex-none"
                      disabled={saving}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="row-span-2 h-8 w-8 self-center rounded-lg text-muted-foreground hover:text-destructive sm:order-4 sm:row-span-1"
                      onClick={() => removeRow(row.id)}
                      disabled={saving}
                      title="Remove parameter"
                    >
                      <X size={14} />
                    </Button>
                    <span className="hidden text-muted-foreground sm:order-2 sm:inline">=</span>
                    <Input
                      value={row.value}
                      onChange={(e) => updateRow(row.id, { value: e.target.value })}
                      placeholder="value"
                      className="col-start-1 h-9 font-mono text-sm sm:order-3 sm:col-auto sm:flex-1"
                      disabled={saving}
                    />
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Use <span className="font-mono">*</span> to match any value. Parameters not listed
              here are ignored — the rule still matches even if the tool call passes additional
              arguments.
            </p>
          </div>

          {localError && <p className="text-sm text-destructive">{localError}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => void submit()}
            disabled={saving || !tool.trim()}
            className="gap-1.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEdit ? 'Save changes' : 'Create rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
