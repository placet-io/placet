'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UserPreferences } from '@placet/shared';
import { api } from '@/lib/api';

type Patch = Partial<Pick<UserPreferences, 'theme' | 'managementDashboard'>>;

export function usePreferences() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<UserPreferences>('/api/preferences');
        if (!cancelled) setPreferences(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load preferences');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(
    async (patch: Patch) => {
      // Optimistic update so the UI reflects the change immediately.
      const previous = preferences;
      setPreferences((cur) => (cur ? { ...cur, ...patch } : cur));
      setError(null);
      try {
        const next = await api<UserPreferences>('/api/preferences', {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        setPreferences(next);
        return next;
      } catch (e) {
        // Roll back to the prior state and surface the error to callers.
        setPreferences(previous);
        const message = e instanceof Error ? e.message : 'Failed to update preferences';
        setError(message);
        throw e;
      }
    },
    [preferences],
  );

  return { preferences, loading, error, update };
}
