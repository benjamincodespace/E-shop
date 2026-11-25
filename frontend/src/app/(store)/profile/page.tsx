import type { Metadata } from 'next';
import { CustomerAccountView } from '@/components/CustomerAccountView';

export const metadata: Metadata = {
  title: 'My Account',
  description: 'Manage your TeeStore profile, orders, and verified reviews.',
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return <CustomerAccountView initialTab="profile" />;
}
