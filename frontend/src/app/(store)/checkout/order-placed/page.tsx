'use client';

import React from 'react';
import { formatCurrency } from '@/utils/currency';
import type { Order } from '@/types/store';

interface OrderConfirmedProps {
  order?: Order | null;
}

const PaymentSuccessPage: React.FC<OrderConfirmedProps> = ({ order }) => {
  if (!order) {
    return (
      <section className="section-order">
        <div className="ui-field-order">
          <p className="tracking-odd-3">Your order was placed. Order number: N/A.</p>
        </div>
      </section>
    );
  }

  const total = formatCurrency(order.total, order.currency);
  const shipping = order.shippingFee > 0 ? formatCurrency(order.shippingFee, order.currency) : 'Free';

  return (
    <section className="section-order">
      <div className="ui-field-order">
        <p className="tracking-odd-3">
          Your order {order.orderNumber} was placed in {order.currency || 'USD'}. Shipping: {shipping}. Total: {total}.
          Check your email for the receipt.
        </p>
      </div>
    </section>
  );
};

export default function OrderPlacedPage() {
  return <PaymentSuccessPage />;
}
