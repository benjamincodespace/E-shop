export type UserRole = 'customer' | 'admin';

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

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  role: UserRole;
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
  discountPrice: number | null;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
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
  createdAt: string;
  updatedAt: string;
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
  notes: string;
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
