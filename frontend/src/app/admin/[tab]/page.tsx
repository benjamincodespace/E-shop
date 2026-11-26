import type { Metadata } from 'next';
import { AdminDashboard } from '@/features/admin/components/AdminDashboard';

export const metadata: Metadata = {
  title: 'Admin Console',
  description: 'Protected E-shop All Admin Console.',
  robots: { index: false, follow: false },
};

interface AdminTabPageProps {
  params: Promise<{ tab: string }>;
}

export default async function AdminTabPage({ params }: AdminTabPageProps) {
  const { tab } = await params;
  return <AdminDashboard initialTab={tab} />;
}
