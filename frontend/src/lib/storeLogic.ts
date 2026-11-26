import type {
  CartItem,
  OrderStatus,
  PriceRangeKey,
  Product,
  Review,
  SortOption,
} from '../types/store';
import { convertCurrency, roundForCurrency } from '@/utils/currency';
import { FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING_FEE } from '@/constants/shop';

export { FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING_FEE };



export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  Pending: ['Confirmed', 'Processing', 'Cancelled'],
  Confirmed: ['Processing', 'Shipped', 'Cancelled'],
  Processing: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered'],
  Delivered: [],
  Cancelled: [],
};

export function getEffectivePrice(product: Pick<Product, 'price' | 'discountPrice'>): number {
  if (
    product.discountPrice !== null &&
    product.discountPrice > 0 &&
    product.discountPrice < product.price
  ) {
    return Number(product.discountPrice.toFixed(2));
  }
  return Number(product.price.toFixed(2));
}

export function calculateDiscountPercent(
  price: number,
  discountPrice: number | null,
): number {
  if (!discountPrice || discountPrice <= 0 || discountPrice >= price || price <= 0) {
    return 0;
  }
  return Math.round(((price - discountPrice) / price) * 100);
}

export function calculateCartSummary(items: CartItem[]): {
  itemCount: number;
  subtotal: number;
  shippingFee: number;
  total: number;
  amountToFreeShipping: number;
} {
  let itemCount = 0;
  let subtotal = 0;

  for (const item of items) {
    const qty = Math.max(0, Math.floor(item.quantity));
    itemCount += qty;
    subtotal += qty * item.unitPrice;
  }

  subtotal = Number(subtotal.toFixed(2));
  const shippingFee =
    subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
  const total = Number((subtotal + shippingFee).toFixed(2));
  const amountToFreeShipping =
    subtotal === 0
      ? FREE_SHIPPING_THRESHOLD
      : Math.max(0, Number((FREE_SHIPPING_THRESHOLD - subtotal).toFixed(2)));

  return {
    itemCount,
    subtotal,
    shippingFee,
    total,
    amountToFreeShipping,
  };
}

export function calculateRatingSummary(reviews: Pick<Review, 'rating'>[]): {
  average: number;
  total: number;
  breakdown: Array<{ stars: number; count: number; percentage: number }>;
} {
  const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let sum = 0;

  for (const rev of reviews) {
    const r = Math.min(5, Math.max(1, Math.round(rev.rating)));
    counts[r] = (counts[r] ?? 0) + 1;
    sum += r;
  }

  const total = reviews.length;
  const average = total > 0 ? Number((sum / total).toFixed(1)) : 0;

  const breakdown = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: counts[stars],
    percentage: total > 0 ? Math.round((counts[stars] / total) * 100) : 0,
  }));

  return { average, total, breakdown };
}

export function computeWeightedRatingScore(
  ratingAvg: number,
  reviewCount: number,
  priorMean = 4.2,
  minReviewsWeight = 10,
): number {
  if (reviewCount <= 0) return 0;
  const score =
    (reviewCount / (reviewCount + minReviewsWeight)) * ratingAvg +
    (minReviewsWeight / (reviewCount + minReviewsWeight)) * priorMean;
  return Number(score.toFixed(3));
}

export function matchesPriceRange(price: number, range: PriceRangeKey): boolean {
  switch (range) {
    case '0-15':
      return price >= 0 && price <= 15;
    case '15-25':
      return price > 15 && price <= 25;
    case '25-40':
      return price > 25 && price <= 40;
    case '40+':
      return price > 40;
    case 'all':
    default:
      return true;
  }
}

export function filterAndSortProducts(
  products: Product[],
  options: {
    search?: string;
    categorySlug?: string;
    priceRange?: PriceRangeKey;
    sortBy?: SortOption;
    includeUnpublished?: boolean;
  },
): Product[] {
  const {
    search = '',
    categorySlug = 'all',
    priceRange = 'all',
    sortBy = 'newest',
    includeUnpublished = false,
  } = options;

  const q = search.trim().toLowerCase();

  const filtered = products.filter((p) => {
    if (!includeUnpublished && !p.published) return false;
    if (categorySlug && categorySlug !== 'all' && p.categorySlug !== categorySlug) {
      return false;
    }
    const effective = getEffectivePrice(p);
    const effectiveUSD = convertCurrency(effective, p.currency, 'USD');
    if (!matchesPriceRange(effectiveUSD, priceRange)) return false;
    if (q) {
      const hay = `${p.name} ${p.description} ${p.categoryName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'price-asc':
        return convertCurrency(getEffectivePrice(a), a.currency, 'USD') -
          convertCurrency(getEffectivePrice(b), b.currency, 'USD');
      case 'price-desc':
        return convertCurrency(getEffectivePrice(b), b.currency, 'USD') -
          convertCurrency(getEffectivePrice(a), a.currency, 'USD');
      case 'rating':
        return (
          computeWeightedRatingScore(b.ratingAvg, b.reviewCount) -
          computeWeightedRatingScore(a.ratingAvg, a.reviewCount)
        );
      case 'newest':
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });
}

export function canTransitionOrderStatus(
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
): boolean {
  if (fromStatus === toStatus) return true;
  return ORDER_STATUS_FLOW[fromStatus]?.includes(toStatus) ?? false;
}

export function slugifyProductName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getStockBadgeInfo(stock: number): {
  label: 'In Stock' | 'Low Stock' | 'Out of Stock';
  tone: 'in' | 'low' | 'out';
} {
  if (stock <= 0) return { label: 'Out of Stock', tone: 'out' };
  if (stock <= 5) return { label: 'Low Stock', tone: 'low' };
  return { label: 'In Stock', tone: 'in' };
}
