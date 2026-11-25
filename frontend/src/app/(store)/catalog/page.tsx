import type { Metadata } from 'next';
import { CatalogView } from '@/components/CatalogView';
import { fetchServerCategories, fetchServerProducts } from '@/lib/serverCatalog';

export const revalidate = 30;

interface CatalogPageProps {
  searchParams: Promise<{ category?: string; search?: string }>;
}

export async function generateMetadata({ searchParams }: CatalogPageProps): Promise<Metadata> {
  const params = await searchParams;
  const cat = params.category && params.category !== 'all' ? params.category : '';
  return {
    title: cat ? `${cat.charAt(0).toUpperCase() + cat.slice(1)} T-Shirts Catalog` : 'All T-Shirts Catalog',
    description:
      'Browse all minimalist heavyweight cotton T-shirts. Filter by category, price range, and highest customer rating.',
    alternates: {
      canonical: cat ? `/catalog?category=${encodeURIComponent(cat)}` : '/catalog',
    },
  };
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const [categories, products] = await Promise.all([
    fetchServerCategories(),
    fetchServerProducts(100),
  ]);

  return (
    <CatalogView
      initialCategory={params.category}
      initialSearch={params.search}
      initialCategories={categories}
      initialProducts={products}
    />
  );
}
