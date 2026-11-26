import type {
  AnalyticsData,
  Category,
  InventoryLog,
  DeliveryAddress,
  Order,
  OrderStatus,
  PriceRangeKey,
  Product,
  Review,
  ReviewPage,
  ReviewSort,
  SortOption,
  AdminReviewStats,
  User,
} from '@/types/store';
import { prepareImageForUpload, uploadToCloudinary } from '@/lib/imageUpload';

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
];

function canRefreshAndRetry(path: string): boolean {
  return !NO_RETRY_AUTH_PATHS.some((prefix) => path.startsWith(prefix));
}

async function apiRequest<T>(path: string, options: RequestInit = {}, allowRetry = true): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'TeeStore');
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body && !isFormData && !headers.has('Content-Type')) {
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
  claimAdmin: (payload: {
    name: string;
    email: string;
    password: string;
    passcode?: string;
    avatarUrl?: string;
  }) =>
    apiRequest<{ user: User; token: string; purchasedProductIds: string[] }>('/api/auth/admin/claim', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  // First-run setup for the platform owner at /admin/super.
  superAdminStatus: () =>
    apiRequest<{ claimed: boolean; passcodeConfigured: boolean }>('/api/auth/superadmin/status'),
  claimSuperAdmin: (payload: {
    name: string;
    email: string;
    password: string;
    passcode?: string;
    avatarUrl?: string;
  }) =>
    apiRequest<{ user: User; token: string; purchasedProductIds: string[] }>('/api/auth/superadmin/claim', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  // Uploads a profile photo for the signed-in account and returns the user.
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiRequest<{ user: User; url: string }>('/api/auth/avatar', { method: 'POST', body: form });
  },
  // Seller sign-up: creates a pending seller account that a super admin must
  // verify before the seller console unlocks.
  registerSeller: (payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    avatarUrl?: string;
  }) =>
    apiRequest<{ user: User; token: string; purchasedProductIds: string[] }>('/api/auth/seller/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  // Shopper sign-up: a phone number and password are all that is required.
  register: (payload: {
    phone: string;
    password: string;
    name?: string;
    email?: string;
    address?: string;
    gender?: string;
    avatarUrl?: string;
  }) =>
    apiRequest<{ user: User; token: string; purchasedProductIds: string[] }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  // Admin console sign-in only; shoppers check out as guests.
  login: (payload: { email: string; password: string; portal: 'admin' | 'customer' | 'super' }) =>
    apiRequest<{ user: User; token: string; purchasedProductIds: string[] }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: () => apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  session: () =>
    apiRequest<{ authenticated: boolean; user: User | null; purchasedProductIds: string[] }>('/api/auth/session'),

  // Approximate country from the API edge for the signup dial-code default.
  getGeoCountry: () =>
    apiRequest<{ countryCode: string; city: string; region: string; source: string }>('/api/geo'),

  // Explicit opt-in save/clear of the customer's delivery address.
  saveDeliveryAddress: (deliveryAddress: DeliveryAddress) =>
    apiRequest<{ user: User }>('/api/auth/delivery-address', {
      method: 'PUT',
      body: JSON.stringify({ deliveryAddress }),
    }),
  clearDeliveryAddress: () =>
    apiRequest<{ user: User }>('/api/auth/delivery-address', { method: 'DELETE' }),

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
      ratingSummary: ReviewPage['ratingSummary'];
      reviewPagination?: ReviewPage['pagination'];
    }>(`/api/products/${encodeURIComponent(slug)}`),

  // Orders
  createOrder: (
    payload: {
      customerName: string;
      phone: string;
      address: string;
      deliveryAddress?: DeliveryAddress;
      notes: string;
      paymentMethod: string;
      currency?: string;
      items: Array<{ productId: string; size: string; color: string; quantity: number }>;
    },
    idempotencyKey?: string,
  ) =>
    apiRequest<{ order: Order }>('/api/orders', {
      method: 'POST',
      // The server returns the original order when this key was already used.
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      body: JSON.stringify(payload),
    }),

  getMyOrders: () => apiRequest<{ orders: Order[] }>('/api/orders/my-orders'),

  // Reviews
  getProductReviews: (
    productId: string,
    params?: { page?: number; limit?: number; sort?: ReviewSort; rating?: number },
  ) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.rating) qs.set('rating', String(params.rating));
    const query = qs.toString();
    return apiRequest<ReviewPage>(
      `/api/products/${encodeURIComponent(productId)}/reviews${query ? `?${query}` : ''}`,
    );
  },
  getMyReviews: () => apiRequest<{ reviews: Review[] }>('/api/reviews/my-reviews'),
  createReview: (productId: string, payload: { rating: number; comment?: string }) =>
    apiRequest<{ review: Review; created: boolean }>(
      `/api/products/${encodeURIComponent(productId)}/reviews`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  updateReview: (reviewId: string, payload: { rating: number; comment?: string }) =>
    apiRequest<{ review: Review }>(`/api/reviews/${encodeURIComponent(reviewId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteReview: (reviewId: string) =>
    apiRequest<{ ok: boolean }>(`/api/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE' }),
  toggleReviewHelpful: (reviewId: string) =>
    apiRequest<{ liked: boolean; helpfulCount: number }>(
      `/api/reviews/${encodeURIComponent(reviewId)}/like`,
      { method: 'POST' },
    ),
  reportReview: (reviewId: string, reason: string) =>
    apiRequest<{ review: Review; reported: boolean }>(
      `/api/reviews/${encodeURIComponent(reviewId)}/report`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    ),

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
  // Uploads go straight from the browser to Cloudinary with the admin-signed
  // params, which is one network hop instead of two and reports real progress.
  uploadProductImage: async (file: File, onProgress?: (percent: number) => void) => {
    onProgress?.(1);
    const signature = await api.getCloudinarySignature().catch(() => null);

    if (
      signature?.configured &&
      signature.cloudName &&
      signature.apiKey &&
      signature.signature &&
      signature.timestamp
    ) {
      const prepared = await prepareImageForUpload(file);
      try {
        const url = await uploadToCloudinary(prepared, signature, onProgress);
        return { url };
      } catch (err) {
        // A blocked direct upload falls back to relaying through the API server.
        if (!(err instanceof Error) || err.message !== 'NETWORK') throw err;
      }
    }

    const form = new FormData();
    form.append('file', file);
    const res = await apiRequest<{ url: string }>('/api/admin/uploads', { method: 'POST', body: form });
    onProgress?.(100);
    return res;
  },
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
  getAdminReviews: (params?: { productId?: string; rating?: number }) => {
    const qs = new URLSearchParams();
    if (params?.productId) qs.set('productId', params.productId);
    if (params?.rating) qs.set('rating', String(params.rating));
    const query = qs.toString();
    return apiRequest<{ reviews: Review[]; stats: AdminReviewStats }>(
      `/api/admin/reviews${query ? `?${query}` : ''}`,
    );
  },
  deleteAdminReview: (reviewId: string) =>
    apiRequest<{ ok: boolean }>(`/api/admin/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE' }),
  resolveAdminReviewReports: (reviewId: string) =>
    apiRequest<{ ok: boolean }>(
      `/api/admin/reviews/${encodeURIComponent(reviewId)}/resolve-reports`,
      { method: 'POST' },
    ),
  getSettings: () => apiRequest<{ settings: Record<string, string> }>('/api/admin/settings'),
  updateSettings: (settings: Record<string, string>) =>
    apiRequest<{ settings: Record<string, string> }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  // Super Administrator
  getSuperOverview: () =>
    apiRequest<{
      totalCustomers: number;
      totalAdmins: number;
      totalSuperAdmins: number;
      totalUsers: number;
      pendingSellers: number;
      superAdminLimit: number;
      analytics: AnalyticsData;
    }>('/api/superadmin/overview'),
  getSuperUsers: (search?: string) =>
    apiRequest<{ users: User[] }>(
      `/api/superadmin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    ),
  updateUserRole: (userId: string, role: User['role']) =>
    apiRequest<{ user: User }>(`/api/superadmin/users/${encodeURIComponent(userId)}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
  approveSeller: (userId: string) =>
    apiRequest<{ user: User }>(`/api/superadmin/users/${encodeURIComponent(userId)}/approve`, {
      method: 'PUT',
    }),
  rejectSeller: (userId: string) =>
    apiRequest<{ user: User }>(`/api/superadmin/users/${encodeURIComponent(userId)}/reject`, {
      method: 'PUT',
    }),
  toggleUserDisabled: (userId: string) =>
    apiRequest<{ user: User }>(`/api/superadmin/users/${encodeURIComponent(userId)}/toggle-disabled`, {
      method: 'PUT',
    }),
  deleteUser: (userId: string) =>
    apiRequest<{ ok: boolean }>(`/api/superadmin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }),
  getSuperProducts: (search?: string) =>
    apiRequest<{ products: Product[] }>(
      `/api/superadmin/products${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    ),
  setProductPublished: (productId: string, published: boolean) =>
    apiRequest<{ product: Product }>(`/api/superadmin/products/${encodeURIComponent(productId)}/published`, {
      method: 'PUT',
      body: JSON.stringify({ published }),
    }),
  deleteSuperProduct: (productId: string) =>
    apiRequest<{ ok: boolean; archived?: boolean; message?: string }>(
      `/api/superadmin/products/${encodeURIComponent(productId)}`,
      { method: 'DELETE' },
    ),
};
