'use client';

/**
 * Fly-to-cart engine.
 *
 * A single registered cart anchor (the floating cart button) receives every
 * flight. The engine clones the product image into a fixed-position layer,
 * animates it along a sampled quadratic curve with the Web Animations API, and
 * removes the clone when the animation finishes or is cancelled. No React
 * state is involved, so concurrent flights and route changes cannot leak
 * elements.
 */

const FLIGHT_DURATION_MS = 720;
const MAX_CONCURRENT_FLIGHTS = 4;
const STEPS = 18;

let cartAnchor: HTMLElement | null = null;
let activeFlights = 0;
const landingListeners = new Set<() => void>();

/** The floating cart button registers itself so flights know where to land. */
export function registerCartAnchor(element: HTMLElement | null): void {
  cartAnchor = element;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Subscribe to successful landings (used for the cart bounce + badge pulse). */
export function onCartFlightLanded(listener: () => void): () => void {
  landingListeners.add(listener);
  return () => {
    landingListeners.delete(listener);
  };
}

function emitLanded(): void {
  landingListeners.forEach((listener) => listener());
}

function quadraticPoint(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
  };
}

/**
 * Finds the product media for a trigger button: the closest card/panel that
 * owns it, otherwise the page-level product media (PDP).
 */
function resolveMediaElement(trigger: HTMLElement | null): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  const scoped =
    trigger?.closest<HTMLElement>('[data-product-media]') ??
    trigger?.closest<HTMLElement>('article') ??
    trigger?.closest<HTMLElement>('aside');

  const scopedImage = scoped?.querySelector('img');
  if (scopedImage) return scopedImage;

  return document.querySelector<HTMLElement>('main [data-product-media] img');
}

/**
 * Launches a flight from the product image nearest `trigger` to the cart icon.
 * `fallbackSrc` keeps the animation alive when the image node is not mounted.
 */
export function flyProductImageToCart(trigger: HTMLElement | null, fallbackSrc?: string): void {
  if (typeof document === 'undefined') return;

  const anchor = cartAnchor;
  if (!anchor || !anchor.isConnected) return;

  // Reduced motion: keep the landing feedback, skip the travel.
  if (prefersReducedMotion()) {
    emitLanded();
    return;
  }

  if (activeFlights >= MAX_CONCURRENT_FLIGHTS) return;

  const media = resolveMediaElement(trigger);
  const sourceRect = (media ?? trigger)?.getBoundingClientRect();
  const targetRect = anchor.getBoundingClientRect();
  if (!sourceRect || sourceRect.width < 24 || sourceRect.height < 24) return;

  const src =
    media instanceof HTMLImageElement && (media.currentSrc || media.src)
      ? media.currentSrc || media.src
      : fallbackSrc;
  if (!src) return;

  const startCenter = {
    x: sourceRect.left + sourceRect.width / 2,
    y: sourceRect.top + sourceRect.height / 2,
  };
  const endCenter = {
    x: targetRect.left + targetRect.width / 2,
    y: targetRect.top + targetRect.height / 2,
  };

  // Lift the curve above both points so the image sweeps rather than slides.
  const lift = Math.min(180, Math.max(70, Math.abs(startCenter.y - endCenter.y) * 0.22 + 70));
  const control = {
    x: (startCenter.x + endCenter.x) / 2 + (endCenter.x - startCenter.x) * 0.06,
    y: Math.min(startCenter.y, endCenter.y) - lift,
  };

  const size = Math.min(sourceRect.width, sourceRect.height, 280);
  const endScale = Math.max(0.14, Math.min(0.32, (targetRect.width * 0.85) / size));
  const spin = endCenter.x >= startCenter.x ? 10 : -10;

  const clone = document.createElement('div');
  clone.setAttribute('aria-hidden', 'true');
  clone.setAttribute('data-cart-flight', 'true');
  clone.style.cssText = [
    'position:fixed',
    `left:${startCenter.x - size / 2}px`,
    `top:${startCenter.y - size / 2}px`,
    `width:${size}px`,
    `height:${size}px`,
    'pointer-events:none',
    'z-index:60',
    'border-radius:14px',
    'overflow:hidden',
    'box-shadow:0 18px 40px rgba(0,0,0,0.28)',
    'will-change:transform,opacity',
    'transform-origin:center center',
  ].join(';');

  const image = document.createElement('img');
  image.src = src;
  image.alt = '';
  image.decoding = 'async';
  image.draggable = false;
  image.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
  clone.appendChild(image);

  const frames: Keyframe[] = [];
  for (let index = 0; index <= STEPS; index += 1) {
    const progress = index / STEPS;
    const point = quadraticPoint(startCenter, control, endCenter, progress);
    // Scale eases in late so the tee reads as a product, not a shrinking dot.
    const eased = Math.pow(progress, 1.15);
    const scale = 1 + (endScale - 1) * eased;
    const rotation = spin * Math.sin(Math.PI * progress);
    const opacity = progress < 0.86 ? 1 : Math.max(0, 1 - (progress - 0.86) / 0.14);

    frames.push({
      offset: progress,
      transform: `translate3d(${point.x - startCenter.x}px, ${point.y - startCenter.y}px, 0) scale(${scale}) rotate(${rotation}deg)`,
      opacity,
    });
  }

  document.body.appendChild(clone);
  activeFlights += 1;

  let settled = false;
  let safetyTimer = 0;

  const finish = (landed: boolean) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(safetyTimer);
    clone.remove();
    activeFlights = Math.max(0, activeFlights - 1);
    if (landed) emitLanded();
  };

  const animation = clone.animate(frames, {
    duration: FLIGHT_DURATION_MS,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    fill: 'forwards',
  });

  animation.addEventListener('finish', () => finish(true));
  animation.addEventListener('cancel', () => finish(false));

  // Safety net: a backgrounded tab can pause animations indefinitely.
  safetyTimer = window.setTimeout(() => finish(true), FLIGHT_DURATION_MS + 1200);
}
