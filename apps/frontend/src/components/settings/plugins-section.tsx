'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import { Puzzle, ChevronDown, ChevronRight, Save, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { PluginManifest, PluginEnvVar } from '@placet/shared';

interface PluginConfigResponse {
  envValues: Record<string, string>;
  enabled: boolean;
  envSchema: PluginEnvVar[];
}

export const PluginsSection = memo(function PluginsSection() {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);

  const fetchPlugins = useCallback(async () => {
    try {
      const data = await api<PluginManifest[]>('/api/plugins');
      setPlugins(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plugins');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPlugins();
  }, [fetchPlugins]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <Puzzle className="text-muted-foreground" size={24} />
        <h2 className="text-xl font-semibold text-foreground">Plugins</h2>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          Loading plugins…
        </div>
      ) : plugins.length === 0 ? (
        <p className="text-sm text-muted-foreground">No plugins installed.</p>
      ) : (
        <div className="space-y-3">
          {plugins.map((plugin) => (
            <PluginCard
              key={plugin.name}
              plugin={plugin}
              expanded={expandedPlugin === plugin.name}
              onToggle={() =>
                setExpandedPlugin((prev) => (prev === plugin.name ? null : plugin.name))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ── Plugin Card ─────────────────────────────────────────────────────────────

interface PluginCardProps {
  plugin: PluginManifest;
  expanded: boolean;
  onToggle: () => void;
}

function PluginCard({ plugin, expanded, onToggle }: PluginCardProps) {
  const hasEnv = plugin.env && plugin.env.length > 0;
  const iconSrc = plugin.icon?.startsWith('./') ? `/api/plugins/${plugin.name}/icon` : null;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex items-center gap-3 w-full px-4 py-3 text-left transition-colors',
          hasEnv && 'hover:bg-muted/50',
          !hasEnv && 'cursor-default',
        )}
        disabled={!hasEnv}
      >
        {iconSrc ? (
          <img src={iconSrc} alt="" className="w-8 h-8 rounded-lg object-contain" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Puzzle size={16} className="text-primary" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {plugin.displayName}
            </span>
            <Badge variant="outline" className="text-xs shrink-0">
              v{plugin.version}
            </Badge>
          </div>
          {plugin.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{plugin.description}</p>
          )}
        </div>

        {hasEnv && (
          <span className="text-muted-foreground">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        )}
      </button>

      {expanded && hasEnv && <PluginConfigForm pluginName={plugin.name} envSchema={plugin.env!} />}
    </div>
  );
}

// ── Plugin Config Form ──────────────────────────────────────────────────────

interface PluginConfigFormProps {
  pluginName: string;
  envSchema: PluginEnvVar[];
}

function PluginConfigForm({ pluginName, envSchema }: PluginConfigFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api<PluginConfigResponse>(`/api/plugins/${pluginName}/config`);
        if (!cancelled) {
          setValues(data.envValues);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load config');
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [pluginName]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      await api(`/api/plugins/${pluginName}/config`, {
        method: 'PUT',
        body: JSON.stringify({ envValues: values }),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setSaving(false);
    }
  }, [pluginName, values, saving]);

  if (loading) {
    return (
      <div className="px-4 pb-4 pt-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          Loading config…
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-3">
      {error && (
        <div className="flex items-center gap-2 text-xs text-error">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {envSchema.map((envVar) => (
        <div key={envVar.key} className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            {envVar.label}
            {envVar.required && <span className="text-error ml-0.5">*</span>}
          </Label>
          <Input
            type={envVar.secret ? 'password' : 'text'}
            value={values[envVar.key] ?? ''}
            onChange={(e) =>
              setValues((prev) => ({
                ...prev,
                [envVar.key]: e.target.value,
              }))
            }
            placeholder={envVar.default ?? ''}
            className="h-8 text-sm rounded-lg"
          />
          {envVar.description && (
            <p className="text-xs text-muted-foreground/70">{envVar.description}</p>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 rounded-lg">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </Button>
        {success && <span className="text-xs text-success">Saved!</span>}
      </div>
    </div>
  );
}
