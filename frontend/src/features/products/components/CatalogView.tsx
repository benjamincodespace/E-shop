'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, LayoutGrid, List, RotateCcw } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { filterAndSortProducts } from '@/lib/storeLogic';
import { formatPrice } from '@/utils/currency';
import type { Category, PriceRangeKey, Product, SortOption } from '@/types/store';
import { ProductCard } from '@/features/products/components/ProductCard';
import { ProductCardSkeleton } from '@/components/ProductCardSkeleton';

interface CatalogViewProps {
  initialCategory?: string;
  initialSearch?: string;
  initialCategories?: Category[];
  initialProducts?: Product[];
}

// Products render in batches that grow as the shopper scrolls, so a long
// catalog is never painted all at once.
const BATCH_SIZE = 9;

const PRICE_RANGES: Array<{ key: PriceRangeKey; label: string }> = [
  { key: 'all', label: 'All Prices' },
  { key: '0-15', label: '$0 – $15' },
  { key: '15-25', label: '$15 – $25' },
  { key: '25-40', label: '$25 – $40' },
  { key: '40+', label: '$40+' },
];

export const CatalogView: React.FC<CatalogViewProps> = ({
  initialCategory,
  initialSearch,
  initialCategories = [],
  initialProducts = [],
}) => {
  const {
    products: contextProducts,
    productsLoading,
    categories: contextCategories,
    hydrateInitialCatalog,
    globalSearch,
    setGlobalSearch,
    currency,
  } = useStore();

  useEffect(() => {
    if (initialCategories.length > 0 || initialProducts.length > 0) {
      hydrateInitialCatalog(initialCategories, initialProducts);
    }
  }, [initialCategories, initialProducts, hydrateInitialCatalog]);

  useEffect(() => {
    if (initialSearch) {
      setGlobalSearch(initialSearch);
    }
  }, [initialSearch, setGlobalSearch]);

  const products = contextProducts.length > 0 ? contextProducts : initialProducts;
  const categories = contextCategories.length > 0 ? contextCategories : initialCategories;
  const loading = productsLoading && products.length === 0;

  const [categorySlug, setCategorySlug] = useState<string>(initialCategory || 'all');
  const [priceRange, setPriceRange] = useState<PriceRangeKey>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  useEffect(() => {
    setCategorySlug(initialCategory || 'all');
    setVisibleCount(BATCH_SIZE);
  }, [initialCategory]);

  const filtered = useMemo(
    () =>
      filterAndSortProducts(products, {
        search: globalSearch,
        categorySlug,
        priceRange,
        sortBy,
      }),
    [products, globalSearch, categorySlug, priceRange, sortBy],
  );

  // Filters compare USD buckets, so the labels describe those same buckets in
  // whichever currency the shopper is browsing with.
  const priceRangeLabel = (key: PriceRangeKey): string => {
    switch (key) {
      case '0-15':
        return `${formatPrice(0, 'USD', currency)} – ${formatPrice(15, 'USD', currency)}`;
      case '15-25':
        return `${formatPrice(15, 'USD', currency)} – ${formatPrice(25, 'USD', currency)}`;
      case '25-40':
        return `${formatPrice(25, 'USD', currency)} – ${formatPrice(40, 'USD', currency)}`;
      case '40+':
        return `${formatPrice(40, 'USD', currency)}+`;
      case 'all':
      default:
        return 'All Prices';
    }
  };

  const visibleProducts = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const gridRef = useRef<HTMLElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Infinite scroll: the next batch is only rendered once the sentinel below
  // the grid comes near the viewport.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => Math.min(count + BATCH_SIZE, filtered.length));
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, filtered.length, visibleCount]);

  // Shoppers choose a department (Electronics, Clothes, Food, …) before they
  // see any products; searching sidesteps the chooser.
  const selectedCategory = categories.find((c) => c.slug === categorySlug);
  const showCategoryGate = categorySlug === 'all' && !globalSearch.trim() && !loading;

  const resetFilters = () => {
    setCategorySlug('all');
    setPriceRange('all');
    setSortBy('newest');
    setGlobalSearch('');
    setVisibleCount(BATCH_SIZE);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Filter Sidebar */}
        <aside className="lg:col-span-3 bg-white border border-neutral-200/80 rounded-2xl p-5 space-y-6">
          <div>
            <h2 className="font-display text-sm font-bold text-neutral-950 mb-3">Categories</h2>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setCategorySlug('all');
                  setVisibleCount(BATCH_SIZE);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  categorySlug === 'all'
                    ? 'bg-neutral-950 text-white font-semibold'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <span>All Categories</span>
                <span className="tabular-nums opacity-75">{products.length}</span>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setCategorySlug(cat.slug);
                    setVisibleCount(BATCH_SIZE);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                    categorySlug === cat.slug
                      ? 'bg-neutral-950 text-white font-semibold'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <span>{cat.name}</span>
                  <span className="tabular-nums opacity-75">{cat.productCount ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-100">
            <h2 className="font-display text-sm font-bold text-neutral-950 mb-3">Price Range</h2>
            <div className="space-y-2">
              {PRICE_RANGES.map((r) => (
                <label
                  key={r.key}
                  className="flex items-center gap-2.5 text-xs text-neutral-700 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="priceRange"
                    checked={priceRange === r.key}
                    onChange={() => {
                      setPriceRange(r.key);
                      setVisibleCount(BATCH_SIZE);
                    }}
                    className="accent-neutral-950 w-3.5 h-3.5"
                  />
                  <span>{priceRangeLabel(r.key)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-100">
            <label htmlFor="catalog-sort" className="block font-display text-sm font-bold text-neutral-950 mb-2">
              Sort By
            </label>
            <select
              id="catalog-sort"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as SortOption);
                setVisibleCount(BATCH_SIZE);
              }}
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-800 focus:outline-none focus:border-neutral-950"
            >
              <option value="newest">Newest First</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="rating">Highest Rated</option>
            </select>
          </div>
        </aside>

        {/* Main Product Catalog Grid */}
        <section ref={gridRef} className="lg:col-span-9 scroll-mt-24">
          {showCategoryGate && (
            <div className="mb-5">
              <h1 className="font-display text-2xl font-bold text-neutral-950">Shop by category</h1>
              <p className="mt-1 text-xs text-neutral-500">
                Pick a department first, then explore its products.
              </p>
            </div>
          )}

          {showCategoryGate && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setCategorySlug(cat.slug);
                    setVisibleCount(BATCH_SIZE);
                  }}
                  className="group text-left rounded-2xl border border-neutral-200/80 bg-white p-5 hover:border-neutral-950 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all cursor-pointer"
                >
                  <p className="font-display text-base font-bold text-neutral-950">{cat.name}</p>
                  <p className="mt-1 text-xs text-neutral-500 line-clamp-2 min-h-[2rem]">
                    {cat.description || `Browse everything in ${cat.name}.`}
                  </p>
                  <p className="mt-3 text-[11px] font-semibold text-neutral-600 tabular-nums">
                    {cat.productCount ?? 0} product{cat.productCount === 1 ? '' : 's'}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-neutral-950">
                    Explore
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
              {categories.length === 0 && (
                <div className="sm:col-span-2 xl:col-span-3 bg-neutral-50 border border-neutral-200/80 rounded-2xl p-10 text-center">
                  <p className="font-display text-base font-bold text-neutral-950">No categories yet</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Sellers add categories such as Electronics, Clothes and Food from the admin console.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className={showCategoryGate ? 'hidden' : undefined}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h1 className="font-display text-2xl font-bold text-neutral-950">
                {selectedCategory ? selectedCategory.name : 'All products'}
              </h1>
              <p className="text-xs text-neutral-500 mt-0.5 tabular-nums">
                {filtered.length} product{filtered.length === 1 ? '' : 's'}
                {globalSearch ? ` matching "${globalSearch}"` : ''}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {(categorySlug !== 'all' || priceRange !== 'all' || globalSearch) && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-neutral-200 text-xs font-medium text-neutral-700 hover:border-neutral-950 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}

              <div className="flex items-center bg-neutral-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                  className={`p-1.5 rounded-lg cursor-pointer ${
                    viewMode === 'grid' ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-500'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                  className={`p-1.5 rounded-lg cursor-pointer ${
                    viewMode === 'list' ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-500'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <ProductCardSkeleton key={n} />
              ))}
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="bg-neutral-50 border border-neutral-200/80 rounded-2xl p-12 text-center">
              <h2 className="font-display text-lg font-bold text-neutral-950">No products match these filters</h2>
              <p className="mt-1.5 text-xs text-neutral-500">
                Adjust your category or price filter to see available items.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-5 px-5 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
              >
                Back to categories
              </button>
            </div>
          ) : (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 sm:grid-cols-3 gap-4'
                  : 'flex flex-col gap-3.5'
              }
            >
              {visibleProducts.map((p) => (
                <ProductCard key={p.id} product={p} layout={viewMode} />
              ))}
            </div>
          )}

          {/* Scroll sentinel: the next batch loads as it approaches the viewport. */}
          {hasMore && (
            <div
              ref={sentinelRef}
              aria-hidden="true"
              className={
                viewMode === 'grid'
                  ? 'mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4'
                  : 'mt-3.5 flex flex-col gap-3.5'
              }
            >
              {[0, 1, 2].map((n) => (
                <ProductCardSkeleton key={n} />
              ))}
            </div>
          )}
          </div>
        </section>
      </div>
    </div>
  );
};
