'use client';

import React, { useState } from 'react';
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { calculateCartSummary } from '@/lib/storeLogic';
import { formatCurrency, formatPrice } from '@/utils/currency';
import { SafeImage } from '@/components/SafeImage';

export const CartView: React.FC = () => {
  const { cart, updateCartQty, removeFromCart, navigate, currency, t } = useStore();
  const summary = calculateCartSummary(cart);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-neutral-950">{t('cart.title')}</h1>
        <button
          type="button"
          onClick={() => navigate({ page: 'catalog' })}
          className="text-xs font-semibold text-neutral-700 hover:text-neutral-950 inline-flex items-center gap-1 cursor-pointer"
        >
          <span>{t('cart.continue')}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {cart.length === 0 ? (
        <div className="bg-neutral-50 border border-neutral-200/80 rounded-2xl p-12 text-center">
          <ShoppingBag className="w-10 h-10 text-neutral-400 mx-auto" />
          <h2 className="mt-3 font-display text-lg font-bold text-neutral-950">{t('cart.empty')}</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Explore our heavyweight cotton T-shirts and add your favorite fit.
          </p>
          <button
            type="button"
            onClick={() => navigate({ page: 'catalog' })}
            className="mt-5 px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
          >
            {t('cart.browse')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 space-y-3">
            {cart.map((item) => (
              <div
                key={`${item.productId}-${item.size}-${item.color}`}
                className="flex items-center gap-4 bg-white border border-neutral-200/80 rounded-2xl p-4"
              >
                <button
                  type="button"
                  onClick={() => navigate({ page: 'product', slug: item.productSlug })}
                  className="w-20 h-20 rounded-xl bg-neutral-100 overflow-hidden shrink-0 cursor-pointer"
                >
                  <SafeImage src={item.productImage} alt={item.productName} className="w-full h-full object-cover" />
                </button>

                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate({ page: 'product', slug: item.productSlug })}
                    className="font-display text-sm font-bold text-neutral-950 hover:underline truncate block text-left cursor-pointer"
                  >
                    {item.productName}
                  </button>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Size: {item.size} · Color: {item.color}
                  </p>
                  <p className="font-mono-num text-sm font-semibold text-neutral-900 mt-1">
                    {formatPrice(item.unitPrice, 'USD', currency)}
                  </p>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="inline-flex items-center border border-neutral-200 rounded-full px-1 py-0.5">
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.productId, item.size, item.color, item.quantity - 1)}
                      aria-label={`Decrease quantity for ${item.productName}`}
                      className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-neutral-100 cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-7 text-center text-xs font-semibold tabular-nums">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.productId, item.size, item.color, item.quantity + 1)}
                      aria-label={`Increase quantity for ${item.productName}`}
                      className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-neutral-100 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFromCart(item.productId, item.size, item.color)}
                    aria-label={`Remove ${item.productName} from cart`}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-950 hover:bg-neutral-100 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-4 bg-white border border-neutral-200/80 rounded-2xl p-5 space-y-4">
            <h2 className="font-display text-base font-bold text-neutral-950">Order Summary</h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-neutral-600">
                <span>{t('cart.subtotal')} ({summary.itemCount} items)</span>
                <span className="font-mono-num font-semibold text-neutral-950">
                  {formatPrice(summary.subtotal, 'USD', currency)}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>{t('cart.shipping')}</span>
                <span className="font-mono-num font-semibold text-neutral-950">
                  {summary.shippingFee === 0 ? t('cart.free') : `${formatPrice(summary.shippingFee, 'USD', currency)}`}
                </span>
              </div>
              {summary.amountToFreeShipping > 0 && (
                <p className="text-[11px] text-neutral-500 pt-1">
                  {t('cart.freeShippingHint', { amount: formatPrice(summary.amountToFreeShipping, 'USD', currency) })}
                </p>
              )}
              <div className="pt-3 border-t border-neutral-200 flex justify-between text-sm font-bold text-neutral-950">
                <span>{t('cart.total')}</span>
                <span className="font-mono-num">{formatPrice(summary.total, 'USD', currency)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate({ page: 'checkout' })}
              className="w-full py-3 px-5 rounded-full bg-neutral-950 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <span>{t('cart.checkout')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Checkout lives in its own feature module; kept here for existing imports.
export { CheckoutView } from '@/features/checkout/components/CheckoutView';
