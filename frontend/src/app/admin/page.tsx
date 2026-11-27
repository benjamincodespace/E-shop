import type { Metadata } from 'next';
import { AdminDashboard } from '@/features/admin/components/AdminDashboard';

export const metadata: Metadata = {
  title: 'Admin Console',
  description: 'Protected E-shop Admin Console.',
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminDashboard initialTab="dashboard" />;
}
