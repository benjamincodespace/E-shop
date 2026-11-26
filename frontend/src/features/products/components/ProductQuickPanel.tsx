'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRight, Heart, Minus, Plus, ShoppingCart, Star } from 'lucide-react';
import type { Product, Review, TeeSize } from '@/types/store';
import { calculateDiscountPercent, getEffectivePrice } from '@/lib/storeLogic';
import { api } from '@/services/api';
import { useStore } from '@/context/StoreContext';
import { flyProductImageToCart } from '@/features/cart/lib/cartFlight';
import { formatPrice } from '@/lib/currency';
import { SafeImage } from '@/components/SafeImage';

interface ProductQuickPanelProps {
  product: Product | null;
}

export const ProductQuickPanel: React.FC<ProductQuickPanelProps> = ({ product }) => {
  const { addToCart, toggleWishlist, wishlistIds, navigate, currency } = useStore();
  const [selectedSize, setSelectedSize] = useState<TeeSize>('M');
  const [selectedColor, setSelectedColor] = useState<string>('Black');
  const [quantity, setQuantity] = useState(1);
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    if (!product) return;
    setSelectedSize(product.sizes.includes('M') ? 'M' : product.sizes[0] || 'M');
    setSelectedColor(product.colors[0]?.name || 'Black');
    setQuantity(1);

    api
      .getProductReviews(product.id)
      .then((res) => setReviews(res.reviews))
      .catch(() => setReviews([]));
  }, [product]);

  if (!product) {
    return (
      <aside className="bg-white border border-neutral-200/80 rounded-2xl p-6 text-center text-sm text-neutral-500">
        Select any T-shirt to view sizing, stock, and verified customer reviews.
      </aside>
    );
  }

  const effectivePrice = getEffectivePrice(product);
  const discountPct = calculateDiscountPercent(product.price, product.discountPrice);
  const isFav = wishlistIds.includes(product.id);
  const outOfStock = product.stock <= 0;
  return (
    <aside className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
      <div className="flex flex-col sm:flex-row xl:flex-row gap-4">
        <button
          type="button"
          onClick={() => navigate({ page: 'product', slug: product.slug })}
          data-product-media
          className="w-full sm:w-36 aspect-square rounded-2xl bg-neutral-100 overflow-hidden shrink-0 cursor-pointer"
          aria-label={`Open full page for ${product.name}`}
        >
          <SafeImage src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
        </button>

        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => navigate({ page: 'product', slug: product.slug })}
            className="text-left font-display text-lg font-bold text-neutral-950 hover:underline leading-snug cursor-pointer"
          >
            {product.name}
          </button>

          <div className="mt-1.5 flex items-center flex-wrap gap-2">
            <span className="font-mono-num text-lg font-bold text-neutral-950">
              {formatPrice(effectivePrice, product.currency, currency)}
            </span>
            {discountPct > 0 && (
              <>
                <span className="font-mono-num text-xs text-neutral-400 line-through">
                  {formatPrice(product.price, product.currency, currency)}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-neutral-950 text-white text-[10px] font-semibold">
                  {discountPct}% OFF
                </span>
              </>
            )}
          </div>

          <div className="mt-1.5 flex items-center gap-1 text-xs text-neutral-600">
            <div className="flex items-center gap-0.5" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-3 h-3 ${
                    s <= Math.round(product.ratingAvg || 5)
                      ? 'fill-neutral-950 text-neutral-950'
                      : 'text-neutral-300'
                  }`}
                />
              ))}
            </div>
            <span className="font-semibold text-neutral-900 tabular-nums">
              {product.ratingAvg > 0 ? product.ratingAvg.toFixed(1) : 'New'}
            </span>
            <span className="text-neutral-400 tabular-nums">({product.reviewCount} reviews)</span>
          </div>

          <p className="mt-2 text-xs text-neutral-600 leading-relaxed line-clamp-3">
            {product.description}
          </p>
        </div>
      </div>

      {/* Size Selector */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-semibold text-neutral-900">Size</span>
          <span className="text-neutral-500 tabular-nums">
            {outOfStock ? 'Out of stock' : `${product.stock} in stock`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {product.sizes.map((sz) => (
            <button
              key={sz}
              type="button"
              onClick={() => setSelectedSize(sz)}
              className={`min-w-[42px] px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                selectedSize === sz
                  ? 'bg-neutral-950 text-white border-neutral-950'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
              }`}
            >
              {sz}
            </button>
          ))}
        </div>
      </div>

      {/* Color & Quantity */}
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <span className="block text-xs font-semibold text-neutral-900 mb-2">Quantity</span>
          <div className="inline-flex items-center border border-neutral-200 rounded-full bg-white px-1 py-0.5">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Decrease quantity"
              className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-700 hover:bg-neutral-100 cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-8 text-center text-xs font-semibold tabular-nums">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(Math.max(1, product.stock), q + 1))}
              aria-label="Increase quantity"
              className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-700 hover:bg-neutral-100 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {product.colors.map((c) => (
            <button
              key={c.name}
              type="button"
              title={c.name}
              aria-label={`Select color ${c.name}`}
              onClick={() => setSelectedColor(c.name)}
              className={`w-6 h-6 rounded-full border transition-transform cursor-pointer ${
                selectedColor === c.name ? 'ring-2 ring-neutral-950 ring-offset-2 scale-105' : 'border-neutral-300'
              }`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
      </div>

      {/* Primary Action Row */}
      <div className="mt-5 flex items-center gap-2.5">
        <button
          type="button"
          disabled={outOfStock}
          onClick={(event) => {
            const trigger = event.currentTarget;
            void addToCart(product, selectedSize, selectedColor, quantity).then((added) => {
              if (added) flyProductImageToCart(trigger, product.images[0]);
            });
          }}
          className={`flex-1 py-3 px-5 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${
            outOfStock
              ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
              : 'bg-neutral-950 text-white hover:bg-neutral-800 cursor-pointer'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>{outOfStock ? 'Out of Stock' : 'Add to Cart'}</span>
        </button>

        <button
          type="button"
          onClick={() => toggleWishlist(product)}
          aria-label={isFav ? `Remove ${product.name} from favorites` : `Add ${product.name} to favorites`}
          className="w-11 h-11 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-800 hover:border-neutral-950 transition-colors cursor-pointer shrink-0"
        >
          <Heart className={`w-4 h-4 ${isFav ? 'fill-neutral-950 text-neutral-950' : ''}`} />
        </button>
      </div>

      {/* Customer Reviews Preview */}
      <div className="mt-6 pt-5 border-t border-neutral-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-bold text-neutral-950">Customer Reviews</h3>
          <button
            type="button"
            onClick={() => navigate({ page: 'product', slug: product.slug })}
            className="text-xs font-medium text-neutral-600 hover:text-neutral-950 inline-flex items-center gap-1 cursor-pointer"
          >
            <span>See All</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="space-y-3">
          {reviews.length === 0 ? (
            <p className="text-xs text-neutral-500">No verified buyer reviews yet.</p>
          ) : (
            reviews.slice(0, 2).map((rev) => (
              <div key={rev.id} className="pb-3 border-b border-neutral-100 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-neutral-200 text-neutral-700 text-[11px] font-bold flex items-center justify-center shrink-0">
                      {rev.userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-neutral-900 truncate">{rev.userName}</p>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-2.5 h-2.5 ${
                              s <= rev.rating ? 'fill-neutral-950 text-neutral-950' : 'text-neutral-300'
                            }`}
                          />
                        ))}
                        <span className="text-[11px] font-medium text-neutral-700 tabular-nums ml-0.5">
                          {rev.rating.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] text-neutral-400 whitespace-nowrap">
                    {new Date(rev.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-neutral-600 leading-relaxed line-clamp-2">{rev.comment}</p>
              </div>
            ))
          )}
        </div>

      </div>
    </aside>
  );
};
