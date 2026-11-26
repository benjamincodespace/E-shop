import type { Metadata } from 'next';
import { OrderDetailView } from '@/features/orders/components/OrdersView';

export const metadata: Metadata = {
  title: 'Order Details',
  description: 'Track one of your E-shop All orders.',
  robots: { index: false, follow: false },
};

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  return <OrderDetailView orderId={id} />;
}
