/**
 * Single source of truth for storefront identity and shop-wide defaults.
 * Brand copy used in metadata, structured data and the seeded settings reads
 * from here instead of being repeated across components.
 */
export const SITE = {
  name: 'E-shop',
  tagline: 'Wear Your Style',
  title: 'E-shop — Electronics, Clothes & Food Marketplace',
  description:
    'Shop electronics, clothes, food and more in one marketplace. Browse by department, compare verified customer reviews and check out with fast shipping.',
  keywords: [
    'E-shop',
    'online marketplace',
    'buy electronics online',
    'clothing store',
    'buy food online',
    'online shopping',
    'general e-commerce store',
  ],
  /** Default social / OpenGraph share image inside `public/`. */
  shareImage: '/images/hero_monochrome_tee_1795513062252.jpg',
  supportEmail: 'support@eshopall.studio',
  defaultCurrency: 'USD',
  defaultLanguage: 'en',
  /** Free-shipping threshold and flat fee, both expressed in the USD base. */
  freeShippingThresholdUsd: 50,
  standardShippingFeeUsd: 6,
  /** ISR window for catalogue reads. */
  catalogRevalidateSeconds: 30,
} as const;

export type SiteConfig = typeof SITE;
