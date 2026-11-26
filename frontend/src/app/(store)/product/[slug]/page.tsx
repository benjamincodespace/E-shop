import type { Metadata } from 'next';
import { ProductDetailView } from '@/features/products/components/ProductDetailView';
import { fetchServerProductBySlug, getSiteOrigin } from '@/features/products/services/catalog.service';
import { getEffectivePrice } from '@/lib/storeLogic';

export const revalidate = 30;

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchServerProductBySlug(slug);
  const origin = getSiteOrigin();

  if (!data?.product) {
    return {
      title: 'T-Shirt Details',
      description: 'Explore minimalist heavyweight cotton T-shirts at E-shop All.',
      alternates: {
        canonical: `/product/${encodeURIComponent(slug)}`,
      },
    };
  }

  const p = data.product;
  const primaryImage = p.images[0] || '/images/hero_monochrome_tee_1795513062252.jpg';
  const absoluteImage = primaryImage.startsWith('http') ? primaryImage : `${origin}${primaryImage}`;

  return {
    title: {
      absolute: p.seoTitle || `${p.name} — E-shop All`,
    },
    description: p.seoDescription || p.description,
    alternates: {
      canonical: `/product/${encodeURIComponent(p.slug)}`,
    },
    openGraph: {
      type: 'website',
      title: p.seoTitle || p.name,
      description: p.seoDescription || p.description,
      url: `${origin}/product/${encodeURIComponent(p.slug)}`,
      images: [{ url: absoluteImage, alt: p.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: p.seoTitle || p.name,
      description: p.seoDescription || p.description,
      images: [absoluteImage],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const data = await fetchServerProductBySlug(slug);
  const origin = getSiteOrigin();
  const product = data?.product ?? null;

  const jsonLd = product
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Product',
            name: product.name,
            description: product.seoDescription || product.description,
            image: product.images.map((img) => (img.startsWith('http') ? img : `${origin}${img}`)),
            sku: product.slug,
            brand: { '@type': 'Brand', name: 'E-shop All' },
            category: product.categoryName,
            offers: {
              '@type': 'Offer',
              url: `${origin}/product/${encodeURIComponent(product.slug)}`,
              priceCurrency: product.currency || 'USD',
              price: getEffectivePrice(product).toFixed(2),
              availability:
                product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            },
            ...(product.reviewCount > 0
              ? {
                  aggregateRating: {
                    '@type': 'AggregateRating',
                    ratingValue: product.ratingAvg,
                    reviewCount: product.reviewCount,
                  },
                }
              : {}),
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
              {
                '@type': 'ListItem',
                position: 2,
                name: product.categoryName,
                item: `${origin}/catalog?category=${encodeURIComponent(product.categorySlug)}`,
              },
              {
                '@type': 'ListItem',
                position: 3,
                name: product.name,
                item: `${origin}/product/${encodeURIComponent(product.slug)}`,
              },
            ],
          },
        ],
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
          }}
        />
      )}
      <ProductDetailView
        slug={slug}
        initialProduct={data?.product ?? null}
        initialReviews={data?.reviews ?? []}
        initialRatingSummary={data?.ratingSummary}
      />
    </>
  );
}
