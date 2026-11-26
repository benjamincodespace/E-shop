'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// A scroll only flips the bar once it has moved this many pixels, so the tiny
// position changes browsers emit during momentum scrolling cannot toggle it.
const SCROLL_THRESHOLD = 10;
const TOP_REVEAL_AT = 24;
// Panes shorter than this share of the viewport are inner widgets (a cart
// summary, an admin table) and must never hide the page chrome.
const PANE_MIN_RATIO = 0.5;

type Subscriber = (hidden: boolean) => void;

// One shared state for every top app bar on the page, so reading it in more
// than one component never starts competing listeners or timers.
let hidden = false;
let frame = 0;
let listening = false;
// Each scroll container keeps its own last position, so scrolling a pane and
// then the window does not trip the movement threshold.
const positions = new Map<EventTarget, number>();
const subscribers = new Set<Subscriber>();

function publish(next: boolean) {
  if (hidden === next) return;
  hidden = next;
  subscribers.forEach((subscriber) => subscriber(hidden));
}

function claimFrame(delta: number) {
  // Only the latest direction in a frame matters, and only one publish happens
  // per frame, so a fast gesture slides the bar instead of flickering it.
  if (frame) cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    frame = 0;
    publish(delta > 0);
  });
}

function handleScroll(event: Event) {
  const target = event.target;
  const element = target instanceof HTMLElement ? target : null;

  // Short inner scrollers should not move the page chrome around.
  if (element && element.clientHeight < window.innerHeight * PANE_MIN_RATIO) return;

  const key: EventTarget = element ?? window;
  const y = element ? element.scrollTop : window.scrollY;

  // Near the top the app bar always stays visible.
  if (y <= TOP_REVEAL_AT) {
    positions.set(key, y);
    if (hidden) publish(false);
    return;
  }

  const last = positions.get(key);
  if (last === undefined) {
    positions.set(key, y);
    return;
  }

  const delta = y - last;
  if (Math.abs(delta) < SCROLL_THRESHOLD) return;

  // When a pane is already at its bottom edge, a layout change (the header
  // hiding and the desktop frame growing by its height) clamps the scroll
  // position upward. Treating that clamp as a real upward gesture re-shows the
  // bar, which shrinks the frame again — an endless toggle loop. Only genuine
  // upward movement away from the bottom should reveal the bar.
  const scrollHeight = element ? element.scrollHeight : document.documentElement.scrollHeight;
  const viewportHeight = element ? element.clientHeight : window.innerHeight;
  const atBottom = y + viewportHeight >= scrollHeight - 1;
  if (delta < 0 && atBottom) {
    positions.set(key, y);
    return;
  }

  positions.set(key, y);
  claimFrame(delta);
}

function startListening() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  positions.clear();
  // Returning to a page part-way down should not leave the bar stranded.
  if (window.scrollY <= TOP_REVEAL_AT) publish(false);
  window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
}

function stopListening() {
  if (!listening) return;
  listening = false;
  window.removeEventListener('scroll', handleScroll, { capture: true });
  positions.clear();
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

/**
 * Hides the top app bar while the page scrolls down and brings it straight back
 * as soon as the user scrolls up or returns to the top. It intentionally stays
 * hidden while the page is still, so the bar only returns on an upward scroll.
 * Bottom navigation never uses this hook — it always remains visible.
 */
export function useAutoHideBars(): boolean {
  const pathname = usePathname();
  const [barsHidden, setBarsHidden] = useState(hidden);

  useEffect(() => {
    startListening();
    subscribers.add(setBarsHidden);
    setBarsHidden(hidden);
    return () => {
      subscribers.delete(setBarsHidden);
      if (subscribers.size === 0) stopListening();
    };
  }, []);

  // A new page starts at the top, so the chrome must come back even when no
  // scroll event fires to reveal it.
  useEffect(() => {
    positions.clear();
    publish(false);
  }, [pathname]);

  useEffect(() => {
    document.documentElement.dataset.barsHidden = barsHidden ? 'true' : 'false';
  }, [barsHidden]);

  useEffect(
    () => () => {
      if (subscribers.size === 0) {
        delete document.documentElement.dataset.barsHidden;
      }
    },
    [],
  );

  return barsHidden;
}
