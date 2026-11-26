import type { Metadata } from 'next';
import { CheckoutView } from '@/features/cart/components/CartCheckoutViews';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Complete your E-shop All T-shirt order.',
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
