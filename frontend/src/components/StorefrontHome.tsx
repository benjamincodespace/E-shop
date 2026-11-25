'use client';

import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Heart,
  Home,
  LayoutGrid,
  Package,
  RefreshCw,
  ShieldCheck,
  Shirt,
  Truck,
  User as UserIcon,
} from 'lucide-react';
import type { Category, Product } from '@/types/store';
import { useStore } from '@/context/StoreContext';
import { ProductCard } from './ProductCard';
import { ProductCardSkeleton } from './ProductCardSkeleton';
import { ProductQuickPanel } from './ProductQuickPanel';
import { SafeImage } from './SafeImage';
import { filterAndSortProducts } from '@/lib/storeLogic';

const HERO_SLIDES = [
  {
    title: 'Premium T-Shirts',
    subtitle: 'Style. Comfort. You.',
    cta: 'Shop Now',
    image: '/images/hero_monochrome_tee_1795513062252.jpg',
    category: 'all',
  },
  {
    title: 'Heavyweight Studio Cuts',
    subtitle: '280gsm organic cotton. Tailored drape.',
    cta: 'Explore Streetwear',
    image: '/images/tee_charcoal_oversized_1795513063222.jpg',
    category: 'streetwear',
  },
];

interface StorefrontHomeProps {
  initialCategories?: Category[];
  initialProducts?: Product[];
}

