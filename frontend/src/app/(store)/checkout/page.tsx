import type { Metadata } from 'next';
import { CheckoutView } from '@/components/CartCheckoutViews';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Complete your TeeStore T-shirt order.',
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
