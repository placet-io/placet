import { useEffect, useRef, useState } from 'react';

/**
 * Gradually reveals text character-by-character for a smooth typewriter effect.
 * Catches up quickly when the target gets far ahead, then slows as it nears the end.
 */
export function useTypewriter(targetText: string | null, charsPerFrame = 2): string | null {
  const [displayed, setDisplayed] = useState<string | null>(null);
  const displayedRef = useRef(0); // how many chars are currently shown
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (targetText === null) {
      // Stream ended — reset immediately
      cancelAnimationFrame(rafRef.current);
      displayedRef.current = 0;
      // Deferred to satisfy react-hooks/set-state-in-effect
      queueMicrotask(() => setDisplayed(null));
      return;
    }

    const tick = () => {
      const target = targetText;
      const current = displayedRef.current;
      if (current >= target.length) return;

      // Reveal more chars: base speed + proportional catch-up
      const remaining = target.length - current;
      const step = Math.max(charsPerFrame, Math.ceil(remaining / 6));
      const next = Math.min(current + step, target.length);
      displayedRef.current = next;
      setDisplayed(target.slice(0, next));

      if (next < target.length) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    // Start animation if we're behind
    if (displayedRef.current < targetText.length) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => cancelAnimationFrame(rafRef.current);
  }, [targetText, charsPerFrame]);

  return displayed;
}
