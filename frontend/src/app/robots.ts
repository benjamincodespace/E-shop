import type { MetadataRoute } from 'next';
import { getSiteOrigin } from '@/features/products/services/catalog.service';

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/catalog', '/category/', '/product/', '/products', '/about'],
        disallow: [
          '/admin',
          '/checkout',
          '/cart',
          '/favorites',
          '/orders',
          '/settings',
          '/signup',
          '/api/',
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
