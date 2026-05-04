'use client';

import { memo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export const SignOutSection = memo(function SignOutSection() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore — clear cookie best-effort and continue */
    } finally {
      router.push('/login');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <LogOut className="text-muted-foreground" size={24} />
          <h2 className="text-xl font-semibold text-foreground">Sign Out</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          disabled={loading}
          className="rounded-xl"
        >
          {loading ? (
            <Loader2 size={16} className="mr-1 animate-spin" />
          ) : (
            <LogOut size={16} className="mr-1" />
          )}
          {loading ? 'Signing out…' : 'Sign Out'}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Sign out of this device. You will be redirected to the login page.
      </p>
    </div>
  );
});
