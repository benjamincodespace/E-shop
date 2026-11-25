import type { MetadataRoute } from 'next';
import { getSiteOrigin } from '@/lib/serverCatalog';

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/catalog', '/product/', '/about'],
        disallow: ['/admin', '/checkout', '/cart', '/profile', '/orders', '/auth', '/favorites'],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
