import type { Metadata } from 'next';
import { CatalogView } from '@/features/products/components/CatalogView';
import {
  fetchServerCategories,
  fetchServerProducts,
} from '@/features/products/services/catalog.service';
import { SITE } from '@/config/site';

// Next requires a literal here; keep it in sync with SITE.catalogRevalidateSeconds.
export const revalidate = 30;

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

function labelFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const label = labelFromSlug(slug);
  return {
    title: `${label} Products`,
    description: `Shop ${label} products at ${SITE.name} — verified sellers, fair prices and fast shipping.`,
    alternates: { canonical: `/category/${slug}` },
    openGraph: {
      type: 'website',
      siteName: SITE.name,
      title: `${label} — ${SITE.name}`,
      description: `Shop ${label} products at ${SITE.name}.`,
      url: `/category/${slug}`,
    },
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const [categories, products] = await Promise.all([
    fetchServerCategories(),
    fetchServerProducts(100),
  ]);

  return (
    <CatalogView
      initialCategory={slug}
      initialCategories={categories}
      initialProducts={products}
    />
  );
}
