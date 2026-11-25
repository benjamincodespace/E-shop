'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { calculateCartSummary } from '@/lib/storeLogic';
import { api } from '@/services/api';
import { SafeImage } from './SafeImage';
import type { Order } from '@/types/store';

export const CartView: React.FC = () => {
  const { cart, updateCartQty, removeFromCart, navigate } = useStore();
  const summary = calculateCartSummary(cart);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-neutral-950">Your Cart</h1>
        <button
          type="button"
          onClick={() => navigate({ page: 'catalog' })}
          className="text-xs font-semibold text-neutral-700 hover:text-neutral-950 inline-flex items-center gap-1 cursor-pointer"
        >
          <span>Continue Shopping</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {cart.length === 0 ? (
        <div className="bg-neutral-50 border border-neutral-200/80 rounded-2xl p-12 text-center">
          <ShoppingBag className="w-10 h-10 text-neutral-400 mx-auto" />
          <h2 className="mt-3 font-display text-lg font-bold text-neutral-950">Your cart is empty</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Explore our heavyweight cotton T-shirts and add your favorite fit.
          </p>
          <button
            type="button"
            onClick={() => navigate({ page: 'catalog' })}
            className="mt-5 px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
          >
            Browse T-Shirts
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
                    ${item.unitPrice.toFixed(2)}
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
                <span>Subtotal ({summary.itemCount} items)</span>
                <span className="font-mono-num font-semibold text-neutral-950">
                  ${summary.subtotal.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Shipping</span>
                <span className="font-mono-num font-semibold text-neutral-950">
                  {summary.shippingFee === 0 ? 'Free' : `$${summary.shippingFee.toFixed(2)}`}
                </span>
              </div>
              {summary.amountToFreeShipping > 0 && (
                <p className="text-[11px] text-neutral-500 pt-1">
                  Add ${summary.amountToFreeShipping.toFixed(2)} more for free shipping.
                </p>
              )}
              <div className="pt-3 border-t border-neutral-200 flex justify-between text-sm font-bold text-neutral-950">
                <span>Total</span>
                <span className="font-mono-num">${summary.total.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate({ page: 'checkout' })}
              className="w-full py-3 px-5 rounded-full bg-neutral-950 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const CheckoutView: React.FC = () => {
  const { user, cart, clearCartLocal, navigate, notify, refreshCatalog, refreshAuth } = useStore();
  const summary = calculateCartSummary(cart);

  const [customerName, setCustomerName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash on Delivery');
  const [submitting, setSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (user) {
      setCustomerName((prev) => prev || user.name);
      setPhone((prev) => prev || user.phone);
      setAddress((prev) => prev || user.address);
    }
  }, [user]);

  if (confirmedOrder) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <div className="bg-white border border-neutral-200 rounded-3xl p-8 text-center shadow-[0_6px_28px_rgba(0,0,0,0.04)]">
          <CheckCircle2 className="w-12 h-12 text-neutral-950 mx-auto" />
          <h1 className="mt-4 font-display text-2xl font-bold text-neutral-950">
            Order {confirmedOrder.orderNumber} Confirmed
          </h1>
          <p className="mt-1.5 text-sm text-neutral-600">
            Thank you, {confirmedOrder.customerName}. Your order is currently{' '}
            <strong>{confirmedOrder.status}</strong>.
          </p>

          <div className="mt-6 text-left bg-neutral-50 border border-neutral-200/70 rounded-2xl p-5 space-y-3">
            <div className="flex justify-between text-xs text-neutral-600">
              <span>Delivery Address</span>
              <span className="font-medium text-neutral-950 text-right max-w-xs">{confirmedOrder.address}</span>
            </div>
            <div className="flex justify-between text-xs text-neutral-600">
              <span>Phone</span>
              <span className="font-mono-num font-medium text-neutral-950">{confirmedOrder.phone}</span>
            </div>
            <div className="border-t border-neutral-200 pt-3 space-y-2">
              {confirmedOrder.items.map((it, idx) => (
                <div key={it.id || `${it.productId}-${idx}`} className="flex justify-between text-xs">
                  <span className="text-neutral-800">
                    {it.quantity}× {it.productName} ({it.size}, {it.color})
                  </span>
                  <span className="font-mono-num font-semibold text-neutral-950">
                    ${(it.unitPrice * it.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-neutral-200 pt-3 flex justify-between text-sm font-bold text-neutral-950">
              <span>Total</span>
              <span className="font-mono-num">${confirmedOrder.total.toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate({ page: 'orders' })}
              className="px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
            >
              View Order History
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'catalog' })}
              className="px-6 py-2.5 rounded-full border border-neutral-200 text-xs font-semibold text-neutral-800 hover:border-neutral-950 cursor-pointer"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14 text-center">
        <h1 className="font-display text-2xl font-bold text-neutral-950">Sign in to Complete Checkout</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Your cart items are preserved. Sign in or register in seconds to track your order and verify future reviews.
        </p>
        <button
          type="button"
          onClick={() => navigate({ page: 'auth' })}
          className="mt-6 px-6 py-3 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
        >
          Sign In / Create Account
        </button>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14 text-center">
        <h1 className="font-display text-2xl font-bold text-neutral-950">Your cart is empty</h1>
        <button
          type="button"
          onClick={() => navigate({ page: 'catalog' })}
          className="mt-5 px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
        >
          Browse T-Shirts
        </button>
      </div>
    );
  }

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.createOrder({
        customerName: customerName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        notes: notes.trim(),
        paymentMethod,
        items: cart.map((c) => ({
          productId: c.productId,
          size: c.size,
          color: c.color,
          quantity: c.quantity,
        })),
      });
      clearCartLocal();
      setConfirmedOrder(res.order);
      notify(`Order ${res.order.orderNumber} placed successfully!`, 'success');
      await Promise.all([refreshCatalog(), refreshAuth()]);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Checkout failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-2xl font-bold text-neutral-950 mb-6">Checkout</h1>

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-neutral-200/80 rounded-2xl p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-neutral-950">Delivery Information</h2>

          <div>
            <label htmlFor="chk-name" className="block text-xs font-semibold text-neutral-800 mb-1.5">
              Full Name
            </label>
            <input
              id="chk-name"
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Jean Bosco"
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
            />
          </div>

          <div>
            <label htmlFor="chk-phone" className="block text-xs font-semibold text-neutral-800 mb-1.5">
              Phone Number
            </label>
            <input
              id="chk-phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 415 555 0142"
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
            />
          </div>

          <div>
            <label htmlFor="chk-address" className="block text-xs font-semibold text-neutral-800 mb-1.5">
              Delivery Address
            </label>
            <textarea
              id="chk-address"
              rows={2}
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="742 Valencia St, Apt 4B, San Francisco, CA"
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
            />
          </div>

          <div>
            <label htmlFor="chk-notes" className="block text-xs font-semibold text-neutral-800 mb-1.5">
              Order Notes (Optional)
            </label>
            <input
              id="chk-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery gate code or packaging preference"
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
            />
          </div>

          <div className="pt-2">
            <span className="block text-xs font-semibold text-neutral-800 mb-2">Payment Method</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {['Cash on Delivery', 'Pay on Pickup'].map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`px-4 py-3 rounded-xl border text-xs font-semibold text-left transition-colors cursor-pointer ${
                    paymentMethod === method
                      ? 'border-neutral-950 bg-neutral-950 text-white'
                      : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">
              Modular payment architecture ready for Stripe or regional gateway integration.
            </p>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-neutral-200/80 rounded-2xl p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-neutral-950">Order Review</h2>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {cart.map((item) => (
              <div key={`${item.productId}-${item.size}-${item.color}`} className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-neutral-100 overflow-hidden shrink-0">
                  <SafeImage src={item.productImage} alt={item.productName} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-neutral-950 truncate">{item.productName}</p>
                  <p className="text-[11px] text-neutral-500">
                    Size {item.size} · Qty {item.quantity}
                  </p>
                </div>
                <span className="font-mono-num text-xs font-semibold text-neutral-950">
                  ${(item.unitPrice * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-neutral-200 space-y-2 text-xs">
            <div className="flex justify-between text-neutral-600">
              <span>Subtotal</span>
              <span className="font-mono-num font-semibold text-neutral-950">${summary.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Shipping</span>
              <span className="font-mono-num font-semibold text-neutral-950">
                {summary.shippingFee === 0 ? 'Free' : `$${summary.shippingFee.toFixed(2)}`}
              </span>
            </div>
            <div className="pt-2 border-t border-neutral-200 flex justify-between text-sm font-bold text-neutral-950">
              <span>Total</span>
              <span className="font-mono-num">${summary.total.toFixed(2)}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-5 rounded-full bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            {submitting ? 'Confirming Order...' : 'Confirm Order'}
          </button>
        </div>
      </form>
    </div>
  );
};
