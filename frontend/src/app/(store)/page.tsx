import type { Metadata } from 'next';
import { StorefrontHome } from '@/components/StorefrontHome';
import { fetchServerCategories, fetchServerProducts, getSiteOrigin } from '@/lib/serverCatalog';

export const revalidate = 30;

export const metadata: Metadata = {
  title: {
    absolute: 'E-shop All — Minimalist Premium T-Shirt Store',
  },
  description:
    'Shop heavyweight monochrome T-shirts crafted for everyday comfort. Browse popular drops, verified customer reviews, and fast shipping.',
  alternates: {
    canonical: '/',
  },
};

export default async function HomePage() {
  const origin = getSiteOrigin();
  const [categories, products] = await Promise.all([
    fetchServerCategories(),
    fetchServerProducts(100),
  ]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: 'E-shop All',
        url: origin,
        logo: `${origin}/images/hero_monochrome_tee_1795513062252.jpg`,
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: origin,
        name: 'E-shop All',
        publisher: { '@id': `${origin}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${origin}/catalog?search={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <StorefrontHome initialCategories={categories} initialProducts={products} />
    </>
  );
}
