'use client';

import { AppearanceSection } from '@/components/settings/appearance-section';
import { ApiKeysSection } from '@/components/settings/api-keys-section';
import { PluginsSection } from '@/components/settings/plugins-section';
import { UserManagementSection } from '@/components/settings/user-management-section';
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer';

export default function SettingsPage() {
  return (
    <div className="flex-1 h-full overflow-y-auto bg-card rounded-t-3xl lg:rounded-b-3xl shadow-sm border border-border/50 border-b-0 lg:border-b p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-10">
        <div>
          <div className="flex items-center gap-2">
            <MobileNavDrawer />
            <h1 className="text-xl md:text-3xl font-semibold md:font-bold text-foreground">
              Settings
            </h1>
          </div>
          <p className="text-muted-foreground">Manage your API keys, preferences, and team.</p>
        </div>

        <AppearanceSection />
        <PluginsSection />
        <ApiKeysSection />
        <UserManagementSection />
      </div>
    </div>
  );
}
