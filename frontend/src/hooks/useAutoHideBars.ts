'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const IDLE_REVEAL_MS = 220;
const SCROLL_THRESHOLD = 6;
const TOP_REVEAL_AT = 24;
// Panes shorter than this share of the viewport are inner widgets (a cart
// summary, an admin table) and must never hide the page chrome.
const PANE_MIN_RATIO = 0.5;

type Subscriber = (hidden: boolean) => void;

// One shared scroll state for every bar on the page, so the top app bar and the
// bottom bar always move together instead of each owning a separate timer.
let hidden = false;
let frame = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
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

function clearIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function reveal() {
  clearIdleTimer();
  publish(false);
}

function handleScroll(event: Event) {
  const target = event.target;
  const element = target instanceof HTMLElement ? target : null;

  // Short inner scrollers should not move the page chrome around.
  if (element && element.clientHeight < window.innerHeight * PANE_MIN_RATIO) return;

  const key: EventTarget = element ?? window;
  const y = element ? element.scrollTop : window.scrollY;

  // Any movement keeps the bars tucked away; once the user stops, the idle
  // timer glides them back in.
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    idleTimer = null;
    publish(false);
  }, IDLE_REVEAL_MS);

  if (y <= TOP_REVEAL_AT) {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    positions.set(key, y);
    reveal();
    return;
  }

  const last = positions.get(key) ?? y;
  if (Math.abs(y - last) < SCROLL_THRESHOLD) return;

  positions.set(key, y);
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    publish(true);
  });
}

function startListening() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  positions.clear();
  // Returning to a page part-way down should not leave the bars stranded.
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
  clearIdleTimer();
}

/**
 * Hides the top app bar and bottom bar while the page is scrolling and brings
 * them back as soon as scrolling settles (or the user reaches the top). Works
 * for window scrolling and full-height panes via a capture listener.
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
    reveal();
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
