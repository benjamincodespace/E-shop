import type { MetadataRoute } from 'next';
import { getSiteOrigin } from '@/features/products/services/catalog.service';

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/catalog', '/product/', '/about'],
        disallow: ['/admin', '/checkout', '/cart', '/favorites'],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
