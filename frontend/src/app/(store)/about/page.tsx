import type { Metadata } from 'next';
import { AboutView } from '@/components/AboutView';

export const metadata: Metadata = {
  title: 'About TeeStore — Craftsmanship & Monochrome Minimalism',
  description:
    'Learn how TeeStore crafts heavyweight 240gsm–300gsm organic cotton T-shirts with minimalist precision.',
  alternates: {
    canonical: '/about',
  },
};

export default function AboutPage() {
  return <AboutView />;
}
