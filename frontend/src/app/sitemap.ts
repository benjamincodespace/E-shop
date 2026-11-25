import type { MetadataRoute } from 'next';
import { fetchServerCategories, fetchServerProducts, getSiteOrigin } from '@/lib/serverCatalog';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${origin}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${origin}/catalog`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${origin}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];

  const [categories, products] = await Promise.all([
    fetchServerCategories(),
    fetchServerProducts(200),
  ]);

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((cat) => ({
    url: `${origin}/catalog?category=${encodeURIComponent(cat.slug)}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.75,
  }));

  const productRoutes: MetadataRoute.Sitemap = products
    .filter((p) => p.published)
    .map((p) => ({
      url: `${origin}/product/${encodeURIComponent(p.slug)}`,
      lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
      changeFrequency: 'daily',
      priority: 0.85,
    }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
