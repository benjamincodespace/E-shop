import type { Metadata } from 'next';
import { OrdersView } from '@/features/orders/components/OrdersView';

export const metadata: Metadata = {
  title: 'Your Orders',
  description: 'Review the orders placed with your E-shop All account.',
  robots: { index: false, follow: false },
};

export default function OrdersPage() {
  return <OrdersView />;
}
