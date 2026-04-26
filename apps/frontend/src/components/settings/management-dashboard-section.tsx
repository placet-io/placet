'use client';

import { memo } from 'react';
import { Wrench } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { usePreferences } from '@/lib/hooks/use-preferences';

export const ManagementDashboardSection = memo(function ManagementDashboardSection() {
  const { preferences, loading, update } = usePreferences();
  const enabled = preferences?.managementDashboard ?? false;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <Wrench className="text-muted-foreground" size={24} />
        <h2 className="text-xl font-semibold text-foreground">Agent Management</h2>
      </div>

      <div className="space-y-3">
        <Label className="text-muted-foreground">Dashboard</Label>
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Show the Agent Management area</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Adds a <span className="font-medium">Manage</span> entry to the sidebar. From there
              you can inspect sessions, audit logs, cron jobs, MCP servers, workspace files and
              channel configuration of every registered agent.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={loading}
            onClick={() => void update({ managementDashboard: !enabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
              enabled ? 'bg-primary' : 'bg-input'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
});
