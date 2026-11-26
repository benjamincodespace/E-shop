import type { Metadata } from 'next';
import { SignUpView } from '@/components/SignUpView';

export const metadata: Metadata = {
  title: 'Create Account',
  description: 'Create an E-shop All account with your phone number and password.',
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return <SignUpView />;
}
