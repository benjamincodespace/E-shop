/**
 * Single source of truth for storefront identity and shop-wide defaults.
 * Brand copy used in metadata, structured data and the seeded settings reads
 * from here instead of being repeated across components.
 */
export const SITE = {
  name: 'E-shop All',
  tagline: 'Wear Your Style',
  title: 'E-shop All — Minimalist Premium T-Shirt Store',
  description:
    'Shop heavyweight monochrome T-shirts crafted for everyday comfort. Browse popular drops, verified customer reviews, and fast shipping.',
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
