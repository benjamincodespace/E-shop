import type {
  AnalyticsData,
  CartItem,
  Category,
  InventoryLog,
  Order,
  OrderStatus,
  PriceRangeKey,
  Product,
  Review,
  SortOption,
  User,
} from '@/types/store';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');

let inMemoryToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

function resolveApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${API_BASE}${path}`;
}

async function tryRefreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(resolveApiUrl('/api/auth/refresh'), {
        method: 'POST',
        headers: { 'X-Requested-With': 'TeeStore' },
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string };
      if (data.token) {
        inMemoryToken = data.token;
        return data.token;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// Endpoints that must never loop through the refresh-and-retry cycle.
const NO_RETRY_AUTH_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/admin/claim',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/session',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
];

function canRefreshAndRetry(path: string): boolean {
  return !NO_RETRY_AUTH_PATHS.some((prefix) => path.startsWith(prefix));
}

async function apiRequest<T>(path: string, options: RequestInit = {}, allowRetry = true): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'TeeStore');
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  const res = await fetch(resolveApiUrl(path), {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && allowRetry && canRefreshAndRetry(path)) {
    const newToken = await tryRefreshAccessToken();
    if (newToken) {
      return apiRequest<T>(path, options, false);
    }
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const message = (data && typeof data.error === 'string' && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data as T;
}

export const api = {
  // Auth
  getAdminStatus: () => apiRequest<{ claimed: boolean; passcodeConfigured: boolean }>('/api/auth/admin/status'),
  claimAdmin: (payload: { name: string; email: string; password: string; passcode?: string }) =>
    apiRequest<{ user: User; token: string; purchasedProductIds: string[] }>('/api/auth/admin/claim', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  register: (payload: { name: string; phone: string; password: string; email?: string; address?: string }) =>
    apiRequest<{ user: User; token: string; purchasedProductIds: string[] }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  // `email` accepts either an email address or a phone number.
  login: (payload: { email: string; password: string; portal?: 'customer' | 'admin' }) =>
    apiRequest<{ user: User; token: string; purchasedProductIds: string[] }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: () => apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  session: () =>
    apiRequest<{ authenticated: boolean; user: User | null; purchasedProductIds: string[] }>('/api/auth/session'),
  me: () => apiRequest<{ user: User; purchasedProductIds: string[] }>('/api/auth/me'),
  updateProfile: (payload: { name: string; phone: string; address: string }) =>
    apiRequest<{ user: User }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  // `email` accepts either an email address or a phone number.
  forgotPassword: (email: string) =>
    apiRequest<{ message: string; previewResetCode?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (payload: { email: string; code: string; newPassword: string }) =>
    apiRequest<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Catalog & Products
  getCategories: () => apiRequest<{ categories: Category[] }>('/api/categories'),
  getProducts: (params?: {
    search?: string;
    category?: string;
    priceRange?: PriceRangeKey;
    sort?: SortOption;
    featured?: boolean;
    popular?: boolean;
    page?: number;
    limit?: number;
    includeUnpublished?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category) qs.set('category', params.category);
    if (params?.priceRange) qs.set('priceRange', params.priceRange);
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.featured) qs.set('featured', 'true');
    if (params?.popular) qs.set('popular', 'true');
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.includeUnpublished) qs.set('includeUnpublished', 'true');
    const query = qs.toString();
    return apiRequest<{
      products: Product[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/api/products${query ? `?${query}` : ''}`);
  },
  getProductBySlug: (slug: string) =>
    apiRequest<{
      product: Product;
      reviews: Review[];
      ratingSummary: {
        average: number;
        total: number;
        breakdown: Array<{ stars: number; count: number; percentage: number }>;
      };
    }>(`/api/products/${encodeURIComponent(slug)}`),

  // Cart & Wishlist
  getCart: () => apiRequest<{ items: CartItem[] }>('/api/cart'),
  addToCart: (payload: { productId: string; size: string; color: string; quantity: number }) =>
    apiRequest<{ items: CartItem[] }>('/api/cart', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  syncCart: (items: Array<{ productId: string; size: string; color: string; quantity: number }>) =>
    apiRequest<{ items: CartItem[] }>('/api/cart/sync', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  updateCartItem: (productId: string, payload: { size: string; color: string; quantity: number }) =>
    apiRequest<{ items: CartItem[] }>(`/api/cart/${encodeURIComponent(productId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  removeCartItem: (productId: string, size: string, color: string) =>
    apiRequest<{ items: CartItem[] }>(
      `/api/cart/${encodeURIComponent(productId)}?size=${encodeURIComponent(size)}&color=${encodeURIComponent(color)}`,
      { method: 'DELETE' },
    ),

  getWishlist: () => apiRequest<{ products: Product[] }>('/api/wishlist'),
  addWishlist: (productId: string) =>
    apiRequest<{ ok: boolean }>(`/api/wishlist/${encodeURIComponent(productId)}`, { method: 'POST' }),
  removeWishlist: (productId: string) =>
    apiRequest<{ ok: boolean }>(`/api/wishlist/${encodeURIComponent(productId)}`, { method: 'DELETE' }),

  // Orders
  createOrder: (payload: {
    customerName: string;
    phone: string;
    address: string;
    notes: string;
    paymentMethod: string;
    items: Array<{ productId: string; size: string; color: string; quantity: number }>;
  }) =>
    apiRequest<{ order: Order }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getMyOrders: () => apiRequest<{ orders: Order[] }>('/api/orders/my-orders'),

  // Reviews
  getProductReviews: (productId: string) =>
    apiRequest<{
      reviews: Review[];
      ratingSummary: {
        average: number;
        total: number;
        breakdown: Array<{ stars: number; count: number; percentage: number }>;
      };
    }>(`/api/products/${encodeURIComponent(productId)}/reviews`),
  getMyReviews: () => apiRequest<{ reviews: Review[] }>('/api/reviews/my-reviews'),
  submitReview: (productId: string, payload: { rating: number; comment: string }) =>
    apiRequest<{ review: Review }>(`/api/products/${encodeURIComponent(productId)}/reviews`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateReview: (reviewId: string, payload: { rating: number; comment: string }) =>
    apiRequest<{ review: Review }>(`/api/reviews/${encodeURIComponent(reviewId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteReview: (reviewId: string) =>
    apiRequest<{ ok: boolean }>(`/api/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE' }),
  toggleReviewLike: (reviewId: string) =>
    apiRequest<{ liked: boolean; helpfulCount: number }>(`/api/reviews/${encodeURIComponent(reviewId)}/like`, {
      method: 'POST',
    }),

  // Newsletter
  subscribeNewsletter: (email: string) =>
    apiRequest<{ ok: boolean; message: string }>('/api/newsletter', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  // Admin
  getAnalytics: () => apiRequest<AnalyticsData>('/api/admin/analytics'),
  createCategory: (payload: { name: string; description: string }) =>
    apiRequest<{ category: Category }>('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createProduct: (payload: Record<string, unknown>) =>
    apiRequest<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateProduct: (id: string, payload: Record<string, unknown>) =>
    apiRequest<{ product: Product }>(`/api/admin/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteProduct: (id: string) =>
    apiRequest<{ ok: boolean; archived?: boolean; message?: string }>(
      `/api/admin/products/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),
  getCloudinarySignature: () =>
    apiRequest<{
      configured: boolean;
      cloudName?: string;
      apiKey?: string;
      timestamp?: number;
      folder?: string;
      signature?: string;
    }>('/api/admin/cloudinary-signature', { method: 'POST' }),
  getAdminOrders: (params?: { status?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    const q = qs.toString();
    return apiRequest<{ orders: Order[] }>(`/api/admin/orders${q ? `?${q}` : ''}`);
  },
  updateOrderStatus: (orderId: string, status: OrderStatus) =>
    apiRequest<{ order: Order }>(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),
  getInventory: () => apiRequest<{ products: Product[]; logs: InventoryLog[] }>('/api/admin/inventory'),
  adjustInventory: (productId: string, payload: { mode: 'delta' | 'set'; value: number; reason: string }) =>
    apiRequest<{ product: Product }>(`/api/admin/inventory/${encodeURIComponent(productId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  getCustomers: (search?: string) =>
    apiRequest<{
      customers: Array<User & { orderCount: number; totalSpent: number }>;
    }>(`/api/admin/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getCustomerOrders: (customerId: string) =>
    apiRequest<{ orders: Order[] }>(`/api/admin/customers/${encodeURIComponent(customerId)}/orders`),
  toggleCustomerDisabled: (customerId: string) =>
    apiRequest<{ customer: User }>(`/api/admin/customers/${encodeURIComponent(customerId)}/toggle-disabled`, {
      method: 'PUT',
    }),
  getAdminReviews: () => apiRequest<{ reviews: Review[] }>('/api/admin/reviews'),
  deleteAdminReview: (reviewId: string) =>
    apiRequest<{ ok: boolean }>(`/api/admin/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE' }),
  getSettings: () => apiRequest<{ settings: Record<string, string> }>('/api/admin/settings'),
  updateSettings: (settings: Record<string, string>) =>
    apiRequest<{ settings: Record<string, string> }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};
