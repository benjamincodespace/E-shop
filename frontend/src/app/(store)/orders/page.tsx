import type { Metadata } from 'next';
import { CustomerAccountView } from '@/components/CustomerAccountView';

export const metadata: Metadata = {
  title: 'My Orders',
  description: 'Track your TeeStore order history and live fulfillment status.',
  robots: { index: false, follow: false },
};

export default function OrdersPage() {
  return <CustomerAccountView initialTab="orders" />;
}
