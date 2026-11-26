import type { Metadata } from 'next';
import { SuperAdminConsole } from '@/features/superadmin/components/SuperAdminConsole';

export const metadata: Metadata = {
  title: 'Super Administrator',
  description: 'Platform-wide user and product control.',
  robots: { index: false, follow: false },
};

export default function SuperAdminPage() {
  return <SuperAdminConsole />;
}
