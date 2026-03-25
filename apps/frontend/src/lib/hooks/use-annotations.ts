'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'humanproxy:annotations';
const UPDATE_EVENT = 'hp:annotation-update';

export interface AnnotationEntry {
  fileId: string;
  filename: string;
}

type AnnotationMap = Record<string, AnnotationEntry>;

function load(): AnnotationMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AnnotationMap) : {};
  } catch {
    return {};
  }
}

function persist(map: AnnotationMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota errors */
  }
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

/**
 * Manages per-attachment annotation overrides stored in localStorage.
 * All hook instances across the page stay in sync via a custom DOM event.
 *
 * Key: original attachment ID
 * Value: { fileId, filename } of the uploaded annotated file
 */
export function useAnnotations() {
  const [annotations, setAnnotations] = useState<AnnotationMap>({});

  useEffect(() => {
    setAnnotations(load());
    const sync = () => setAnnotations(load());
    window.addEventListener(UPDATE_EVENT, sync);
    return () => window.removeEventListener(UPDATE_EVENT, sync);
  }, []);

  const saveAnnotation = useCallback(
    (originalId: string, fileId: string, filename: string) => {
      const next = { ...load(), [originalId]: { fileId, filename } };
      persist(next);
      setAnnotations(next);
    },
    [],
  );

  const revertAnnotation = useCallback((originalId: string) => {
    const next = { ...load() };
    delete next[originalId];
    persist(next);
    setAnnotations(next);
  }, []);

  return { annotations, saveAnnotation, revertAnnotation };
}
