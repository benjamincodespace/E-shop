'use client';

import React from 'react';
import { Heart, ShoppingCart, Star } from 'lucide-react';
import type { Product } from '@/types/store';
import { calculateDiscountPercent, getEffectivePrice } from '@/lib/storeLogic';
import { SafeImage } from '@/components/SafeImage';
import { useStore } from '@/context/StoreContext';
import { flyProductImageToCart } from '@/features/cart/lib/cartFlight';
import { formatPrice } from '@/utils/currency';

interface ProductCardProps {
  product: Product;
  onSelect?: (product: Product) => void;
  isSelected?: boolean;
  layout?: 'grid' | 'list';
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSelect,
  isSelected = false,
  layout = 'grid',
}) => {
  const { addToCart, toggleWishlist, wishlistIds, navigate, currency } = useStore();
  const isFav = wishlistIds.includes(product.id);
  const effectivePrice = getEffectivePrice(product);
  const discountPct = calculateDiscountPercent(product.price, product.discountPrice);
  const outOfStock = product.stock <= 0;

  const handleCardOpen = () => {
    if (onSelect) {
      onSelect(product);
    } else {
      navigate({ page: 'product', slug: product.slug });
    }
  };

  if (layout === 'list') {
    return (
      <article
        className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-white rounded-2xl p-3.5 border transition-all duration-200 ${
          isSelected
            ? 'border-neutral-950 shadow-[0_6px_20px_rgba(0,0,0,0.06)]'
            : 'border-neutral-200/80 hover:border-neutral-300 shadow-[0_2px_10px_rgba(0,0,0,0.02)]'
        }`}
      >
        <button
          type="button"
          onClick={handleCardOpen}
          data-product-media
          className="relative w-full sm:w-32 aspect-square rounded-xl bg-neutral-100 overflow-hidden shrink-0 cursor-pointer"
          aria-label={`View ${product.name}`}
        >
          <SafeImage
            src={product.images[0]}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
          />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>{product.categoryName}</span>
            {discountPct > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-neutral-900">{discountPct}% OFF</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate({ page: 'product', slug: product.slug })}
            className="mt-0.5 text-left font-display text-base font-semibold text-neutral-950 hover:underline truncate block w-full cursor-pointer"
          >
            {product.name}
          </button>
          <p className="mt-1 text-xs text-neutral-500 line-clamp-2">{product.description}</p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-neutral-600">
            <Star className="w-3.5 h-3.5 fill-neutral-950 text-neutral-950" />
            <span className="font-medium text-neutral-900 tabular-nums">
              {product.ratingAvg > 0 ? product.ratingAvg.toFixed(1) : 'New'}
            </span>
            <span className="text-neutral-400 tabular-nums">({product.reviewCount})</span>
          </div>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-100">
          <div className="flex items-baseline gap-2">
            <span className="font-mono-num text-base font-bold text-neutral-950">
              {formatPrice(effectivePrice, product.currency, currency)}
            </span>
            {discountPct > 0 && (
              <span className="font-mono-num text-xs text-neutral-400 line-through">
                {formatPrice(product.price, product.currency, currency)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleWishlist(product)}
              aria-label={isFav ? `Remove ${product.name} from favorites` : `Save ${product.name} to favorites`}
              className="w-9 h-9 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-700 hover:border-neutral-950 transition-colors cursor-pointer"
            >
              <Heart className={`w-4 h-4 ${isFav ? 'fill-neutral-950 text-neutral-950' : ''}`} />
            </button>
            <button
              type="button"
              disabled={outOfStock}
              onClick={(event) => {
            const trigger = event.currentTarget;
            void addToCart(product).then((added) => {
              if (added) flyProductImageToCart(trigger, product.images[0]);
            });
          }}
              className={`px-4 py-2 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                outOfStock
                  ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
                  : 'bg-neutral-950 text-white hover:bg-neutral-800 cursor-pointer'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              {outOfStock ? 'Out of Stock' : 'Add to Cart'}
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`group flex flex-col bg-white rounded-2xl p-3 border transition-all duration-200 ${
        isSelected
          ? 'border-neutral-950 shadow-[0_8px_24px_rgba(0,0,0,0.07)]'
          : 'border-neutral-200/80 hover:border-neutral-300 hover:-translate-y-0.5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-[0_10px_28px_rgba(0,0,0,0.06)]'
      }`}
    >
      <div className="relative aspect-square rounded-xl bg-neutral-100 overflow-hidden" data-product-media>
        <button
          type="button"
          onClick={handleCardOpen}
          className="w-full h-full block cursor-pointer focus-visible:outline-2 focus-visible:outline-neutral-950"
          aria-label={`Inspect ${product.name}`}
        >
          <SafeImage
            src={product.images[0]}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </button>

        <button
          type="button"
          onClick={() => toggleWishlist(product)}
          aria-label={isFav ? `Remove ${product.name} from favorites` : `Favorite ${product.name}`}
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full glass-surface border border-white/80 shadow-sm flex items-center justify-center text-neutral-800 hover:scale-105 transition-transform cursor-pointer"
        >
          <Heart className={`w-4 h-4 ${isFav ? 'fill-neutral-950 text-neutral-950' : ''}`} />
        </button>

        {outOfStock && (
          <span className="absolute bottom-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-neutral-900/85 text-white text-[10px] font-semibold tracking-tight">
            Out of Stock
          </span>
        )}
      </div>

      <div className="mt-3 flex-1 flex flex-col">
        <button
          type="button"
          onClick={() => navigate({ page: 'product', slug: product.slug })}
          className="text-left font-display text-sm font-semibold text-neutral-950 hover:underline truncate cursor-pointer"
        >
          {product.name}
        </button>

        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-mono-num text-sm font-bold text-neutral-950">
            {formatPrice(effectivePrice, product.currency, currency)}
          </span>
          {discountPct > 0 && (
            <span className="font-mono-num text-xs text-neutral-400 line-through">
              {formatPrice(product.price, product.currency, currency)}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-1 text-xs text-neutral-600">
          <div className="flex items-center gap-0.5" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-3 h-3 ${
                  star <= Math.round(product.ratingAvg || 5)
                    ? 'fill-neutral-950 text-neutral-950'
                    : 'text-neutral-300'
                }`}
              />
            ))}
          </div>
          <span className="font-medium text-neutral-900 tabular-nums ml-0.5">
            {product.ratingAvg > 0 ? product.ratingAvg.toFixed(1) : 'New'}
          </span>
          <span className="text-neutral-400 tabular-nums">({product.reviewCount})</span>
        </div>

        <button
          type="button"
          disabled={outOfStock}
          onClick={(event) => {
            const trigger = event.currentTarget;
            void addToCart(product).then((added) => {
              if (added) flyProductImageToCart(trigger, product.images[0]);
            });
          }}
          className={`mt-3 w-full py-2.5 px-4 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
            outOfStock
              ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
              : 'bg-neutral-950 text-white hover:bg-neutral-800 cursor-pointer'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>{outOfStock ? 'Out of Stock' : 'Add to Cart'}</span>
        </button>
      </div>
    </article>
  );
};
