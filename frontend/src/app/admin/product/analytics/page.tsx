import type { Metadata } from 'next';
import { AdminDashboard } from '@/features/admin/components/AdminDashboard';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Product Analytics',
  description: `Protected ${SITE.name} Admin Console.`,
  robots: { index: false, follow: false },
};

export default function AdminProductAnalyticsPage() {
  return <AdminDashboard initialTab="analytics" />;
}
