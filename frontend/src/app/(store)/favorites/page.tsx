import type { Metadata } from 'next';
import { FavoritesView } from '@/components/CustomerAccountView';

export const metadata: Metadata = {
  title: 'Saved Favorites',
  description: 'Your saved monochrome T-shirts on TeeStore.',
  robots: { index: false, follow: false },
};

export default function FavoritesPage() {
  return <FavoritesView />;
}
