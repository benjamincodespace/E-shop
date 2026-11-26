'use client';

import { useEffect, useState } from 'react';

const IDLE_REVEAL_MS = 220;
const SCROLL_THRESHOLD = 6;
const TOP_REVEAL_AT = 24;

type Subscriber = (hidden: boolean) => void;

// One shared scroll state for every bar on the page, so the top app bar and the
// bottom bar always move together instead of each owning a separate timer.
let hidden = false;
let lastY = 0;
let frame = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let listening = false;
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
    lastY = y;
    reveal();
    return;
  }
  if (Math.abs(y - lastY) < SCROLL_THRESHOLD) return;

  lastY = y;
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    publish(true);
  });
}

function startListening() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  lastY = window.scrollY;
  // Returning to a page part-way down should not leave the bars stranded.
  if (window.scrollY <= TOP_REVEAL_AT) publish(false);
  window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
}

function stopListening() {
  if (!listening) return;
  listening = false;
  window.removeEventListener('scroll', handleScroll, { capture: true });
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  clearIdleTimer();
}

/**
 * Hides the top app bar and bottom bar while the page is scrolling and brings
 * them back as soon as scrolling settles (or the user reaches the top). Works
 * for window scrolling and nested scroll containers via a capture listener.
 */
export function useAutoHideBars(): boolean {
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
