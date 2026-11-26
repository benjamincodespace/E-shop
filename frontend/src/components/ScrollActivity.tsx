'use client';

import { useEffect } from 'react';

const IDLE_MS = 900;

/**
 * Marks the document as scrolling while any window or nested container scrolls,
 * then clears the flag shortly after movement stops. `globals.css` uses the flag
 * to fade the thin scrollbar thumb in and out.
 */
export const ScrollActivity: React.FC = () => {
  useEffect(() => {
    const root = document.documentElement;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      root.dataset.scrolling = 'true';
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        delete root.dataset.scrolling;
      }, IDLE_MS);
    };

    // Capture phase sees window scrolling and every nested scroll container.
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
      if (timer) clearTimeout(timer);
      delete root.dataset.scrolling;
    };
  }, []);

  return null;
};
