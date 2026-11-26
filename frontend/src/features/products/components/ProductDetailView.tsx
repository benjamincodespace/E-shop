'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Heart,
  Minus,
  Plus,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Star,
  ThumbsUp,
} from 'lucide-react';
import type { Product, Review, TeeSize } from '@/types/store';
import { api } from '@/services/api';
import { calculateDiscountPercent, getEffectivePrice, getStockBadgeInfo } from '@/lib/storeLogic';
import { useStore } from '@/context/StoreContext';
import { flyProductImageToCart } from '@/features/cart/lib/cartFlight';
import { formatPrice } from '@/utils/currency';
import { SafeImage } from '@/components/SafeImage';
import { ProductReviews } from './ProductReviews';

interface RatingSummary {
  average: number;
  total: number;
  breakdown: Array<{ stars: number; count: number; percentage: number }>;
}

interface ProductDetailViewProps {
  slug: string;
  initialProduct?: Product | null;
  initialReviews?: Review[];
  initialRatingSummary?: RatingSummary;
}

export const ProductDetailView: React.FC<ProductDetailViewProps> = ({
  slug,
  initialProduct = null,
  initialReviews = [],
  initialRatingSummary = { average: 0, total: 0, breakdown: [] },
}) => {
  const { addToCart, toggleWishlist, wishlistIds, navigate, notify, currency, t } = useStore();

  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [reviews, setReviews] = useState<Review[]>(initialReviews);
  const [ratingSummary, setRatingSummary] = useState<RatingSummary>(initialRatingSummary);
  const [loading, setLoading] = useState(!initialProduct);
  const [error, setError] = useState('');

  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [selectedSize, setSelectedSize] = useState<TeeSize>(
    initialProduct?.sizes.includes('M') ? 'M' : initialProduct?.sizes[0] || 'M',
  );
  const [selectedColor, setSelectedColor] = useState<string>(initialProduct?.colors[0]?.name || 'Black');
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'description' | 'reviews' | 'shipping'>('reviews');

  const loadProduct = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError('');
    try {
      const res = await api.getProductBySlug(slug);
      setProduct(res.product);
      setReviews(res.reviews);
      setRatingSummary(res.ratingSummary);
      setSelectedSize(res.product.sizes.includes('M') ? 'M' : res.product.sizes[0] || 'M');
      setSelectedColor(res.product.colors[0]?.name || 'Black');
      setActiveImageIdx(0);
      setQuantity(1);
    } catch (err) {
      if (!background) {
        setError(err instanceof Error ? err.message : 'Unable to load product.');
      }
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadProduct(Boolean(initialProduct));
  }, [loadProduct, initialProduct]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-pulse">
        <div className="h-6 w-44 bg-neutral-100 rounded mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 aspect-square bg-neutral-100 rounded-2xl" />
          <div className="lg:col-span-5 space-y-4">
            <div className="h-8 w-2/3 bg-neutral-100 rounded" />
            <div className="h-6 w-1/3 bg-neutral-100 rounded" />
            <div className="h-24 w-full bg-neutral-100 rounded" />
            <div className="h-12 w-full bg-neutral-100 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-neutral-950">T-Shirt Not Found</h1>
        <p className="mt-2 text-sm text-neutral-500">{error || 'This product may have been archived.'}</p>
        <button
          type="button"
          onClick={() => navigate({ page: 'catalog' })}
          className="mt-6 px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
        >
          Browse All T-Shirts
        </button>
      </div>
    );
  }

  const effectivePrice = getEffectivePrice(product);
  const discountPct = calculateDiscountPercent(product.price, product.discountPrice);
  const isFav = wishlistIds.includes(product.id);
  const stockInfo = getStockBadgeInfo(product.stock);
  const outOfStock = product.stock <= 0;
  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify('Product link copied to clipboard', 'success');
    } catch {
      notify('Share link ready in browser address bar', 'info');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Breadcrumb & Mobile Back Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <button
            type="button"
            onClick={() => navigate({ page: 'catalog' })}
            className="inline-flex items-center gap-1.5 text-neutral-700 hover:text-neutral-950 font-medium cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('product.backToCatalog')}</span>
          </button>
          <span aria-hidden="true">/</span>
          <button
            type="button"
            onClick={() => navigate({ page: 'catalog', category: product.categorySlug })}
            className="hover:text-neutral-950 cursor-pointer"
          >
            {product.categoryName}
          </button>
        </div>

        <button
          type="button"
          onClick={handleShare}
          aria-label="Share product"
          className="w-9 h-9 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-700 hover:border-neutral-950 cursor-pointer"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* Main Split Module */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Gallery */}
        <div className="lg:col-span-7 flex flex-col-reverse sm:flex-row gap-3.5">
          {product.images.length > 1 && (
            <div className="flex sm:flex-col gap-2.5 overflow-x-auto sm:w-20 shrink-0">
              {product.images.map((img, idx) => (
                <button
                  key={`${img}-${idx}`}
                  type="button"
                  onClick={() => setActiveImageIdx(idx)}
                  aria-label={`View image ${idx + 1}`}
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-neutral-100 overflow-hidden border-2 shrink-0 cursor-pointer transition-colors ${
                    activeImageIdx === idx ? 'border-neutral-950' : 'border-transparent hover:border-neutral-300'
                  }`}
                >
                  <SafeImage src={img} alt={`${product.name} angle ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 bg-neutral-100 rounded-2xl overflow-hidden relative aspect-square" data-product-media>
            <SafeImage
              src={product.images[activeImageIdx] || product.images[0]}
              alt={product.name}
              eager
              className="w-full h-full object-cover"
            />
            {product.images.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 glass-surface px-2.5 py-1.5 rounded-full">
                {product.images.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`Slide ${idx + 1}`}
                    onClick={() => setActiveImageIdx(idx)}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      activeImageIdx === idx ? 'w-5 bg-neutral-950' : 'w-1.5 bg-neutral-400'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Purchase Module */}
        <div className="lg:col-span-5 bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>{product.categoryName}</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                stockInfo.tone === 'in'
                  ? 'text-neutral-800 font-medium'
                  : stockInfo.tone === 'low'
                    ? 'text-amber-700 font-semibold'
                    : 'text-neutral-500 font-semibold'
              }
            >
              {stockInfo.label} ({product.stock} left)
            </span>
          </div>

          <h1 className="mt-1.5 font-display text-2xl sm:text-3xl font-bold text-neutral-950 tracking-tight">
            {product.name}
          </h1>

          <div className="mt-2.5 flex items-center gap-1.5 text-xs">
            <div className="flex items-center gap-0.5" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-3.5 h-3.5 ${
                    s <= Math.round(ratingSummary.average || product.ratingAvg || 5)
                      ? 'star-gold'
                      : 'text-neutral-300'
                  }`}
                />
              ))}
            </div>
            <span className="font-semibold text-neutral-950 tabular-nums">
              {ratingSummary.average > 0 ? ratingSummary.average.toFixed(1) : 'New'}
            </span>
            <span className="text-neutral-500 tabular-nums">({ratingSummary.total} reviews)</span>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <span className="font-mono-num text-2xl font-bold text-neutral-950">
              {formatPrice(effectivePrice, product.currency, currency)}
            </span>
            {discountPct > 0 && (
              <>
                <span className="font-mono-num text-sm text-neutral-400 line-through">
                  {formatPrice(product.price, product.currency, currency)}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-neutral-950 text-white text-xs font-semibold">
                  {discountPct}% OFF
                </span>
              </>
            )}
          </div>

          <p className="mt-4 text-sm text-neutral-600 leading-relaxed">{product.description}</p>

          {/* Size selector */}
          <div className="mt-6">
            <span className="block text-xs font-semibold text-neutral-900 mb-2">{t('product.size')}</span>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setSelectedSize(sz)}
                  className={`min-w-[46px] px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
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

          {/* Color selector */}
          <div className="mt-5">
            <span className="block text-xs font-semibold text-neutral-900 mb-2">
              {t('product.color')}: <span className="font-normal text-neutral-600">{selectedColor}</span>
            </span>
            <div className="flex items-center gap-2.5">
              {product.colors.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setSelectedColor(c.name)}
                  aria-label={`Color ${c.name}`}
                  className={`w-7 h-7 rounded-full border transition-transform cursor-pointer ${
                    selectedColor === c.name
                      ? 'ring-2 ring-neutral-950 ring-offset-2 scale-105'
                      : 'border-neutral-300'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>

          {/* Quantity + CTA */}
          <div className="mt-6 flex items-center gap-3">
            <div className="inline-flex items-center border border-neutral-200 rounded-full px-1.5 py-1">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-700 hover:bg-neutral-100 cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-9 text-center text-sm font-semibold tabular-nums">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(Math.max(1, product.stock), q + 1))}
                aria-label="Increase quantity"
                className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-700 hover:bg-neutral-100 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              disabled={outOfStock}
              onClick={(event) => {
                const trigger = event.currentTarget;
                void addToCart(product, selectedSize, selectedColor, quantity).then((added) => {
                  if (added) flyProductImageToCart(trigger, product.images[0]);
                });
              }}
              className={`flex-1 py-3.5 px-6 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${
                outOfStock
                  ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
                  : 'bg-neutral-950 text-white hover:bg-neutral-800 cursor-pointer'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>{outOfStock ? t('product.outOfStock') : t('product.addToCart')}</span>
            </button>

            <button
              type="button"
              onClick={() => toggleWishlist(product)}
              aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
              className="w-12 h-12 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-800 hover:border-neutral-950 transition-colors cursor-pointer shrink-0"
            >
              <Heart className={`w-4 h-4 ${isFav ? 'fill-neutral-950 text-neutral-950' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-10 border-t border-neutral-200 pt-6">
        <div className="flex items-center gap-6 border-b border-neutral-200 pb-3 overflow-x-auto">
          {(
            [
              { id: 'description', label: 'Description' },
              { id: 'reviews', label: `Reviews (${ratingSummary.total})` },
              { id: 'shipping', label: 'Shipping & Returns' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`text-sm font-semibold whitespace-nowrap pb-1 border-b-2 transition-colors cursor-pointer ${
                activeTab === t.id
                  ? 'border-neutral-950 text-neutral-950'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'description' && (
          <div className="py-6 max-w-3xl space-y-3 text-sm text-neutral-600 leading-relaxed">
            <p>{product.description}</p>
            <ul className="list-disc pl-5 space-y-1.5 text-neutral-700">
              <li>100% combed ring-spun cotton jersey crafted for structured drape.</li>
              <li>Pre-shrunk wash finish with double-needle sleeve and bottom hems.</li>
              <li>Available sizes: {product.sizes.join(', ')}.</li>
            </ul>
          </div>
        )}

        {activeTab === 'shipping' && (
          <div className="py-6 max-w-3xl space-y-3 text-sm text-neutral-600 leading-relaxed">
            <p>
              <strong>Free Shipping</strong> on all orders over $50.00. Standard flat-rate delivery ($6.00)
              arrives within 2–4 business days.
            </p>
            <p>
              <strong>Easy 7-Day Returns:</strong> Unworn T-shirts in original condition may be returned or
              exchanged within 7 days of delivery.
            </p>
          </div>
        )}

        {activeTab === 'reviews' && (
          <ProductReviews
            key={product.id}
            productId={product.id}
            productName={product.name}
            initialReviews={reviews}
            initialRatingSummary={ratingSummary}
            onSummaryChange={setRatingSummary}
          />
        )}
      </div>
    </div>
  );
};
