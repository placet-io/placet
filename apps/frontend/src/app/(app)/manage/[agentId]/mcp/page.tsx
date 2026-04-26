'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Plug,
  Plus,
  Loader2,
  RefreshCw,
  Trash2,
  X,
  RotateCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import { ManageCard, ManageEmptyState } from '@/components/manage/manage-ui';
import { PillSwitch } from '@/components/manage/pill-switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { manageApi } from '@/components/manage/manage-api';

/**
 * Tokenize a shell-ish argv string. Honors single and double quotes (so
 * `--label "hello world"` becomes `['--label', 'hello world']`) and a
 * backslash escape inside double quotes (`"a\"b"` → `a"b`). Bare backslashes
 * outside quotes are passed through. This is intentionally lighter than a
 * full POSIX parser — no `~` expansion, no env substitution — but it covers
 * the common case of paths with spaces and quoted JSON args.
 */
function parseArgs(input: string): string[] {
  const out: string[] = [];
  let buf = '';
  let quote: '"' | "'" | null = null;
  let hasToken = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote === '"' && ch === '\\' && i + 1 < input.length) {
      buf += input[++i];
      hasToken = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        buf += ch;
        hasToken = true;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (hasToken) {
        out.push(buf);
        buf = '';
        hasToken = false;
      }
      continue;
    }
    buf += ch;
    hasToken = true;
  }
  if (hasToken) out.push(buf);
  return out;
}

interface MCPServer {
  name: string;
  enabled: boolean;
  connected: boolean;
  transport: string;
  tools: string[];
  error?: string | null;
}

interface ListResponse {
  items: MCPServer[];
}

type Transport = 'stdio' | 'sse' | 'streamableHttp';

const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

export default function AgentMcpPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await manageApi<ListResponse>(agentId, 'mcp');
      setServers(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load MCP servers');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () => [...servers].sort((a, b) => a.name.localeCompare(b.name)),
    [servers],
  );

  const upsert = (s: MCPServer) =>
    setServers((prev) => {
      const idx = prev.findIndex((x) => x.name === s.name);
      if (idx === -1) return [...prev, s];
      const copy = prev.slice();
      copy[idx] = s;
      return copy;
    });

  const removeLocal = (name: string) => setServers((prev) => prev.filter((x) => x.name !== name));

  return (
    <ManagePane
      title="MCP"
      backHref="/manage"
      subtitle="Model Context Protocol servers and the tools they expose."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setAdding(true)}
            className="gap-1.5"
            disabled={adding}
          >
            <Plus size={14} /> New server
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
        <NewServerCard
          agentId={agentId}
          existing={sorted.map((s) => s.name)}
          onCancel={() => setAdding(false)}
          onCreated={(s) => {
            upsert(s);
            setAdding(false);
            // Refresh to pick up connection state/tools.
            void load();
          }}
          onError={setError}
        />
      )}

      {!loading && sorted.length === 0 && !adding && (
        <ManageCard className="border-dashed">
          <ManageEmptyState
            icon={Plug}
            title="No MCP servers yet"
            description="Connect an MCP server to expose additional tools to this agent."
          />
        </ManageCard>
      )}

      {sorted.map((s) => (
        <ServerCard
          key={s.name}
          agentId={agentId}
          server={s}
          onUpdated={upsert}
          onDeleted={() => removeLocal(s.name)}
          onError={setError}
          onReload={load}
        />
      ))}
    </ManagePane>
  );
}

// ---------------------------------------------------------------------------

