'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import { Link, Plus, Trash2, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Agent } from '@placet/shared';

type WebhookConfig = Pick<Agent, 'webhookUrl' | 'webhookHeaders' | 'webhookAuth'>;

export const WebhookSection = memo(function WebhookSection() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [config, setConfig] = useState<WebhookConfig>({
    webhookUrl: null,
    webhookHeaders: null,
    webhookAuth: null,
  });
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await api<Agent[]>('/api/agents');
      setAgents(data);
      if (data.length > 0 && !selectedAgent) {
        setSelectedAgent(data[0].id);
      }
    } catch {
      setError('Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [selectedAgent]);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  // Load config when agent selection changes
  useEffect(() => {
    const agent = agents.find((a) => a.id === selectedAgent);
    if (!agent) return;
    setConfig({
      webhookUrl: agent.webhookUrl ?? null,
      webhookHeaders: agent.webhookHeaders ?? null,
      webhookAuth: agent.webhookAuth ?? null,
    });
    const h = agent.webhookHeaders ?? {};
    setHeaders(Object.entries(h).map(([key, value]) => ({ key, value })));
    setAuthUser(agent.webhookAuth?.username ?? '');
    setAuthPass(agent.webhookAuth?.password ?? '');
    setError(null);
    setSuccess(false);
  }, [selectedAgent, agents]);

  const addHeader = useCallback(() => {
    setHeaders((prev) => [...prev, { key: '', value: '' }]);
  }, []);

  const removeHeader = useCallback((index: number) => {
    setHeaders((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateHeader = useCallback((index: number, field: 'key' | 'value', val: string) => {
    setHeaders((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: val } : h)));
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedAgent || saving) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const headerObj: Record<string, string> = {};
      for (const h of headers) {
        if (h.key.trim()) headerObj[h.key.trim()] = h.value;
      }

      const payload: Record<string, unknown> = {
        webhookUrl: config.webhookUrl?.trim() || null,
      };

      // Store headers/auth in agent metadata via PATCH
      // For now we send them as part of the agent update
      if (Object.keys(headerObj).length > 0) {
        payload.webhookHeaders = headerObj;
      } else {
        payload.webhookHeaders = null;
      }

      if (authUser.trim()) {
        payload.webhookAuth = { username: authUser.trim(), password: authPass };
      } else {
        payload.webhookAuth = null;
      }

      await api(`/api/agents/${selectedAgent}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      void fetchAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save webhook config');
    } finally {
      setSaving(false);
    }
  }, [selectedAgent, saving, config.webhookUrl, headers, authUser, authPass, fetchAgents]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <Link className="text-muted-foreground" size={24} />
        <h2 className="text-xl font-semibold text-foreground">Webhooks</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Configure default webhooks for each chat. When a user sends a message, a POST request is
        dispatched to the configured URL.
      </p>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : agents.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No chats yet. Create a chat first to configure webhooks.
        </p>
      ) : (
        <div className="bg-muted/30 rounded-2xl border border-border p-5 space-y-5">
          {/* Chat selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Chat</label>
            <select
              value={selectedAgent ?? ''}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Webhook URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Webhook URL</label>
            <Input
              placeholder="https://your-server.com/webhook"
              value={config.webhookUrl ?? ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, webhookUrl: e.target.value }))}
              className="rounded-xl text-sm font-mono"
            />
          </div>

          {/* Custom Headers */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Custom Headers</label>
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={addHeader}>
                <Plus size={12} />
                Add
              </Button>
            </div>
            {headers.length === 0 && (
              <p className="text-xs text-muted-foreground">No custom headers configured.</p>
            )}
            {headers.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="Header name"
                  value={h.key}
                  onChange={(e) => updateHeader(i, 'key', e.target.value)}
                  className="rounded-xl text-sm flex-1"
                />
                <Input
                  placeholder="Value"
                  value={h.value}
                  onChange={(e) => updateHeader(i, 'value', e.target.value)}
                  className="rounded-xl text-sm flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-error-foreground"
                  onClick={() => removeHeader(i)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>

          {/* Basic Auth */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Basic Authentication</label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Username"
                value={authUser}
                onChange={(e) => setAuthUser(e.target.value)}
                className="rounded-xl text-sm"
              />
              <div className="relative">
                <Input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Password"
                  value={authPass}
                  onChange={(e) => setAuthPass(e.target.value)}
                  className="rounded-xl text-sm pr-9"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowPass((v) => !v)}
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Credentials are sent as an{' '}
              <code className="bg-muted px-1 py-0.5 rounded text-[10px]">Authorization: Basic</code>{' '}
              header.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-error-foreground bg-error-muted rounded-xl px-4 py-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {success && (
            <p className="text-sm text-success-foreground">Webhook configuration saved.</p>
          )}

          <Button
            className={cn('rounded-xl w-full')}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            Save Webhook Configuration
          </Button>
        </div>
      )}
    </div>
  );
});
