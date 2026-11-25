import type { Metadata } from 'next';
import { AuthView } from '@/components/CustomerAccountView';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in or create your TeeStore customer account.',
  robots: { index: false, follow: false },
};

export default function AuthPage() {
  return <AuthView />;
}
