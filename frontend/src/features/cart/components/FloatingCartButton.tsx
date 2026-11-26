'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { calculateCartSummary } from '@/lib/storeLogic';
import { onCartFlightLanded, prefersReducedMotion, registerCartAnchor } from '../lib/cartFlight';

// The cart icon would duplicate the page CTA on these routes.
const HIDDEN_PREFIXES = ['/cart', '/checkout', '/admin'];

/**
 * Persistent floating cart. Mounted once in the store shell, it doubles as the
 * landing target for fly-to-cart animations and the live quantity badge.
 */
export const FloatingCartButton: React.FC = () => {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { cart, t } = useStore();
  const { itemCount } = calculateCartSummary(cart);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const bumpAnim = useRef<Animation | null>(null);
  const badgeAnim = useRef<Animation | null>(null);
  const flashTimer = useRef<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [highlight, setHighlight] = useState(false);

  useEffect(() => {
    registerCartAnchor(buttonRef.current);
    return () => registerCartAnchor(null);
  }, []);

  useEffect(() => {
    const unsubscribe = onCartFlightLanded(() => {
      const button = buttonRef.current;
      if (button && !prefersReducedMotion()) {
        // Restart rather than stack when several flights land together.
        bumpAnim.current?.cancel();
        bumpAnim.current = button.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(0.9)', offset: 0.22 },
            { transform: 'scale(1.08)', offset: 0.58 },
            { transform: 'scale(1)' },
          ],
          { duration: 520, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
        );

        badgeAnim.current?.cancel();
        badgeAnim.current = badgeRef.current?.animate(
          [
            { transform: 'scale(1)', offset: 0 },
            { transform: 'scale(1.4)', offset: 0.35 },
            { transform: 'scale(1)', offset: 1 },
          ],
          { duration: 420, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
        ) ?? null;
      }

      setHighlight(true);
      setFlash(true);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => {
        setHighlight(false);
        setFlash(false);
      }, 1500);
    });

    return () => {
      unsubscribe();
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      bumpAnim.current?.cancel();
      badgeAnim.current?.cancel();
    };
  }, []);

  const hidden = HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (hidden) return null;

  // With an empty cart the button is not shown, but it stays mounted so the
  // fly-to-cart animation still has a target when the first product is added.
  const hasItems = itemCount > 0;

  return (
    <div
      className={`fixed z-40 right-4 sm:right-6 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:bottom-6 flex items-center gap-2 print:hidden transition-all duration-300 ease-out ${
        hasItems ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-90 pointer-events-none'
      }`}
      aria-hidden={!hasItems}
    >
      <span
        aria-hidden="true"
        className={`hidden sm:inline-flex items-center whitespace-nowrap rounded-full bg-neutral-950 text-white text-[11px] font-semibold px-3 py-1.5 shadow-lg transition-all duration-300 ease-out ${
          flash ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'
        }`}
      >
        {t('cart.added')}
      </span>

      <button
        ref={buttonRef}
        type="button"
        onClick={() => router.push('/cart')}
        disabled={!hasItems}
        tabIndex={hasItems ? 0 : -1}
        aria-label={`${t('nav.cart')} — ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
        className={`relative w-14 h-14 rounded-full bg-neutral-950 text-white flex items-center justify-center shadow-[0_12px_32px_rgba(0,0,0,0.28)] hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 transition-colors cursor-pointer ${
          highlight ? 'ring-2 ring-white/70' : ''
        }`}
      >
        <ShoppingBag className="w-5.5 h-5.5" />
        {itemCount > 0 && (
          <span
            ref={badgeRef}
            className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-white text-neutral-950 border border-neutral-950 text-[11px] font-bold flex items-center justify-center tabular-nums"
          >
            {itemCount > 99 ? '99+' : itemCount}
          </span>
        )}
      </button>
    </div>
  );
};
