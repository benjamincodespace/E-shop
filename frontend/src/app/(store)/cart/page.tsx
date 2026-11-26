import type { Metadata } from 'next';
import { CartView } from '@/features/cart/components/CartCheckoutViews';

export const metadata: Metadata = {
  title: 'Your Cart',
  description: 'Review your selected T-shirts before checkout.',
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return <CartView />;
}
