'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Box,
  Check,
  CloudUpload,
  Edit3,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Shirt,
  ShoppingCart,
  Star,
  Trash2,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { api } from '@/services/api';
import type {
  AnalyticsData,
  InventoryLog,
  Order,
  OrderStatus,
  Product,
  Review,
  TeeSize,
  User,
} from '@/types/store';
import { BrandLogo } from './BrandLogo';
import { SafeImage } from './SafeImage';
import { computeWeightedRatingScore, getEffectivePrice, getStockBadgeInfo, slugifyProductName } from '@/lib/storeLogic';

type AdminTab = 'dashboard' | 'products' | 'orders' | 'customers' | 'reviews' | 'analytics' | 'settings';

const STUDIO_PRESET_IMAGES = [
  '/images/tee_black_classic_1795513062767.jpg',
  '/images/tee_white_essential_1795513064080.jpg',
  '/images/tee_charcoal_oversized_1795513063222.jpg',
  '/images/tee_bone_minimal_1795513063679.jpg',
  '/images/tee_graphite_sport_1795513064472.jpg',
];

const ALL_SIZES: TeeSize[] = ['S', 'M', 'L', 'XL', 'XXL'];
const ORDER_STATUSES: OrderStatus[] = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

export const AdminDashboard: React.FC<{ initialTab?: string }> = ({ initialTab }) => {
  const { user, authReady, categories, loginUser, claimAdminAccount, logoutUser, navigate, notify, refreshCatalog } =
    useStore();

  const [tab, setTab] = useState<AdminTab>(() => {
    const valid: AdminTab[] = ['dashboard', 'products', 'orders', 'customers', 'reviews', 'analytics', 'settings'];
    return valid.includes(initialTab as AdminTab) ? (initialTab as AdminTab) : 'dashboard';
  });

  useEffect(() => {
    const valid: AdminTab[] = ['dashboard', 'products', 'orders', 'customers', 'reviews', 'analytics', 'settings'];
    if (initialTab && valid.includes(initialTab as AdminTab)) {
      setTab(initialTab as AdminTab);
    }
  }, [initialTab]);

  // Auth gate state
  const [adminStatus, setAdminStatus] = useState<{ claimed: boolean; passcodeConfigured: boolean } | null>(null);
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authPasscode, setAuthPasscode] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Admin Data
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Array<User & { orderCount: number; totalSpent: number }>>([]);
  const [adminReviews, setAdminReviews] = useState<Review[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Filters
  const [productStockFilter, setProductStockFilter] = useState<'all' | 'in' | 'out' | 'low'>('all');
  const [productSearch, setProductSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('All');
  const [orderSearch, setOrderSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerOrders, setSelectedCustomerOrders] = useState<{
    customer: User;
    orders: Order[];
  } | null>(null);

  // Product Modal State
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPrice, setFormPrice] = useState('25');
  const [formDiscountPrice, setFormDiscountPrice] = useState('');
  const [formCategoryId, setFormCategoryId] = useState<string>('');
  const [formImages, setFormImages] = useState<string[]>([STUDIO_PRESET_IMAGES[0]]);
  const [formSizes, setFormSizes] = useState<TeeSize[]>(['S', 'M', 'L', 'XL']);
  const [formColorsText, setFormColorsText] = useState('Black:#111111, White:#FFFFFF');
  const [formStock, setFormStock] = useState('15');
  const [formFeatured, setFormFeatured] = useState(true);
  const [formPopular, setFormPopular] = useState(true);
  const [formPublished, setFormPublished] = useState(true);
  const [formSeoTitle, setFormSeoTitle] = useState('');
  const [formSeoDesc, setFormSeoDesc] = useState('');
  const [uploadingImg, setUploadingImg] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  // Category creation state
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      api
        .getAdminStatus()
        .then(setAdminStatus)
        .catch(() => setAdminStatus({ claimed: false, passcodeConfigured: false }));
    }
  }, [user]);

  const loadAdminData = useCallback(async () => {
    if (!user || user.role !== 'admin') return;
    setLoading(true);
    try {
      const [anRes, prodRes, invRes, ordRes, custRes, revRes, setRes] = await Promise.all([
        api.getAnalytics(),
        api.getProducts({ includeUnpublished: true, limit: 100 }),
        api.getInventory(),
        api.getAdminOrders(),
        api.getCustomers(),
        api.getAdminReviews(),
        api.getSettings(),
      ]);
      setAnalytics(anRes);
      setAdminProducts(prodRes.products);
      setInventoryLogs(invRes.logs);
      setOrders(ordRes.orders);
      setCustomers(custRes.customers);
      setAdminReviews(revRes.reviews);
      setSettings(setRes.settings);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed loading admin metrics.', 'error');
    } finally {
      setLoading(false);
    }
  }, [user, notify]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleAdminClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    try {
      await claimAdminAccount({
        name: authName,
        email: authEmail,
        password: authPassword,
        passcode: authPasscode || undefined,
      });
      notify('Admin account initialized. Welcome to TeeStore Admin!', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Admin setup failed.', 'error');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    try {
      await loginUser(authEmail, authPassword, 'admin');
      notify('Signed in to TeeStore Admin Panel', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Admin sign-in failed.', 'error');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const openCreateProduct = () => {
    setEditingProduct(null);
    setFormName('');
    setFormSlug('');
    setFormDesc('');
    setFormPrice('24');
    setFormDiscountPrice('');
    setFormCategoryId(categories[0]?.id || '');
    setFormImages([STUDIO_PRESET_IMAGES[0]]);
    setFormSizes(['S', 'M', 'L', 'XL']);
    setFormColorsText('Black:#111111, White:#FFFFFF');
    setFormStock('20');
    setFormFeatured(true);
    setFormPopular(true);
    setFormPublished(true);
    setFormSeoTitle('');
    setFormSeoDesc('');
    setProductModalOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormSlug(p.slug);
    setFormDesc(p.description);
    setFormPrice(String(p.price));
    setFormDiscountPrice(p.discountPrice ? String(p.discountPrice) : '');
    setFormCategoryId(p.categoryId || categories[0]?.id || '');
    setFormImages(p.images.length > 0 ? p.images : [STUDIO_PRESET_IMAGES[0]]);
    setFormSizes(p.sizes);
    setFormColorsText(p.colors.map((c) => `${c.name}:${c.hex}`).join(', '));
    setFormStock(String(p.stock));
    setFormFeatured(p.featured);
    setFormPopular(p.popular);
    setFormPublished(p.published);
    setFormSeoTitle(p.seoTitle);
    setFormSeoDesc(p.seoDescription);
    setProductModalOpen(true);
  };

  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const sig = await api.getCloudinarySignature();
      if (!sig.configured || !sig.cloudName || !sig.apiKey || !sig.signature || !sig.timestamp) {
        throw new Error(
          'Cloudinary is not configured on the Go API server. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET or choose a Studio preset below.',
        );
      }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('api_key', sig.apiKey);
      fd.append('timestamp', String(sig.timestamp));
      fd.append('folder', sig.folder || 'teestore/products');
      fd.append('signature', sig.signature);
      const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
        method: 'POST',
        body: fd,
      });
      const cloudData = (await cloudRes.json()) as { secure_url?: string; error?: { message?: string } };
      if (!cloudRes.ok || !cloudData.secure_url) {
        throw new Error(cloudData.error?.message || 'Cloudinary upload failed');
      }
      setFormImages((prev) => [...prev, cloudData.secure_url!]);
      notify('Uploaded image to Cloudinary', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Image upload failed.', 'error');
    } finally {
      setUploadingImg(false);
      e.target.value = '';
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProduct(true);
    try {
      const colors = formColorsText
        .split(',')
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((chunk) => {
          const [n, h] = chunk.split(':').map((s) => s.trim());
          return { name: n || 'Black', hex: h || '#111111' };
        });

      const payload = {
        name: formName.trim(),
        slug: formSlug.trim() || slugifyProductName(formName),
        description: formDesc.trim(),
        price: Number(formPrice),
        discountPrice: formDiscountPrice.trim() ? Number(formDiscountPrice) : null,
        categoryId: formCategoryId || categories[0]?.id || '',
        images: formImages,
        sizes: formSizes.length > 0 ? formSizes : ['M', 'L'],
        colors: colors.length > 0 ? colors : [{ name: 'Black', hex: '#111111' }],
        stock: Number(formStock),
        featured: formFeatured,
        popular: formPopular,
        published: formPublished,
        seoTitle: formSeoTitle.trim() || `${formName.trim()} | TeeStore`,
        seoDescription: formSeoDesc.trim() || formDesc.trim().slice(0, 155),
      };

      if (editingProduct) {
        await api.updateProduct(editingProduct.id, payload);
        notify(`Updated ${payload.name}`, 'success');
      } else {
        await api.createProduct(payload);
        notify(`Published ${payload.name}`, 'success');
      }

      setProductModalOpen(false);
      await Promise.all([loadAdminData(), refreshCatalog()]);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save product.', 'error');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleQuickStock = async (product: Product, mode: 'delta' | 'set', value: number, reason: string) => {
    try {
      await api.adjustInventory(product.id, { mode, value, reason });
      notify(`Updated stock for ${product.name}`, 'success');
      await Promise.all([loadAdminData(), refreshCatalog()]);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Stock update failed.', 'error');
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    try {
      const res = await api.deleteProduct(product.id);
      notify(res.message || `Deleted ${product.name}`, 'info');
      await Promise.all([loadAdminData(), refreshCatalog()]);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to delete product.', 'error');
    }
  };

  const handleOrderStatusChange = async (orderId: string, status: OrderStatus) => {
    try {
      await api.updateOrderStatus(orderId, status);
      notify(`Order updated to ${status}`, 'success');
      await Promise.all([loadAdminData(), refreshCatalog()]);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update order status.', 'error');
    }
  };

  const handleToggleCustomer = async (customerId: string) => {
    try {
      await api.toggleCustomerDisabled(customerId);
      notify('Updated customer account status', 'info');
      loadAdminData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action failed.', 'error');
    }
  };

  const handleInspectCustomer = async (c: User) => {
    try {
      const res = await api.getCustomerOrders(c.id);
      setSelectedCustomerOrders({ customer: c, orders: res.orders });
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load customer orders.', 'error');
    }
  };

  const handleDeleteAdminReview = async (reviewId: string) => {
    try {
      await api.deleteAdminReview(reviewId);
      notify('Review removed', 'info');
      await Promise.all([loadAdminData(), refreshCatalog()]);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not remove review.', 'error');
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await api.createCategory({ name: newCatName.trim(), description: newCatDesc.trim() });
      setNewCatName('');
      setNewCatDesc('');
      notify('Category created', 'success');
      await Promise.all([loadAdminData(), refreshCatalog()]);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not create category.', 'error');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateSettings(settings);
      notify('Store settings updated', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save settings.', 'error');
    }
  };

  // Protected Auth Gate
  if (!authReady) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    const showFirstRunClaim = adminStatus && !adminStatus.claimed && !adminStatus.passcodeConfigured;

    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white border border-neutral-200 rounded-3xl p-7 shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between mb-6">
            <BrandLogo subtitle="Admin Panel" />
            <button
              type="button"
              onClick={() => navigate({ page: 'home' })}
              className="text-xs font-semibold text-neutral-600 hover:text-neutral-950 inline-flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Storefront</span>
            </button>
          </div>

          {user && user.role !== 'admin' ? (
            <div className="space-y-4">
              <h1 className="font-display text-xl font-bold text-neutral-950">Admin Access Required</h1>
              <p className="text-xs text-neutral-600 leading-relaxed">
                You are currently signed in as customer <strong>{user.email}</strong>. Sign out to authenticate with an
                administrator account.
              </p>
              <button
                type="button"
                onClick={logoutUser}
                className="w-full py-3 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
              >
                Sign Out & Switch to Admin
              </button>
            </div>
          ) : showFirstRunClaim ? (
            <form onSubmit={handleAdminClaim} className="space-y-4">
              <div>
                <h1 className="font-display text-xl font-bold text-neutral-950">Set Up Store Admin</h1>
                <p className="mt-1 text-xs text-neutral-500">
                  Create the primary administrator credentials to unlock product uploads, inventory control, and order
                  management.
                </p>
              </div>
              <div>
                <label htmlFor="adm-claim-name" className="block text-xs font-semibold text-neutral-800 mb-1">
                  Admin Full Name
                </label>
                <input
                  id="adm-claim-name"
                  type="text"
                  required
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="Store Owner"
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
                />
              </div>
              <div>
                <label htmlFor="adm-claim-email" className="block text-xs font-semibold text-neutral-800 mb-1">
                  Admin Email
                </label>
                <input
                  id="adm-claim-email"
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="admin@teestore.studio"
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
                />
              </div>
              <div>
                <label htmlFor="adm-claim-pw" className="block text-xs font-semibold text-neutral-800 mb-1">
                  Admin Password (8+ characters)
                </label>
                <input
                  id="adm-claim-pw"
                  type="password"
                  required
                  minLength={8}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
                />
              </div>
              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-3 rounded-full bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 cursor-pointer disabled:opacity-50"
              >
                {authSubmitting ? 'Creating Admin...' : 'Claim Admin Console'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <h1 className="font-display text-xl font-bold text-neutral-950">Admin Console Sign In</h1>
                <p className="mt-1 text-xs text-neutral-500">
                  Restricted to authorized TeeStore administrators.
                </p>
              </div>
              <div>
                <label htmlFor="adm-email" className="block text-xs font-semibold text-neutral-800 mb-1">
                  Admin Email
                </label>
                <input
                  id="adm-email"
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="admin@teestore.studio"
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
                />
              </div>
              <div>
                <label htmlFor="adm-pw" className="block text-xs font-semibold text-neutral-800 mb-1">
                  Password {adminStatus?.passcodeConfigured ? 'or Admin Passcode' : ''}
                </label>
                <input
                  id="adm-pw"
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
                />
              </div>
              {adminStatus && !adminStatus.claimed && adminStatus.passcodeConfigured && (
                <p className="text-[11px] text-neutral-500">
                  Server passcode configured: signing in with the configured passcode initializes your admin session.
                </p>
              )}
              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-3 rounded-full bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 cursor-pointer disabled:opacity-50"
              >
                {authSubmitting ? 'Signing In...' : 'Enter Admin Panel'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Filtered lists
  const filteredProducts = adminProducts.filter((p) => {
    if (productStockFilter === 'in' && p.stock <= 0) return false;
    if (productStockFilter === 'out' && p.stock > 0) return false;
    if (productStockFilter === 'low' && (p.stock <= 0 || p.stock > 5)) return false;
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.categoryName.toLowerCase().includes(q);
    }
    return true;
  });

  const topRatedLeaderboard = [...adminProducts]
    .sort(
      (a, b) =>
        computeWeightedRatingScore(b.ratingAvg, b.reviewCount) -
        computeWeightedRatingScore(a.ratingAvg, a.reviewCount),
    )
    .slice(0, 6);

  const filteredOrders = orders.filter((o) => {
    if (orderStatusFilter !== 'All' && o.status !== orderStatusFilter) return false;
    if (orderSearch.trim()) {
      const q = orderSearch.toLowerCase();
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.customerEmail || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'products', label: 'Products', icon: Shirt },
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'reviews', label: 'Reviews', icon: MessageSquare },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const inStockCount = adminProducts.filter((p) => p.stock > 0).length;
  const outOfStockCount = adminProducts.filter((p) => p.stock <= 0).length;

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {/* Desktop Solid Black Sidebar */}
      <aside className="hidden lg:flex w-64 bg-neutral-950 text-white flex-col justify-between p-5 shrink-0 sticky top-0 h-screen">
        <div>
          <div className="pb-6 border-b border-neutral-800">
            <BrandLogo inverted subtitle="Admin Panel" />
          </div>

          <nav aria-label="Admin navigation" className="mt-6 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    active ? 'bg-white text-neutral-950' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-1.5 pt-4 border-t border-neutral-800">
          <button
            type="button"
            onClick={() => navigate({ page: 'home' })}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-900 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Storefront</span>
          </button>
          <button
            type="button"
            onClick={logoutUser}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-900 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 pb-24 lg:pb-10">
        {/* Top Admin Bar */}
        <header className="glass-surface border-b border-neutral-200/80 px-4 sm:px-8 py-3.5 sticky top-0 z-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="lg:hidden">
              <BrandLogo subtitle="Admin Panel" />
            </div>
            <h1 className="hidden lg:block font-display text-xl font-bold text-neutral-950 capitalize">{tab}</h1>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={openCreateProduct}
              className="px-4 py-2 rounded-full bg-neutral-950 text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-neutral-800 cursor-pointer whitespace-nowrap"
            >
              <CloudUpload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Upload New T-Shirt</span>
              <span className="sm:hidden">Upload</span>
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'home' })}
              className="px-3.5 py-2 rounded-full border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 hover:border-neutral-950 cursor-pointer whitespace-nowrap"
            >
              Store
            </button>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 space-y-6">
          {/* DASHBOARD TAB */}
          {tab === 'dashboard' && (
            <>
              <div className="relative rounded-3xl overflow-hidden bg-neutral-950 text-white p-6 sm:p-7 flex items-center justify-between">
                <div className="relative z-10 max-w-md">
                  <h2 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
                    Welcome Back, {user.name.split(' ')[0]}!
                  </h2>
                  <p className="mt-1.5 text-xs sm:text-sm text-neutral-300">
                    Manage your T-shirt inventory, orders, and verified reviews from one clean console.
                  </p>
                </div>
                <div className="hidden sm:block w-56 h-28 rounded-2xl overflow-hidden shrink-0">
                  <SafeImage
                    src="/images/admin_white_tee_banner_1795513064922.jpg"
                    alt="TeeStore Admin Banner"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center justify-between text-neutral-500">
                    <span className="text-xs font-medium">Total Products</span>
                    <Shirt className="w-4 h-4 text-neutral-900" />
                  </div>
                  <p className="mt-2 font-display text-2xl font-bold text-neutral-950 tabular-nums">
                    {analytics?.totalProducts ?? adminProducts.length}
                  </p>
                  <p className="mt-1 text-[11px] text-neutral-500 tabular-nums">
                    {analytics?.inStockCount ?? inStockCount} in stock · {analytics?.outOfStockCount ?? outOfStockCount} out
                  </p>
                </div>

                <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center justify-between text-neutral-500">
                    <span className="text-xs font-medium">Total Sales</span>
                    <TrendingUp className="w-4 h-4 text-neutral-900" />
                  </div>
                  <p className="mt-2 font-mono-num text-2xl font-bold text-neutral-950">
                    ${(analytics?.totalSales ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="mt-1 text-[11px] text-neutral-500">From non-cancelled orders</p>
                </div>

                <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center justify-between text-neutral-500">
                    <span className="text-xs font-medium">Total Orders</span>
                    <ShoppingCart className="w-4 h-4 text-neutral-900" />
                  </div>
                  <p className="mt-2 font-display text-2xl font-bold text-neutral-950 tabular-nums">
                    {analytics?.totalOrders ?? orders.length}
                  </p>
                  <p className="mt-1 text-[11px] text-neutral-500 tabular-nums">
                    {analytics?.totalCustomers ?? customers.length} registered customers
                  </p>
                </div>

                <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center justify-between text-neutral-500">
                    <span className="text-xs font-medium">Highest Rated</span>
                    <Star className="w-4 h-4 fill-neutral-950 text-neutral-950" />
                  </div>
                  <p className="mt-2 font-display text-2xl font-bold text-neutral-950 tabular-nums">
                    {analytics?.highestRatedProduct
                      ? `${analytics.highestRatedProduct.ratingAvg.toFixed(1)} ★`
                      : '—'}
                  </p>
                  <p className="mt-1 text-[11px] text-neutral-500 truncate">
                    {analytics?.highestRatedProduct?.name || 'No ratings yet'}
                  </p>
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h3 className="font-display text-sm font-bold text-neutral-950 mb-3">Quick Actions</h3>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={openCreateProduct}
                    className="bg-white border border-neutral-200/80 hover:border-neutral-950 rounded-2xl p-4 flex flex-col items-center text-center gap-2 transition-colors cursor-pointer"
                  >
                    <CloudUpload className="w-5 h-5 text-neutral-950" />
                    <span className="text-xs font-semibold text-neutral-900">Upload New T-Shirt</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProductStockFilter('low');
                      setTab('products');
                    }}
                    className="bg-white border border-neutral-200/80 hover:border-neutral-950 rounded-2xl p-4 flex flex-col items-center text-center gap-2 transition-colors cursor-pointer"
                  >
                    <Box className="w-5 h-5 text-neutral-950" />
                    <span className="text-xs font-semibold text-neutral-900">Manage Stock</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('analytics')}
                    className="bg-white border border-neutral-200/80 hover:border-neutral-950 rounded-2xl p-4 flex flex-col items-center text-center gap-2 transition-colors cursor-pointer"
                  >
                    <Trophy className="w-5 h-5 text-neutral-950" />
                    <span className="text-xs font-semibold text-neutral-900">View Top Rated</span>
                  </button>
                </div>
              </div>

              {/* Sales Overview Chart + Top Products */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-7 bg-white border border-neutral-200/80 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-display text-sm font-bold text-neutral-950">Sales Overview</h3>
                      <p className="text-[11px] text-neutral-500">Monthly revenue from confirmed orders</p>
                    </div>
                  </div>
                  <SalesOverviewChart data={analytics?.salesOverview || []} />
                </div>

                <div className="lg:col-span-5 bg-white border border-neutral-200/80 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-sm font-bold text-neutral-950">Top Products</h3>
                    <button
                      type="button"
                      onClick={() => setTab('products')}
                      className="text-xs font-medium text-neutral-500 hover:text-neutral-950 cursor-pointer"
                    >
                      See All →
                    </button>
                  </div>
                  <div className="space-y-3">
                    {(analytics?.topProducts || []).map((tp) => (
                      <div key={tp.id} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-neutral-100 overflow-hidden shrink-0">
                            <SafeImage src={tp.image} alt={tp.name} eager className="w-full h-full object-cover" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-neutral-950 truncate">{tp.name}</p>
                            <p className="text-[11px] text-neutral-500 tabular-nums">
                              {tp.unitsSold} sold · {tp.ratingAvg.toFixed(1)} ★
                            </p>
                          </div>
                        </div>
                        <span className="font-mono-num text-xs font-bold text-neutral-950">
                          ${tp.revenue.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent Orders + Low Stock Alert */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-7 bg-white border border-neutral-200/80 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display text-sm font-bold text-neutral-950">Recent Orders</h3>
                    <button
                      type="button"
                      onClick={() => setTab('orders')}
                      className="text-xs font-medium text-neutral-500 hover:text-neutral-950 cursor-pointer"
                    >
                      See All →
                    </button>
                  </div>
                  <div className="divide-y divide-neutral-100">
                    {(analytics?.recentOrders || []).slice(0, 5).map((ord) => (
                      <div key={ord.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono-num font-bold text-neutral-950">{ord.orderNumber}</span>
                          <span className="text-neutral-600 truncate">{ord.customerName}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono-num font-semibold text-neutral-950">
                            ${ord.total.toFixed(2)}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-800 text-[11px] font-semibold">
                            {ord.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-5 bg-white border border-neutral-200/80 rounded-2xl p-5">
                  <h3 className="font-display text-sm font-bold text-neutral-950 mb-3">Low Stock Alert</h3>
                  {(analytics?.lowStockProducts || []).length === 0 ? (
                    <p className="text-xs text-neutral-500">All products are well stocked.</p>
                  ) : (
                    <div className="space-y-3">
                      {(analytics?.lowStockProducts || []).map((lp) => (
                        <div key={lp.id} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-neutral-100 overflow-hidden shrink-0">
                              <SafeImage src={lp.images[0]} alt={lp.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-neutral-950 truncate">{lp.name}</p>
                              <p className="text-[11px] text-amber-700 font-semibold tabular-nums">
                                Only {lp.stock} left
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleQuickStock(lp, 'delta', 10, 'Quick restock +10')}
                            className="px-3 py-1.5 rounded-full border border-neutral-200 hover:border-neutral-950 text-xs font-semibold cursor-pointer"
                          >
                            +10 Stock
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* PRODUCTS & INVENTORY TAB */}
          {tab === 'products' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {(
                    [
                      { id: 'all', label: `All (${adminProducts.length})` },
                      { id: 'in', label: `In Stock (${inStockCount})` },
                      { id: 'out', label: `Out of Stock (${outOfStockCount})` },
                      {
                        id: 'low',
                        label: `Low Stock (${adminProducts.filter((p) => p.stock > 0 && p.stock <= 5).length})`,
                      },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setProductStockFilter(f.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                        productStockFilter === f.id
                          ? 'bg-neutral-950 text-white'
                          : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-full px-3.5 py-2 w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-neutral-400" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search products..."
                    aria-label="Search admin products"
                    className="w-full text-xs bg-transparent focus:outline-none"
                  />
                </div>
              </div>

              {loading && adminProducts.length === 0 ? (
                <div className="h-40 bg-white rounded-2xl border border-neutral-200 animate-pulse" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredProducts.map((p) => {
                    const badge = getStockBadgeInfo(p.stock);
                    const effPrice = getEffectivePrice(p);
                    return (
                      <div
                        key={p.id}
                        className="bg-white border border-neutral-200/80 rounded-2xl p-4 flex items-start gap-4"
                      >
                        <div className="w-20 h-20 rounded-xl bg-neutral-100 overflow-hidden shrink-0">
                          <SafeImage src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="font-display text-sm font-bold text-neutral-950 truncate">{p.name}</h3>
                              <div className="flex items-center gap-2 mt-0.5 text-xs">
                                <span className="font-mono-num font-bold text-neutral-950">
                                  ${effPrice.toFixed(2)}
                                </span>
                                <span className="text-neutral-400">·</span>
                                <span className="inline-flex items-center gap-1 text-neutral-600 tabular-nums">
                                  <Star className="w-3 h-3 fill-neutral-950 text-neutral-950" />
                                  {p.ratingAvg.toFixed(1)} ({p.reviewCount})
                                </span>
                              </div>
                            </div>

                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                                badge.tone === 'in'
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : badge.tone === 'low'
                                    ? 'bg-amber-50 text-amber-800'
                                    : 'bg-neutral-100 text-neutral-600'
                              }`}
                            >
                              {badge.label} ({p.stock})
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditProduct(p)}
                              className="px-3 py-1.5 rounded-full border border-neutral-200 hover:border-neutral-950 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>

                            {p.stock > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleQuickStock(p, 'set', 0, 'Marked out of stock by admin')}
                                className="px-3 py-1.5 rounded-full border border-neutral-200 hover:border-neutral-950 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Box className="w-3 h-3" />
                                <span>Remove from Stock</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleQuickStock(p, 'set', 15, 'Restocked by admin')}
                                className="px-3 py-1.5 rounded-full bg-neutral-950 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Box className="w-3 h-3" />
                                <span>Restock (+15)</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(p)}
                              aria-label={`Delete ${p.name}`}
                              className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-950 hover:bg-neutral-100 cursor-pointer ml-auto"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Top Rated Ranking + Inventory Logs */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
                <div className="lg:col-span-6 bg-white border border-neutral-200/80 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-4 h-4 text-neutral-950" />
                    <h3 className="font-display text-sm font-bold text-neutral-950">Top Rated Products</h3>
                  </div>
                  <div className="space-y-2.5">
                    {topRatedLeaderboard.map((tp, idx) => (
                      <div key={tp.id} className="flex items-center justify-between gap-3 py-1.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-neutral-100 overflow-hidden shrink-0">
                            <SafeImage src={tp.images[0]} alt={tp.name} className="w-full h-full object-cover" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-neutral-950 truncate">{tp.name}</p>
                            <p className="text-[11px] text-neutral-500 tabular-nums">
                              ★ {tp.ratingAvg.toFixed(1)} ({tp.reviewCount} reviews)
                            </p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-neutral-950 text-white text-[11px] font-bold tabular-nums">
                          #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-6 bg-white border border-neutral-200/80 rounded-2xl p-5">
                  <h3 className="font-display text-sm font-bold text-neutral-950 mb-3">Recent Inventory Logs</h3>
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {inventoryLogs.slice(0, 12).map((log) => (
                      <div key={log.id} className="flex items-center justify-between gap-3 text-xs py-1.5 border-b border-neutral-100 last:border-b-0">
                        <div className="min-w-0">
                          <p className="font-semibold text-neutral-900 truncate">{log.productName}</p>
                          <p className="text-[11px] text-neutral-500 truncate">{log.reason}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono-num font-bold text-neutral-950">
                            {log.changeAmount >= 0 ? `+${log.changeAmount}` : log.changeAmount}
                          </span>
                          <p className="text-[11px] text-neutral-400 tabular-nums">
                            {log.previousStock} → {log.newStock}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ORDERS TAB */}
          {tab === 'orders' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['All', ...ORDER_STATUSES].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setOrderStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${
                        orderStatusFilter === st
                          ? 'bg-neutral-950 text-white'
                          : 'bg-white border border-neutral-200 text-neutral-700'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-full px-3.5 py-2 w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-neutral-400" />
                  <input
                    type="text"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Search order # or customer..."
                    aria-label="Search orders"
                    className="w-full text-xs bg-transparent focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {filteredOrders.length === 0 ? (
                  <div className="bg-white border border-neutral-200 rounded-2xl p-10 text-center text-xs text-neutral-500">
                    No matching orders found.
                  </div>
                ) : (
                  filteredOrders.map((ord) => (
                    <div key={ord.id} className="bg-white border border-neutral-200/80 rounded-2xl p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono-num text-sm font-bold text-neutral-950">
                              {ord.orderNumber}
                            </span>
                            <span className="text-xs font-semibold text-neutral-800">{ord.customerName}</span>
                          </div>
                          <p className="text-[11px] text-neutral-500 mt-0.5">
                            {ord.phone} · {ord.address}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono-num text-sm font-bold text-neutral-950">
                            ${ord.total.toFixed(2)}
                          </span>
                          <select
                            aria-label={`Update status for order ${ord.orderNumber}`}
                            value={ord.status}
                            disabled={ord.status === 'Delivered' || ord.status === 'Cancelled'}
                            onChange={(e) => handleOrderStatusChange(ord.id, e.target.value as OrderStatus)}
                            className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-900 focus:outline-none focus:border-neutral-950 disabled:opacity-60"
                          >
                            {ORDER_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-100">
                        {ord.items.map((it, idx) => (
                          <span
                            key={it.id || `${it.productId}-${idx}`}
                            className="text-[11px] bg-neutral-100 text-neutral-800 px-3 py-1 rounded-full"
                          >
                            {it.quantity}× {it.productName} ({it.size})
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* CUSTOMERS TAB */}
          {tab === 'customers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-base font-bold text-neutral-950">
                  Registered Customers ({filteredCustomers.length})
                </h2>
                <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-full px-3.5 py-2 w-64">
                  <Search className="w-3.5 h-3.5 text-neutral-400" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search customers..."
                    aria-label="Search customers"
                    className="w-full text-xs bg-transparent focus:outline-none"
                  />
                </div>
              </div>

              <div className="bg-white border border-neutral-200/80 rounded-2xl overflow-hidden">
                <div className="divide-y divide-neutral-100">
                  {filteredCustomers.map((c) => (
                    <div key={c.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-neutral-950 text-white text-xs font-bold flex items-center justify-center shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-neutral-950 truncate">
                            {c.name}{' '}
                            {c.disabled && <span className="text-xs text-neutral-500 font-normal">(Disabled)</span>}
                          </p>
                          <p className="text-xs text-neutral-500 truncate">
                            {c.email || c.phone} · {c.orderCount} orders · ${c.totalSpent.toFixed(2)} spent
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleInspectCustomer(c)}
                          className="px-3 py-1.5 rounded-full border border-neutral-200 hover:border-neutral-950 text-xs font-semibold cursor-pointer"
                        >
                          Order History
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleCustomer(c.id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${
                            c.disabled
                              ? 'bg-neutral-950 text-white'
                              : 'border border-neutral-200 text-neutral-700 hover:border-neutral-950'
                          }`}
                        >
                          {c.disabled ? 'Re-enable' : 'Disable'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* REVIEWS TAB */}
          {tab === 'reviews' && (
            <div className="space-y-3">
              <h2 className="font-display text-base font-bold text-neutral-950">
                Customer Reviews ({adminReviews.length})
              </h2>
              {adminReviews.map((rev) => (
                <div key={rev.id} className="bg-white border border-neutral-200/80 rounded-2xl p-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-neutral-950">{rev.userName}</span>
                      <span className="text-neutral-400">on</span>
                      <span className="font-semibold text-neutral-800">{rev.productName}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3.5 h-3.5 ${
                            s <= rev.rating ? 'fill-neutral-950 text-neutral-950' : 'text-neutral-300'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-neutral-700">{rev.comment}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAdminReview(rev.id)}
                    aria-label={`Remove review by ${rev.userName}`}
                    className="px-3 py-1.5 rounded-full border border-neutral-200 hover:border-neutral-950 text-xs font-semibold text-neutral-700 cursor-pointer shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ANALYTICS TAB */}
          {tab === 'analytics' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white border border-neutral-200/80 rounded-2xl p-5">
                  <h3 className="font-display text-sm font-bold text-neutral-950 mb-4">Revenue Over Time</h3>
                  <SalesOverviewChart data={analytics?.salesOverview || []} />
                </div>

                <div className="bg-white border border-neutral-200/80 rounded-2xl p-5">
                  <h3 className="font-display text-sm font-bold text-neutral-950 mb-4">Orders Over Time</h3>
                  <OrdersBarChart data={analytics?.salesOverview || []} />
                </div>
              </div>

              <div className="bg-white border border-neutral-200/80 rounded-2xl p-5">
                <h3 className="font-display text-sm font-bold text-neutral-950 mb-4">
                  Best-Selling & Top-Rated Leaderboard
                </h3>
                <div className="divide-y divide-neutral-100">
                  {(analytics?.topProducts || []).map((tp, idx) => (
                    <div key={tp.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono-num text-xs font-bold text-neutral-400 w-6">#{idx + 1}</span>
                        <div className="w-10 h-10 rounded-xl bg-neutral-100 overflow-hidden shrink-0">
                          <SafeImage src={tp.image} alt={tp.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-neutral-950 truncate">{tp.name}</p>
                          <p className="text-[11px] text-neutral-500 tabular-nums">
                            {tp.unitsSold} units sold · {tp.ratingAvg.toFixed(1)} ★ ({tp.reviewCount} reviews)
                          </p>
                        </div>
                      </div>
                      <span className="font-mono-num text-sm font-bold text-neutral-950">
                        ${tp.revenue.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS TAB */}
          {tab === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <form
                onSubmit={handleSaveSettings}
                className="bg-white border border-neutral-200/80 rounded-2xl p-6 space-y-4"
              >
                <h2 className="font-display text-base font-bold text-neutral-950">Store Settings</h2>
                <div>
                  <label htmlFor="set-name" className="block text-xs font-semibold text-neutral-800 mb-1">
                    Store Name
                  </label>
                  <input
                    id="set-name"
                    type="text"
                    value={settings.storeName || 'TeeStore'}
                    onChange={(e) => setSettings((s) => ({ ...s, storeName: e.target.value }))}
                    className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="set-tag" className="block text-xs font-semibold text-neutral-800 mb-1">
                    Tagline
                  </label>
                  <input
                    id="set-tag"
                    type="text"
                    value={settings.tagline || 'Wear Your Style'}
                    onChange={(e) => setSettings((s) => ({ ...s, tagline: e.target.value }))}
                    className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="set-email" className="block text-xs font-semibold text-neutral-800 mb-1">
                    Support Email
                  </label>
                  <input
                    id="set-email"
                    type="email"
                    value={settings.supportEmail || 'support@teestore.studio'}
                    onChange={(e) => setSettings((s) => ({ ...s, supportEmail: e.target.value }))}
                    className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
                >
                  Save Settings
                </button>
              </form>

              <form
                onSubmit={handleCreateCategory}
                className="bg-white border border-neutral-200/80 rounded-2xl p-6 space-y-4"
              >
                <h2 className="font-display text-base font-bold text-neutral-950">Add Category</h2>
                <div>
                  <label htmlFor="cat-name" className="block text-xs font-semibold text-neutral-800 mb-1">
                    Category Name
                  </label>
                  <input
                    id="cat-name"
                    type="text"
                    required
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="e.g. Limited Drops"
                    className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="cat-desc" className="block text-xs font-semibold text-neutral-800 mb-1">
                    Description
                  </label>
                  <input
                    id="cat-desc"
                    type="text"
                    value={newCatDesc}
                    onChange={(e) => setNewCatDesc(e.target.value)}
                    placeholder="Short category summary"
                    className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Category</span>
                </button>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Admin Bottom Navigation */}
      <nav
        aria-label="Mobile Admin Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 glass-surface border-t border-neutral-200/80 px-2 py-2 flex items-center justify-around"
      >
        {(
          [
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'products', label: 'Products', icon: Shirt },
            { id: 'orders', label: 'Orders', icon: ShoppingCart },
            { id: 'customers', label: 'Customers', icon: UserCheck },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[11px] font-semibold cursor-pointer ${
                active ? 'text-neutral-950' : 'text-neutral-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
              {active && <span className="w-4 h-0.5 rounded-full bg-neutral-950 mt-0.5" />}
            </button>
          );
        })}
      </nav>

      {/* Customer Orders Drawer Modal */}
      {selectedCustomerOrders && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div>
                <h3 className="font-display text-base font-bold text-neutral-950">
                  {selectedCustomerOrders.customer.name}
                </h3>
                <p className="text-xs text-neutral-500">
                  {selectedCustomerOrders.customer.email || selectedCustomerOrders.customer.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomerOrders(null)}
                aria-label="Close customer orders"
                className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {selectedCustomerOrders.orders.length === 0 ? (
                <p className="text-xs text-neutral-500 py-6 text-center">No orders placed by this customer.</p>
              ) : (
                selectedCustomerOrders.orders.map((o) => (
                  <div key={o.id} className="border border-neutral-200 rounded-2xl p-3.5 text-xs space-y-1.5">
                    <div className="flex justify-between font-bold">
                      <span className="font-mono-num">{o.orderNumber}</span>
                      <span>
                        {o.status} · ${o.total.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-neutral-500">{o.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upload / Edit Product Modal */}
      {productModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-7 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
              <h2 className="font-display text-lg font-bold text-neutral-950">
                {editingProduct ? `Edit ${editingProduct.name}` : 'Upload New T-Shirt'}
              </h2>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                aria-label="Close product modal"
                className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="p-name" className="block text-xs font-semibold text-neutral-800 mb-1">
                    Product Name
                  </label>
                  <input
                    id="p-name"
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      if (!editingProduct) {
                        setFormSlug(slugifyProductName(e.target.value));
                      }
                    }}
                    placeholder="Monochrome Studio Tee"
                    className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="p-slug" className="block text-xs font-semibold text-neutral-800 mb-1">
                    URL Slug
                  </label>
                  <input
                    id="p-slug"
                    type="text"
                    required
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value)}
                    placeholder="monochrome-studio-tee"
                    className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm font-mono-num"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="p-desc" className="block text-xs font-semibold text-neutral-800 mb-1">
                  Description
                </label>
                <textarea
                  id="p-desc"
                  rows={3}
                  required
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Describe cotton weight, fit, and detailing..."
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="p-price" className="block text-xs font-semibold text-neutral-800 mb-1">
                    Price ($)
                  </label>
                  <input
                    id="p-price"
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label htmlFor="p-disc" className="block text-xs font-semibold text-neutral-800 mb-1">
                    Discount Price ($)
                  </label>
                  <input
                    id="p-disc"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formDiscountPrice}
                    onChange={(e) => setFormDiscountPrice(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label htmlFor="p-stock" className="block text-xs font-semibold text-neutral-800 mb-1">
                    Stock Qty
                  </label>
                  <input
                    id="p-stock"
                    type="number"
                    min="0"
                    required
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value)}
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label htmlFor="p-cat" className="block text-xs font-semibold text-neutral-800 mb-1">
                    Category
                  </label>
                  <select
                    id="p-cat"
                    value={formCategoryId}
                    onChange={(e) => setFormCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cloudinary Signed Upload & Studio Presets */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-neutral-800">Product Images (Cloudinary)</span>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-neutral-900 cursor-pointer">
                    <CloudUpload className="w-3.5 h-3.5" />
                    <span>{uploadingImg ? 'Uploading...' : 'Upload to Cloudinary'}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageFileUpload} className="hidden" />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formImages.map((img, i) => (
                    <div key={`${img}-${i}`} className="relative w-16 h-16 rounded-xl bg-neutral-100 overflow-hidden border border-neutral-200">
                      <SafeImage src={img} alt={`Selected ${i + 1}`} className="w-full h-full object-cover" />
                      {formImages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setFormImages((prev) => prev.filter((_, idx) => idx !== i))}
                          aria-label="Remove image"
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-neutral-500">Studio presets:</span>
                  {STUDIO_PRESET_IMAGES.map((preset, idx) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFormImages((prev) => (prev.includes(preset) ? prev : [...prev, preset]))}
                      className="text-[11px] px-2 py-0.5 rounded-full border border-neutral-200 hover:border-neutral-950 cursor-pointer"
                    >
                      + Studio {idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sizes */}
              <div>
                <span className="block text-xs font-semibold text-neutral-800 mb-1.5">Available Sizes</span>
                <div className="flex flex-wrap gap-2">
                  {ALL_SIZES.map((sz) => {
                    const active = formSizes.includes(sz);
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() =>
                          setFormSizes((prev) =>
                            prev.includes(sz) ? prev.filter((s) => s !== sz) : [...prev, sz],
                          )
                        }
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border cursor-pointer ${
                          active
                            ? 'bg-neutral-950 text-white border-neutral-950'
                            : 'bg-white text-neutral-700 border-neutral-200'
                        }`}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="p-colors" className="block text-xs font-semibold text-neutral-800 mb-1">
                    Colors (Name:#Hex, comma-separated)
                  </label>
                  <input
                    id="p-colors"
                    type="text"
                    value={formColorsText}
                    onChange={(e) => setFormColorsText(e.target.value)}
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs font-mono-num"
                  />
                </div>
                <div className="flex items-center gap-4 pt-5">
                  <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formFeatured}
                      onChange={(e) => setFormFeatured(e.target.checked)}
                      className="accent-neutral-950"
                    />
                    Featured
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formPopular}
                      onChange={(e) => setFormPopular(e.target.checked)}
                      className="accent-neutral-950"
                    />
                    Popular
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formPublished}
                      onChange={(e) => setFormPublished(e.target.checked)}
                      className="accent-neutral-950"
                    />
                    Published
                  </label>
                </div>
              </div>

              {/* SEO Metadata */}
              <div className="pt-2 border-t border-neutral-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="p-seo-title" className="block text-xs font-semibold text-neutral-800 mb-1">
                    SEO Title
                  </label>
                  <input
                    id="p-seo-title"
                    type="text"
                    value={formSeoTitle}
                    onChange={(e) => setFormSeoTitle(e.target.value)}
                    placeholder="Auto-generated if blank"
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="p-seo-desc" className="block text-xs font-semibold text-neutral-800 mb-1">
                    SEO Description
                  </label>
                  <input
                    id="p-seo-desc"
                    type="text"
                    value={formSeoDesc}
                    onChange={(e) => setFormSeoDesc(e.target.value)}
                    placeholder="Auto-generated if blank"
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="px-5 py-2.5 rounded-full border border-neutral-200 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProduct}
                  className="px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{savingProduct ? 'Saving...' : editingProduct ? 'Save Changes' : 'Publish T-Shirt'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const SalesOverviewChart: React.FC<{ data: Array<{ label: string; sales: number; orders: number }> }> = ({
  data,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (data.length === 0) {
    return <p className="text-xs text-neutral-400 py-10 text-center">No sales records yet.</p>;
  }

  const width = 460;
  const height = 160;
  const padX = 28;
  const padY = 20;
  const maxSales = Math.max(50, ...data.map((d) => d.sales));

  const points = data.map((d, idx) => {
    const x = data.length === 1 ? width / 2 : padX + (idx / (data.length - 1)) * (width - padX * 2);
    const y = height - padY - (d.sales / maxSales) * (height - padY * 2);
    return { x, y, ...d };
  });

  const linePath = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padY} L ${points[0].x} ${
    height - padY
  } Z`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44 overflow-visible">
        <defs>
          <linearGradient id="monochromeArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a0a0b" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#0a0a0b" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#E5E5E5" strokeWidth="1" />
        <path d={areaPath} fill="url(#monochromeArea)" />
        <path d={linePath} fill="none" stroke="#0a0a0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((pt, idx) => (
          <g key={pt.label}>
            <circle
              cx={pt.x}
              cy={pt.y}
              r={hoveredIdx === idx ? 5.5 : 4}
              fill={hoveredIdx === idx ? '#0a0a0b' : '#ffffff'}
              stroke="#0a0a0b"
              strokeWidth="2.2"
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
            <text x={pt.x} y={height - 3} textAnchor="middle" className="fill-neutral-400 text-[10px]">
              {pt.label}
            </text>
          </g>
        ))}
      </svg>

      {hoveredIdx !== null && points[hoveredIdx] && (
        <div className="mt-1 text-xs font-mono-num font-semibold text-neutral-950 text-right">
          {points[hoveredIdx].label}: ${points[hoveredIdx].sales.toFixed(2)} ({points[hoveredIdx].orders} orders)
        </div>
      )}
    </div>
  );
};

const OrdersBarChart: React.FC<{ data: Array<{ label: string; sales: number; orders: number }> }> = ({
  data,
}) => {
  if (data.length === 0) {
    return <p className="text-xs text-neutral-400 py-10 text-center">No order records yet.</p>;
  }
  const maxOrders = Math.max(1, ...data.map((d) => d.orders));
  return (
    <div className="flex items-end justify-between gap-2 h-44 pt-4">
      {data.map((d) => {
        const pct = Math.max(12, Math.round((d.orders / maxOrders) * 100));
        return (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
            <span className="font-mono-num text-[11px] font-semibold text-neutral-700">{d.orders}</span>
            <div
              className="w-full max-w-[34px] rounded-t-xl bg-neutral-950 transition-all"
              style={{ height: `${pct}%` }}
            />
            <span className="text-[11px] text-neutral-500">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
};
