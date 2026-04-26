'use client';

import { memo } from 'react';
import { Wrench } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
          <Switch
            checked={enabled}
            disabled={loading}
            onCheckedChange={(next) => void update({ managementDashboard: next })}
          />
        </div>
      </div>
    </div>
  );
});
