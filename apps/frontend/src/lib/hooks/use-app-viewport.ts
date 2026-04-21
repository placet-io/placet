'use client';

import { useEffect } from 'react';

/**
 * Mirrors the visual viewport height into `--app-height` on the document root
 * so the app shell shrinks cleanly when the mobile keyboard opens.
 *
 * On iOS Safari (which ignores `interactiveWidget`) the layout viewport keeps
 * its full size when the keyboard appears – `position: fixed` elements then
 * end up hidden behind the keyboard. By driving body height from
 * `visualViewport.height` and re-pinning the layout viewport scroll to 0, the
 * content always stays glued to the visible area without `transform` hacks.
 *
 * Android Chrome with `interactiveWidget: 'resizes-visual'` behaves the same
 * way, so a single code path works for both engines.
 */
export function useAppViewport(): void {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;

    const apply = () => {
      const height = vv?.height ?? window.innerHeight;
      root.style.setProperty('--app-height', `${height}px`);
    };

    // Re-pin the layout viewport so iOS Safari can't leave the page scrolled
    // up behind the keyboard.
    const pin = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
    };

    apply();

    if (vv) {
      vv.addEventListener('resize', apply);
      vv.addEventListener('scroll', apply);
    }
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    window.addEventListener('scroll', pin, { passive: true });

    return () => {
      if (vv) {
        vv.removeEventListener('resize', apply);
        vv.removeEventListener('scroll', apply);
      }
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      window.removeEventListener('scroll', pin);
      root.style.removeProperty('--app-height');
    };
  }, []);
}
