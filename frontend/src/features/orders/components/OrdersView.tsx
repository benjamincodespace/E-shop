'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, PackageSearch } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { api } from '@/services/api';
import { formatCurrency } from '@/utils/currency';
import type { Order } from '@/types/store';

function useMyOrders(enabled: boolean) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    api
      .getMyOrders()
      .then((res) => {
        if (active) setOrders(res.orders);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load your orders.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return { orders, loading, error };
}

const SignedOut: React.FC<{ title: string }> = ({ title }) => (
  <div className="max-w-md mx-auto px-4 py-16 text-center">
    <PackageSearch className="w-10 h-10 text-neutral-400 mx-auto" />
    <h1 className="mt-3 font-display text-xl font-bold text-neutral-950">{title}</h1>
    <p className="mt-1.5 text-xs text-neutral-500">Sign in with your phone number to see your orders.</p>
    <Link
      href="/signup"
      className="mt-5 inline-flex px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold"
    >
      Sign In / Create Account
    </Link>
  </div>
);

export const OrdersView: React.FC = () => {
  const { user, authReady } = useStore();
  const { orders, loading, error } = useMyOrders(Boolean(user));

  if (!authReady) {
    return (
      <div className="py-16 flex justify-center">
        <div className="w-8 h-8 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <SignedOut title="Your orders" />;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-2xl font-bold text-neutral-950">Your Orders</h1>
      <p className="mt-1 text-xs text-neutral-500">Every order placed with {user.phone || user.email}.</p>

      {error && (
        <p className="mt-4 text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
      )}

      {loading ? (
        <div className="py-10 flex justify-center">
          <div className="w-6 h-6 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-6 bg-neutral-50 border border-neutral-200/80 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-neutral-700">No orders yet</p>
          <Link href="/catalog" className="mt-4 inline-flex px-5 py-2 rounded-full bg-neutral-950 text-white text-xs font-semibold">
            Browse T-Shirts
          </Link>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex flex-wrap items-center justify-between gap-3 bg-white border border-neutral-200/80 rounded-2xl p-4 hover:border-neutral-950"
            >
              <div>
                <p className="font-mono-num text-sm font-bold text-neutral-950">{order.orderNumber}</p>
                <p className="text-[11px] text-neutral-500">
                  {new Date(order.createdAt).toLocaleDateString()} · {order.items.length} item
                  {order.items.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono-num text-sm font-semibold text-neutral-950">
                  {formatCurrency(order.total, order.currency)}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-800 text-[11px] font-semibold">
                  {order.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export const OrderDetailView: React.FC<{ orderId: string }> = ({ orderId }) => {
  const { user, authReady } = useStore();
  const { orders, loading, error } = useMyOrders(Boolean(user));

  if (!authReady) {
    return (
      <div className="py-16 flex justify-center">
        <div className="w-8 h-8 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <SignedOut title="Order details" />;

  const order = orders.find((item) => item.id === orderId);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/orders" className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-700 hover:text-neutral-950">
        <ArrowLeft className="w-4 h-4" />
        All orders
      </Link>

      {loading ? (
        <div className="py-10 flex justify-center">
          <div className="w-6 h-6 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <p className="mt-4 text-xs font-medium text-red-600">{error}</p>
      ) : !order ? (
        <div className="mt-6 bg-neutral-50 border border-neutral-200/80 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-neutral-700">Order not found</p>
          <p className="mt-1 text-xs text-neutral-500">This order does not belong to your account.</p>
        </div>
      ) : (
        <div className="mt-4 bg-white border border-neutral-200/80 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-lg font-bold text-neutral-950">{order.orderNumber}</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-800 text-[11px] font-semibold">
              {order.status}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">
            {new Date(order.createdAt).toLocaleString()} · {order.paymentMethod}
          </p>

          <div className="mt-4 divide-y divide-neutral-100">
            {order.items.map((item, idx) => (
              <div key={item.id || `${item.productId}-${idx}`} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-semibold text-neutral-950">{item.productName}</p>
                  <p className="text-[11px] text-neutral-500">
                    {[`${item.quantity} ×`, item.size, item.color].filter(Boolean).join(' ')}
                  </p>
                </div>
                <span className="font-mono-num font-semibold text-neutral-950">
                  {formatCurrency(item.unitPrice * item.quantity, order.currency)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-200 space-y-1.5 text-xs">
            <div className="flex justify-between text-neutral-600">
              <span>Subtotal</span>
              <span className="font-mono-num text-neutral-950">{formatCurrency(order.subtotal, order.currency)}</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Shipping</span>
              <span className="font-mono-num text-neutral-950">
                {order.shippingFee > 0 ? formatCurrency(order.shippingFee, order.currency) : 'Free'}
              </span>
            </div>
            <div className="flex justify-between text-sm font-bold text-neutral-950 pt-1.5 border-t border-neutral-100">
              <span>Total</span>
              <span className="font-mono-num">{formatCurrency(order.total, order.currency)}</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-200 space-y-1.5 text-[11px] text-neutral-600">
            <p>
              <span className="font-semibold text-neutral-900">Delivering to:</span> {order.address}
            </p>
            {order.deliveryAddress?.instructions && (
              <p>
                <span className="font-semibold text-neutral-900">Delivery instructions:</span>{' '}
                {order.deliveryAddress.instructions}
              </p>
            )}
            {order.deliveryAddress?.latitude != null && order.deliveryAddress?.longitude != null && (
              <p className="font-mono-num">
                Pin: {order.deliveryAddress.latitude.toFixed(5)}, {order.deliveryAddress.longitude.toFixed(5)}
              </p>
            )}
            {order.notes && (
              <p>
                <span className="font-semibold text-neutral-900">Order notes:</span> {order.notes}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
