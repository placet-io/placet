'use client';

import { useCallback, useState } from 'react';

const STORAGE_KEY = 'placet:chat-settings';

interface ChatSettings {
  inlineHtml: boolean;
}

const DEFAULTS: ChatSettings = {
  inlineHtml: false,
};

function load(): ChatSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ChatSettings>) };
  } catch {
    return DEFAULTS;
  }
}

export function useChatSettings() {
  const [settings, setSettings] = useState<ChatSettings>(load);

  const update = useCallback((patch: Partial<ChatSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { settings, update };
}