export const StorefrontHome: React.FC<StorefrontHomeProps> = ({
  initialCategories = [],
  initialProducts = [],
}) => {
  const {
    products: contextProducts,
    productsLoading,
    categories: contextCategories,
    hydrateInitialCatalog,
    selectedProduct,
    setSelectedProduct,
    navigate,
    globalSearch,
  } = useStore();

  useEffect(() => {
    if (initialCategories.length > 0 || initialProducts.length > 0) {
      hydrateInitialCatalog(initialCategories, initialProducts);
    }
  }, [initialCategories, initialProducts, hydrateInitialCatalog]);

  const products = contextProducts.length > 0 ? contextProducts : initialProducts;
  const categories = contextCategories.length > 0 ? contextCategories : initialCategories;
  const loading = productsLoading && products.length === 0;

  const [heroIdx, setHeroIdx] = useState(0);
  const [activeFeedTab, setActiveFeedTab] = useState<'popular' | 'newest' | 'rated'>('popular');

  const slide = HERO_SLIDES[heroIdx];

  const displayProducts = (() => {
    const base = filterAndSortProducts(products, {
      search: globalSearch,
      sortBy:
        activeFeedTab === 'rated'
          ? 'rating'
          : activeFeedTab === 'newest'
            ? 'newest'
            : 'rating',
    });
    if (activeFeedTab === 'popular' && !globalSearch) {
      const pop = base.filter((p) => p.popular);
      return (pop.length >= 3 ? pop : base).slice(0, 6);
    }
    return base.slice(0, 6);
  })();

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 sm:py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Navigation Sidebar */}
        <aside className="hidden lg:flex lg:col-span-2 flex-col gap-5 sticky top-20">
          <nav aria-label="Store sections" className="space-y-1.5">
            <button
              type="button"
              onClick={() => navigate({ page: 'home' })}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-neutral-950 text-white text-sm font-semibold shadow-[0_8px_20px_rgba(0,0,0,0.14)] cursor-pointer"
            >
              <Home className="w-4 h-4 shrink-0" />
              <span>Home</span>
            </button>

            <button
              type="button"
              onClick={() => navigate({ page: 'catalog' })}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-neutral-700 hover:bg-neutral-100 text-sm font-medium transition-colors cursor-pointer"
            >
              <LayoutGrid className="w-4 h-4 shrink-0" />
              <span>Categories</span>
            </button>

            <button
              type="button"
              onClick={() => navigate({ page: 'favorites' })}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-neutral-700 hover:bg-neutral-100 text-sm font-medium transition-colors cursor-pointer"
            >
              <Heart className="w-4 h-4 shrink-0" />
              <span>Favorites</span>
            </button>

            <button
              type="button"
              onClick={() => navigate({ page: 'orders' })}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-neutral-700 hover:bg-neutral-100 text-sm font-medium transition-colors cursor-pointer"
            >
              <Package className="w-4 h-4 shrink-0" />
              <span>My Orders</span>
            </button>

            <button
              type="button"
              onClick={() => navigate({ page: 'profile' })}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-neutral-700 hover:bg-neutral-100 text-sm font-medium transition-colors cursor-pointer"
            >
              <UserIcon className="w-4 h-4 shrink-0" />
              <span>Profile</span>
            </button>
          </nav>

          {/* Free Shipping Promo Card */}
          <div className="bg-neutral-100/90 border border-neutral-200/70 rounded-2xl p-5 text-center">
            <div className="w-11 h-11 rounded-2xl bg-white shadow-sm flex items-center justify-center mx-auto text-neutral-950">
              <Shirt className="w-5 h-5" />
            </div>
            <h3 className="mt-3 font-display text-sm font-bold text-neutral-950">Free Shipping</h3>
            <p className="mt-1 text-xs text-neutral-500">On orders over $50</p>
            <button
              type="button"
              onClick={() => navigate({ page: 'catalog' })}
              className="mt-4 w-full py-2 px-3 rounded-full bg-neutral-950 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <span>Shop Now</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </aside>

        {/* Center Storefront Content */}
        <section className="lg:col-span-6 space-y-6">
          {/* Hero Promotional Banner */}
          <div className="relative rounded-3xl overflow-hidden bg-neutral-100 border border-neutral-200/70 min-h-[220px] sm:min-h-[260px] flex items-center">
            <SafeImage
              src={slide.image}
              alt={slide.title}
              eager
              className="absolute inset-0 w-full h-full object-cover object-right sm:object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/15 sm:from-white/95 sm:via-white/75 sm:to-transparent" />

            <div className="relative z-10 p-6 sm:p-8 max-w-[260px] sm:max-w-sm">
              <h1 className="font-display text-2xl sm:text-4xl font-bold text-neutral-950 tracking-tight leading-[1.08]">
                {slide.title}
              </h1>
              <p className="mt-2 sm:mt-2.5 text-xs sm:text-base text-neutral-700 font-medium">{slide.subtitle}</p>
              <button
                type="button"
                onClick={() => navigate({ page: 'catalog', category: slide.category })}
                className="mt-4 sm:mt-5 px-5 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold inline-flex items-center gap-2 hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <span>{slide.cta}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Carousel Controls */}
            <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous hero banner"
                onClick={() => setHeroIdx((i) => (i === 0 ? HERO_SLIDES.length - 1 : i - 1))}
                className="w-8 h-8 rounded-full glass-surface border border-white/80 flex items-center justify-center text-neutral-900 hover:bg-white cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Next hero banner"
                onClick={() => setHeroIdx((i) => (i + 1) % HERO_SLIDES.length)}
                className="w-8 h-8 rounded-full glass-surface border border-white/80 flex items-center justify-center text-neutral-900 hover:bg-white cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5">
              {HERO_SLIDES.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Hero slide ${idx + 1}`}
                  onClick={() => setHeroIdx(idx)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    heroIdx === idx ? 'w-5 bg-neutral-950' : 'w-1.5 bg-neutral-400'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Service Highlights Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { icon: Truck, title: 'Free Shipping', sub: 'Orders over $50' },
              { icon: RefreshCw, title: 'Easy Returns', sub: 'Within 7 days' },
              { icon: ShieldCheck, title: 'Verified Quality', sub: '240gsm cotton' },
              { icon: Shirt, title: 'Minimalist Fit', sub: 'Sizes S to XXL' },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-neutral-50 border border-neutral-200/70"
              >
                <item.icon className="w-4 h-4 text-neutral-800 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-neutral-950 truncate">{item.title}</p>
                  <p className="text-[11px] text-neutral-500 truncate">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Categories Quick Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
            <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl shrink-0">
              {(
                [
                  { id: 'popular', label: 'Popular' },
                  { id: 'newest', label: 'New Arrivals' },
                  { id: 'rated', label: 'Top Rated' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFeedTab(tab.id)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    activeFeedTab === tab.id
                      ? 'bg-white text-neutral-950 shadow-sm'
                      : 'text-neutral-600 hover:text-neutral-950'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => navigate({ page: 'catalog' })}
              className="text-xs font-semibold text-neutral-700 hover:text-neutral-950 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>See All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Product Grid */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <ProductCardSkeleton key={n} />
              ))}
            </div>
          ) : displayProducts.length === 0 ? (
            <div className="bg-neutral-50 border border-neutral-200/80 rounded-2xl p-8 text-center">
              <p className="font-display text-base font-semibold text-neutral-950">No matching T-shirts</p>
              <p className="mt-1 text-xs text-neutral-500">
                Try clearing your search filter or exploring the full catalog.
              </p>
              <button
                type="button"
                onClick={() => navigate({ page: 'catalog' })}
                className="mt-4 px-5 py-2 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
              >
                Explore All T-Shirts
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {displayProducts.map((prod) => (
                <ProductCard
                  key={prod.id}
                  product={prod}
                  isSelected={selectedProduct?.id === prod.id}
                  onSelect={(p) => {
                    setSelectedProduct(p);
                    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                      navigate({ page: 'product', slug: p.slug });
                    }
                  }}
                />
              ))}
            </div>
          )}

          {/* Category Directory Strip */}
          {categories.length > 0 && (
            <div className="pt-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-base font-bold text-neutral-950">Browse by Category</h2>
                <button
                  type="button"
                  onClick={() => navigate({ page: 'catalog' })}
                  className="text-xs font-medium text-neutral-600 hover:text-neutral-950 cursor-pointer"
                >
                  All Categories
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => navigate({ page: 'catalog', category: cat.slug })}
                    className="p-3 rounded-2xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200/70 text-left transition-colors cursor-pointer"
                  >
                    <p className="font-display text-xs font-bold text-neutral-950 truncate">{cat.name}</p>
                    <p className="text-[11px] text-neutral-500 mt-0.5 tabular-nums">
                      {cat.productCount ?? 0} tees
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Right Sticky Product Details Panel */}
        <div className="hidden lg:block lg:col-span-4">
          <ProductQuickPanel product={selectedProduct || products[0] || null} />
        </div>
      </div>
    </div>
  );
};
