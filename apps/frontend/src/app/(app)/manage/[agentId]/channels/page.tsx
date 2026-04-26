'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Radio,
  Save,
  Trash2,
  Plus,
  AlertTriangle,
  Loader2,
  RefreshCw,
  RotateCw,
  X,
} from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import { ManageCard, ManageEmptyState } from '@/components/manage/manage-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { manageApi } from '@/components/manage/manage-api';
import { getAvatarColor } from '@/lib/avatar';
import { cn } from '@/lib/utils';

type ChannelMap = Record<string, Record<string, unknown>>;

interface ListResponse {
  channels: ChannelMap;
}

export default function AgentChannelsPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [channels, setChannels] = useState<ChannelMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restartRequired, setRestartRequired] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await manageApi<ListResponse>(agentId, 'channels');
      setChannels(data.channels ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load channels');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const names = useMemo(() => Object.keys(channels).sort(), [channels]);

  const restart = useCallback(async () => {
    try {
      await manageApi(agentId, 'commands/restart', { method: 'POST', body: '{}' });
      setRestartRequired(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restart failed');
    }
  }, [agentId]);

  const valid = /^[a-z][a-z0-9_-]{0,63}$/.test(newName);
  const exists = names.includes(newName);

  const confirmAdd = async () => {
    if (!valid || exists || addBusy) return;
    setAddBusy(true);
    setAddError(null);
    try {
      await manageApi(agentId, `channels/${encodeURIComponent(newName)}`, {
        method: 'PUT',
        body: '{}',
      });
      setChannels((prev) => ({ ...prev, [newName]: {} }));
      setRestartRequired(true);
      setNewName('');
      setAdding(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to create channel');
    } finally {
      setAddBusy(false);
    }
  };

  return (
    <ManagePane
      title="Channels"
      backHref="/manage"
      subtitle="Free-form channel configuration. Changes require a restart."
      actions={
        <div className="flex items-center gap-2">
          {restartRequired && (
            <Button variant="default" size="sm" onClick={() => void restart()} className="gap-1.5">
              <RotateCw size={14} /> Restart now
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            onClick={() => setAdding(true)}
            className="gap-1.5"
            disabled={adding}
          >
            <Plus size={14} /> New channel
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

      {restartRequired && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-foreground">
            Configuration saved. The agent must be restarted for the changes to take effect.
          </p>
        </div>
      )}

      {adding && (
        <ManageCard
          title={
            <span className="flex items-center gap-2 text-base font-semibold">
              <Plus size={16} className="text-muted-foreground" /> New channel
            </span>
          }
          actions={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => {
                setAdding(false);
                setNewName('');
                setAddError(null);
              }}
              title="Cancel"
            >
              <X size={14} />
            </Button>
          }
        >
          <div className="space-y-2">
            <Input
              placeholder="e.g. telegram"
              value={newName}
              onChange={(e) => setNewName(e.target.value.toLowerCase())}
              className="h-9 text-sm rounded-md max-w-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmAdd();
                else if (e.key === 'Escape') {
                  setAdding(false);
                  setNewName('');
                  setAddError(null);
                }
              }}
            />
            {newName && !valid && (
              <p className="text-sm text-destructive">
                Lower-case letters, digits, _ and -. Must start with a letter.
              </p>
            )}
            {valid && exists && (
              <p className="text-sm text-destructive">
                A channel named &quot;{newName}&quot; already exists.
              </p>
            )}
            {addError && <p className="text-sm text-destructive">{addError}</p>}
            <div className="flex gap-2 pt-1">
              <Button
                variant="default"
                size="sm"
                onClick={() => void confirmAdd()}
                disabled={!valid || exists || addBusy}
                className="gap-1.5"
              >
                {addBusy ? <Loader2 size={14} className="animate-spin" /> : null}
                Create
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setNewName('');
                  setAddError(null);
                }}
                disabled={addBusy}
              >
                Cancel
              </Button>
            </div>
          </div>
        </ManageCard>
      )}

      {!loading && names.length === 0 && !adding && (
        <ManageCard className="border-dashed">
          <ManageEmptyState
            icon={Radio}
            title="No channels yet"
            description="Add a channel to connect this agent to an external surface."
          />
        </ManageCard>
      )}

      {names.map((name) => (
        <ChannelCard
          key={name}
          agentId={agentId}
          name={name}
          initial={channels[name] ?? {}}
          onSaved={(updated) => {
            setChannels((prev) => ({ ...prev, [name]: updated }));
            setRestartRequired(true);
          }}
          onDeleted={() => {
            setChannels((prev) => {
              const next = { ...prev };
              delete next[name];
              return next;
            });
            setRestartRequired(true);
          }}
        />
      ))}
    </ManagePane>
  );
}

function ChannelCard({
  agentId,
  name,
  initial,
  onSaved,
  onDeleted,
}: {
  agentId: string;
  name: string;
  initial: Record<string, unknown>;
  onSaved: (updated: Record<string, unknown>) => void;
  onDeleted: () => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(initial, null, 2));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const parseError = useMemo(() => {
    try {
      JSON.parse(text);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid JSON';
    }
  }, [text]);

  const dirty = text !== JSON.stringify(initial, null, 2);

  const save = useCallback(async () => {
    if (parseError) return;
    setSaving(true);
    setErr(null);
    try {
      const body = JSON.parse(text);
      await manageApi(agentId, `channels/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      onSaved(body);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [agentId, name, text, parseError, onSaved]);

  const remove = useCallback(async () => {
    if (!window.confirm(`Delete channel "${name}"? This cannot be undone.`)) return;
    setDeleting(true);
    setErr(null);
    try {
      await manageApi(agentId, `channels/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      onDeleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }, [agentId, name, onDeleted]);

  return (
    <ManageCard
      title={
        <span className="flex items-center gap-2 min-w-0">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: getAvatarColor(name) }}
          />
          <span className="text-base font-semibold text-foreground truncate">{name}</span>
        </span>
      }
      actions={
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void remove()}
            disabled={deleting || saving}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => void save()}
            disabled={saving || !!parseError || !dirty}
            className="gap-1.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className={cn(
            'w-full min-h-72 rounded-lg border bg-background p-3 text-sm font-mono resize-vertical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            parseError ? 'border-destructive/60' : 'border-border/60',
          )}
        />

        {parseError && <p className="text-sm text-destructive">{parseError}</p>}
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>
    </ManageCard>
  );
}
