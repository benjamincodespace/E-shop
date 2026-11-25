import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCartSummary,
  calculateDiscountPercent,
  calculateRatingSummary,
  canTransitionOrderStatus,
  computeWeightedRatingScore,
  filterAndSortProducts,
  getEffectivePrice,
  getStockBadgeInfo,
  slugifyProductName,
} from './storeLogic';
import type { CartItem, Product } from '../types/store';

test('pricing and discount calculation', () => {
  assert.equal(getEffectivePrice({ price: 22, discountPrice: 15 }), 15);
  assert.equal(getEffectivePrice({ price: 22, discountPrice: null }), 22);
  assert.equal(getEffectivePrice({ price: 22, discountPrice: 25 }), 22);
  assert.equal(calculateDiscountPercent(22, 15), 32);
  assert.equal(calculateDiscountPercent(22, null), 0);
});

test('cart summary applies $50 free shipping threshold accurately', () => {
  const oneItem: CartItem[] = [
    {
      productId: '656f1234567890abcdef0001',
      productName: 'Classic Crest Tee',
      productSlug: 'classic-crest-tee',
      productImage: '/images/tee_black_classic_1795513062767.jpg',
      size: 'M',
      color: 'Black',
      quantity: 2,
      unitPrice: 15,
      originalPrice: 22,
      maxStock: 20,
    },
  ];
  const underThreshold = calculateCartSummary(oneItem);
  assert.equal(underThreshold.subtotal, 30);
  assert.equal(underThreshold.shippingFee, 6);
  assert.equal(underThreshold.total, 36);
  assert.equal(underThreshold.amountToFreeShipping, 20);

  const overThreshold = calculateCartSummary([{ ...oneItem[0], quantity: 4 }]);
  assert.equal(overThreshold.subtotal, 60);
  assert.equal(overThreshold.shippingFee, 0);
  assert.equal(overThreshold.total, 60);
  assert.equal(overThreshold.amountToFreeShipping, 0);
});

test('rating breakdown and Bayesian weighted rating ranking', () => {
  const summary = calculateRatingSummary([{ rating: 5 }, { rating: 5 }, { rating: 4 }, { rating: 3 }]);
  assert.equal(summary.total, 4);
  assert.equal(summary.average, 4.3);
  assert.equal(summary.breakdown[0].stars, 5);
  assert.equal(summary.breakdown[0].percentage, 50);

  const highVolumeScore = computeWeightedRatingScore(4.8, 120);
  const singleFiveScore = computeWeightedRatingScore(5.0, 1);
  assert.ok(highVolumeScore > singleFiveScore);
});

test('order state machine and stock badge rules', () => {
  assert.equal(canTransitionOrderStatus('Pending', 'Confirmed'), true);
  assert.equal(canTransitionOrderStatus('Delivered', 'Cancelled'), false);
  assert.equal(getStockBadgeInfo(0).tone, 'out');
  assert.equal(getStockBadgeInfo(4).tone, 'low');
  assert.equal(getStockBadgeInfo(15).tone, 'in');
  assert.equal(slugifyProductName('  STRCTR Boxy Tee!  '), 'strctr-boxy-tee');
});

test('catalog filtering by category, price range, and rating sort', () => {
  const sampleProducts: Product[] = [
    {
      id: 'p1',
      name: 'Classic Crest Tee',
      slug: 'classic-crest-tee',
      description: 'Soft black cotton',
      price: 22,
      discountPrice: 15,
      categoryId: 'c1',
      categoryName: 'Classics',
      categorySlug: 'classics',
      images: ['/images/tee_black_classic_1795513062767.jpg'],
      sizes: ['S', 'M', 'L'],
      colors: [{ name: 'Black', hex: '#111111' }],
      stock: 10,
      featured: true,
      popular: true,
      published: true,
      ratingAvg: 4.8,
      reviewCount: 40,
      seoTitle: 'Classic',
      seoDescription: 'Classic',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'p2',
      name: 'Monolith Oversized Tee',
      slug: 'monolith-oversized-tee',
      description: '300gsm heavy cotton',
      price: 42,
      discountPrice: 36,
      categoryId: 'c2',
      categoryName: 'Streetwear',
      categorySlug: 'streetwear',
      images: ['/images/tee_charcoal_oversized_1795513063222.jpg'],
      sizes: ['M', 'L'],
      colors: [{ name: 'Charcoal', hex: '#27272A' }],
      stock: 5,
      featured: true,
      popular: false,
      published: true,
      ratingAvg: 5.0,
      reviewCount: 1,
      seoTitle: 'Monolith',
      seoDescription: 'Monolith',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];

  const byPrice = filterAndSortProducts(sampleProducts, { priceRange: '25-40' });
  assert.equal(byPrice.length, 1);
  assert.equal(byPrice[0].id, 'p2');

  const byRating = filterAndSortProducts(sampleProducts, { sortBy: 'rating' });
  assert.equal(byRating[0].id, 'p1');
});
