import type { Metadata } from 'next';
import { AdminDashboard } from '@/components/AdminDashboard';

export const metadata: Metadata = {
  title: 'Admin Console',
  description: 'Protected E-shop All Admin Console.',
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminDashboard initialTab="dashboard" />;
}
