import type { Category, Product, Review } from '@/types/store';
import { SITE } from '@/config/site';

export function getSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

export function getInternalApiUrl(): string {
  const raw = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  return raw.replace(/\/+$/, '');
}

export async function fetchServerCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${getInternalApiUrl()}/api/categories`, {
      next: { revalidate: SITE.catalogRevalidateSeconds },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { categories?: Category[] };
    return data.categories || [];
  } catch {
    return [];
  }
}

export async function fetchServerProducts(limit = 100): Promise<Product[]> {
  try {
    const res = await fetch(`${getInternalApiUrl()}/api/products?limit=${limit}`, {
      next: { revalidate: SITE.catalogRevalidateSeconds },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { products?: Product[] };
    return data.products || [];
  } catch {
    return [];
  }
}

export async function fetchServerProductBySlug(slug: string): Promise<{
  product: Product;
  reviews: Review[];
  ratingSummary: {
    average: number;
    total: number;
    breakdown: Array<{ stars: number; count: number; percentage: number }>;
  };
} | null> {
  try {
    const res = await fetch(`${getInternalApiUrl()}/api/products/${encodeURIComponent(slug)}`, {
      next: { revalidate: SITE.catalogRevalidateSeconds },
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      product: Product;
      reviews: Review[];
      ratingSummary: {
        average: number;
        total: number;
        breakdown: Array<{ stars: number; count: number; percentage: number }>;
      };
    };
  } catch {
    return null;
  }
}
