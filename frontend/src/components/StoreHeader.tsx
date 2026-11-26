'use client';

import React, { useEffect, useState } from 'react';
import { Heart, Home, LayoutGrid, Search, ShoppingCart } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { calculateCartSummary } from '@/lib/storeLogic';
import { useAutoHideBars } from '@/lib/useAutoHideBars';
import { BrandLogo } from './BrandLogo';

export const StoreHeader: React.FC = () => {
  const { route, navigate, cart, wishlistIds, globalSearch, setGlobalSearch } = useStore();
  const barsHidden = useAutoHideBars();
  const [localSearch, setLocalSearch] = useState(globalSearch);
  const { itemCount } = calculateCartSummary(cart);

  // Keep the header input in sync when search is changed elsewhere (e.g. filters reset).
  useEffect(() => {
    setLocalSearch(globalSearch);
  }, [globalSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalSearch(localSearch);
    if (route.page !== 'catalog' && route.page !== 'home') {
      navigate({ page: 'catalog' });
    }
  };

  return (
    <header
      className={`sticky top-0 z-30 glass-surface border-b border-neutral-200/80 transition-[transform,opacity] will-change-transform ${
        barsHidden
          ? '-translate-y-full opacity-0 pointer-events-none duration-200 ease-[cubic-bezier(0.4,0,1,1)]'
          : 'translate-y-0 opacity-100 duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]'
      }`}
      inert={barsHidden ? true : undefined}
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => navigate({ page: 'home' })}
          className="shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-neutral-950 rounded-lg"
          aria-label="TeeStore Home"
        >
          <BrandLogo subtitle="Wear Your Style" />
        </button>

        {/* Zone 2: Clean Single-Line Nav + Search */}
        <div className="hidden md:flex items-center gap-6 flex-1 max-w-2xl">
          <nav aria-label="Primary navigation" className="flex items-center gap-5 text-xs font-semibold text-neutral-600">
            <button
              type="button"
              onClick={() => navigate({ page: 'home' })}
              className={`whitespace-nowrap shrink-0 hover:text-neutral-950 transition-colors cursor-pointer ${
                route.page === 'home' ? 'text-neutral-950 underline underline-offset-4' : ''
              }`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'catalog' })}
              className={`whitespace-nowrap shrink-0 hover:text-neutral-950 transition-colors cursor-pointer ${
                route.page === 'catalog' ? 'text-neutral-950 underline underline-offset-4' : ''
              }`}
            >
              Catalog
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'about' })}
              className={`whitespace-nowrap shrink-0 hover:text-neutral-950 transition-colors cursor-pointer ${
                route.page === 'about' ? 'text-neutral-950 underline underline-offset-4' : ''
              }`}
            >
              About
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'admin' })}
              className="whitespace-nowrap shrink-0 hover:text-neutral-950 transition-colors cursor-pointer"
            >
              Admin
            </button>
          </nav>

          <form
            onSubmit={handleSearchSubmit}
            className="flex-1 flex items-center gap-2 bg-neutral-100/90 border border-neutral-200/70 rounded-full px-3.5 py-2"
          >
            <Search className="w-4 h-4 text-neutral-400 shrink-0" />
            <input
              type="search"
              value={localSearch}
              onChange={(e) => {
                setLocalSearch(e.target.value);
                setGlobalSearch(e.target.value);
              }}
              placeholder="Search T-shirts..."
              aria-label="Search T-shirts"
              className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
            />
          </form>
        </div>

        {/* Zone 3: Wishlist and Cart Badge */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => navigate({ page: 'favorites' })}
            aria-label={`Favorites (${wishlistIds.length})`}
            className="relative w-10 h-10 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-800 transition-colors cursor-pointer"
          >
            <Heart className="w-4.5 h-4.5" />
            {wishlistIds.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-neutral-950" />
            )}
          </button>

          <button
            type="button"
            onClick={() => navigate({ page: 'cart' })}
            aria-label={`Shopping cart (${itemCount} items)`}
            className="relative w-10 h-10 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-800 transition-colors cursor-pointer"
          >
            <ShoppingCart className="w-4.5 h-4.5" />
            {itemCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-neutral-950 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {itemCount}
              </span>
            )}
          </button>

        </div>
      </div>

      {/* Mobile Search Bar */}
      <div className="md:hidden px-4 pb-3">
        <form
          onSubmit={handleSearchSubmit}
          className="flex items-center gap-2 bg-neutral-100 rounded-full px-3.5 py-2"
        >
          <Search className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            type="search"
            value={localSearch}
            onChange={(e) => {
              setLocalSearch(e.target.value);
              setGlobalSearch(e.target.value);
            }}
            placeholder="Search T-shirts..."
            aria-label="Search T-shirts on mobile"
            className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
        </form>
      </div>
    </header>
  );
};

export const MobileBottomNav: React.FC = () => {
  const { route, navigate } = useStore();
  const barsHidden = useAutoHideBars();

  const items = [
    { page: 'home' as const, label: 'Home', icon: Home },
    { page: 'catalog' as const, label: 'Categories', icon: LayoutGrid },
    { page: 'favorites' as const, label: 'Favorites', icon: Heart },
    { page: 'cart' as const, label: 'Cart', icon: ShoppingCart },
  ];

  return (
    <nav
      aria-label="Mobile navigation"
      className={`lg:hidden fixed bottom-0 inset-x-0 z-30 glass-surface border-t border-neutral-200/80 px-2 py-2 flex items-center justify-around transition-[transform,opacity] will-change-transform ${
        barsHidden
          ? 'translate-y-[120%] opacity-0 pointer-events-none duration-200 ease-[cubic-bezier(0.4,0,1,1)]'
          : 'translate-y-0 opacity-100 duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]'
      }`}
      inert={barsHidden ? true : undefined}
    >
      {items.map((it) => {
        const Icon = it.icon;
        const active = route.page === it.page;
        return (
          <button
            key={it.label}
            type="button"
            onClick={() => navigate({ page: it.page })}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[11px] font-semibold cursor-pointer ${
              active ? 'text-neutral-950' : 'text-neutral-400'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span>{it.label}</span>
            {active && <span className="w-4 h-0.5 rounded-full bg-neutral-950 mt-0.5" />}
          </button>
        );
      })}
    </nav>
  );
};
