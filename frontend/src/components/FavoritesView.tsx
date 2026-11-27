'use client';

import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { ProductCard } from '@/features/products/components/ProductCard';
import { ViewModeToggle, type ProductViewMode } from '@/components/ViewModeToggle';

export const FavoritesView: React.FC = () => {
  const { products, wishlistIds, navigate } = useStore();
  const [viewMode, setViewMode] = useState<ProductViewMode>('single');
  const favProducts = products.filter((p) => wishlistIds.includes(p.id));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-neutral-950">Favorites</h1>
          <p className="text-xs text-neutral-500 mt-0.5 tabular-nums">{favProducts.length} saved items</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <button
            type="button"
            onClick={() => navigate({ page: 'catalog' })}
            className="text-xs font-semibold text-neutral-700 hover:text-neutral-950 cursor-pointer"
          >
            Explore Catalog →
          </button>
        </div>
      </div>

      {favProducts.length === 0 ? (
        <div className="bg-neutral-50 border border-neutral-200/80 rounded-2xl p-12 text-center">
          <Heart className="w-10 h-10 text-neutral-400 mx-auto" />
          <h2 className="mt-3 font-display text-lg font-bold text-neutral-950">No favorites yet</h2>
          <p className="mt-1 text-xs text-neutral-500">Tap the heart icon on any T-shirt to save it here.</p>
          <button
            type="button"
            onClick={() => navigate({ page: 'catalog' })}
            className="mt-5 px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
          >
            Browse T-Shirts
          </button>
        </div>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4'
              : 'flex flex-col gap-3.5'
          }
        >
          {favProducts.map((p) => (
            <ProductCard key={p.id} product={p} layout={viewMode === 'grid' ? 'grid' : 'list'} />
          ))}
        </div>
      )}
    </div>
  );
};