function ServerCard({
  agentId,
  server,
  onUpdated,
  onDeleted,
  onError,
  onReload,
}: {
  agentId: string;
  server: MCPServer;
  onUpdated: (s: MCPServer) => void;
  onDeleted: () => void;
  onError: (msg: string) => void;
  onReload: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const call = useCallback(
    async (action: 'enable' | 'disable' | 'restart' | 'delete') => {
      setBusy(true);
      try {
        if (action === 'delete') {
          await manageApi(agentId, `mcp/${encodeURIComponent(server.name)}`, {
            method: 'DELETE',
          });
          onDeleted();
          return;
        }
        const r = await manageApi<{ server: MCPServer }>(
          agentId,
          `mcp/${encodeURIComponent(server.name)}/${action}`,
          { method: 'POST', body: '{}' },
        );
        if (r?.server) onUpdated(r.server);
        else await onReload();
      } catch (e) {
        onError(e instanceof Error ? e.message : `Failed to ${action}`);
      } finally {
        setBusy(false);
        if (action === 'delete') setConfirmDelete(false);
      }
    },
    [agentId, server.name, onUpdated, onDeleted, onReload, onError],
  );

  return (
    <ManageCard
      title={
        <div className="flex flex-col gap-2 min-w-0 w-full md:flex-row md:items-center md:justify-between md:gap-3">
          <span className="flex items-center gap-2 text-base font-semibold min-w-0">
            <Plug size={16} className="text-muted-foreground shrink-0" />
            <span className="truncate">{server.name}</span>
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <ConnectionBadge server={server} />
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {server.transport}
            </span>
            {confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">Delete?</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void call('delete')}
                  disabled={busy}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : 'Yes'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => void call('restart')}
                  disabled={busy || !server.enabled}
                  title="Reconnect"
                >
                  <RotateCw size={14} /> Restart
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Enabled</div>
            <p className="text-sm text-muted-foreground">
              When off, the server is disconnected and its tools are not available.
            </p>
          </div>
          <Switch
            checked={server.enabled}
            onCheckedChange={(v) => void call(Boolean(v) ? 'enable' : 'disable')}
            disabled={busy}
          />
        </div>

        {server.error && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
            <AlertCircle size={14} className="text-destructive mt-0.5 shrink-0" />
            <div className="text-sm text-destructive wrap-break-word">{server.error}</div>
          </div>
        )}

        <div className="hidden md:block">
          <div className="text-sm font-medium text-muted-foreground mb-1.5">
            Tools ({server.tools.length})
          </div>
          {server.tools.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tools registered yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {server.tools.map((t) => (
                <span
                  key={t}
                  className="inline-flex rounded-md bg-muted px-2 py-0.5 text-sm font-mono"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </ManageCard>
  );
}

function ConnectionBadge({ server }: { server: MCPServer }) {
  if (!server.enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Disabled
      </span>
    );
  }
  if (server.error) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-sm font-medium uppercase tracking-wider text-destructive">
        <AlertCircle size={10} /> Error
      </span>
    );
  }
  if (server.connected) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-sm font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 size={10} /> Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-sm font-medium uppercase tracking-wider text-muted-foreground">
      Disconnected
    </span>
  );
}

// ---------------------------------------------------------------------------

function NewServerCard({
  agentId,
  existing,
  onCancel,
  onCreated,
  onError,
}: {
  agentId: string;
  existing: string[];
  onCancel: () => void;
  onCreated: (s: MCPServer) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<Transport>('stdio');
  const [command, setCommand] = useState('');
  const [argsText, setArgsText] = useState('');
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [creating, setCreating] = useState(false);

  const nameValid = NAME_RE.test(name);
  const nameExists = existing.includes(name);
  const bodyValid = transport === 'stdio' ? command.trim().length > 0 : url.trim().length > 0;
  const canCreate = nameValid && !nameExists && bodyValid;

  const create = useCallback(async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        name,
        type: transport,
        enabled,
      };
      if (transport === 'stdio') {
        body.command = command.trim();
        body.args = parseArgs(argsText);
      } else {
        body.url = url.trim();
      }
      const r = await manageApi<{ server: MCPServer }>(agentId, 'mcp', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (r?.server) onCreated(r.server);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to create MCP server');
      setCreating(false);
    }
  }, [agentId, canCreate, name, transport, command, argsText, url, enabled, onCreated, onError]);

  return (
    <ManageCard
      title={
        <span className="flex items-center gap-2 text-base font-semibold">
          <Plus size={16} className="text-muted-foreground" /> New MCP server
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
          <label className="block text-sm font-medium text-muted-foreground">Name</label>
          <Input
            placeholder="e.g. filesystem"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 text-sm rounded-md max-w-md font-mono"
            autoFocus
          />
          {name && !nameValid && (
            <p className="text-sm text-destructive">Letters, digits, underscore and dash only.</p>
          )}
          {nameValid && nameExists && (
            <p className="text-sm text-destructive">
              A server named &quot;{name}&quot; already exists.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-muted-foreground">Transport</label>
          <PillSwitch<Transport>
            value={transport}
            onChange={setTransport}
            aria-label="Transport"
            options={(['stdio', 'sse', 'streamableHttp'] as Transport[]).map((t) => ({
              value: t,
              label: t === 'streamableHttp' ? 'HTTP' : t,
            }))}
          />
        </div>

        {transport === 'stdio' ? (
          <>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-muted-foreground">Command</label>
              <Input
                placeholder="npx"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="h-9 text-sm rounded-md max-w-md font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-muted-foreground">Arguments</label>
              <Input
                placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                className="h-9 text-sm rounded-md font-mono"
              />
              <p className="text-sm text-muted-foreground">
                Whitespace-separated. Single and double quotes group tokens — wrap arguments
                containing spaces.
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-muted-foreground">URL</label>
            <Input
              placeholder="https://example.com/mcp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-9 text-sm rounded-md font-mono"
            />
          </div>
        )}

        <div className="flex items-start justify-between gap-4 rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Enable immediately</div>
            <p className="text-sm text-muted-foreground">
              Connect right after creation. You can toggle this later.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => setEnabled(Boolean(v))}
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
