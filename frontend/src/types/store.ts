export type CurrencyCode = 'USD' | 'EUR' | 'ZAR' | 'KES' | 'TZS' | 'UGX' | 'RWF' | 'XOF';

export type UserRole = 'customer' | 'admin' | 'super_admin';

export type Gender = 'male' | 'female' | 'prefer_not_to_say';

export type OrderStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Processing'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled';

export type TeeSize = 'S' | 'M' | 'L' | 'XL' | 'XXL';

export interface TeeColorOption {
  name: string;
  hex: string;
}

export interface DeliveryAddress {
  country: string;
  city: string;
  district?: string;
  street: string;
  building?: string;
  instructions?: string;
  /** Present only when the customer captured a GPS pin. */
  latitude?: number;
  longitude?: number;
}

export interface User {
  id: string;
  name: string;
  /** Uploaded profile photo; empty for accounts that never set one. */
  avatarUrl?: string;
  email: string;
  phone: string;
  address: string;
  /** Saved only when the customer explicitly chose to keep it. */
  deliveryAddress?: DeliveryAddress | null;
  /** Optional; older accounts have no gender value. */
  gender?: Gender | '';
  role: UserRole;
  /** Seller approval state; empty for legacy accounts and buyers. */
  approvalStatus?: '' | 'pending' | 'approved' | 'rejected';
  /** True once a super administrator verifies the seller. */
  verified?: boolean;
  verifiedAt?: string;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  productCount?: number;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  currency: CurrencyCode;
  discountPrice: number | null;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  /** Seller account that uploaded the product; empty for legacy products. */
  sellerId?: string;
  sellerName?: string;
  images: string[];
  sizes: TeeSize[];
  colors: TeeColorOption[];
  stock: number;
  featured: boolean;
  popular: boolean;
  published: boolean;
  ratingAvg: number;
  reviewCount: number;
  weightedScore?: number;
  seoTitle: string;
  seoDescription: string;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  productId: string;
  productName?: string;
  productSlug?: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  helpfulCount: number;
  userHasLiked?: boolean;
  verifiedPurchase: boolean;
  reported?: boolean;
  reportCount?: number;
  userHasReported?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RatingBreakdownRow {
  stars: number;
  count: number;
  percentage: number;
}

export interface RatingSummary {
  average: number;
  total: number;
  breakdown: RatingBreakdownRow[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type ReviewSort = 'newest' | 'oldest' | 'highest' | 'lowest' | 'helpful';

export interface ReviewPage {
  reviews: Review[];
  ratingSummary: RatingSummary;
  pagination: Pagination;
}

export interface AdminReviewStats {
  total: number;
  average: number;
  reported: number;
  verified: number;
  breakdown: RatingBreakdownRow[];
}

export interface CartItem {
  id?: string;
  productId: string;
  productName: string;
  productSlug: string;
  productImage: string;
  size: TeeSize;
  color: string;
  quantity: number;
  unitPrice: number;
  originalPrice: number;
  maxStock: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  productImage: string;
  size: TeeSize;
  color: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerEmail?: string;
  phone: string;
  address: string;
  /** Immutable snapshot of the confirmed delivery details. */
  deliveryAddress?: DeliveryAddress | null;
  notes: string;
  currency: CurrencyCode;
  subtotal: number;
  shippingFee: number;
  total: number;
  status: OrderStatus;
  paymentMethod: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLog {
  id: string;
  productId: string;
  productName?: string;
  changeAmount: number;
  previousStock: number;
  newStock: number;
  reason: string;
  actorName: string;
  createdAt: string;
}

export interface AnalyticsData {
  totalProducts: number;
  totalSales: number;
  totalOrders: number;
  totalCustomers: number;
  inStockCount: number;
  outOfStockCount: number;
  lowStockCount: number;
  highestRatedProduct: Product | null;
  salesOverview: Array<{ label: string; sales: number; orders: number }>;
  topProducts: Array<{
    id: string;
    name: string;
    slug: string;
    image: string;
    unitsSold: number;
    revenue: number;
    ratingAvg: number;
    reviewCount: number;
  }>;
  recentOrders: Order[];
  recentProducts: Product[];
  lowStockProducts: Product[];
}

export type SortOption = 'newest' | 'price-asc' | 'price-desc' | 'rating';
export type PriceRangeKey = 'all' | '0-15' | '15-25' | '25-40' | '40+';
