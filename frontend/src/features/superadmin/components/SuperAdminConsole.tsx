'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Camera,
  Check,
  Crown,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  LogOut,
  Lock,
  Mail,
  Search,
  ShieldCheck,
  Shirt,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { api, type SuperUser } from '@/services/api';
import type { AnalyticsData, DeliveryAddress, Product, User, UserRole } from '@/types/store';
import { BrandLogo } from '@/components/BrandLogo';
import { SafeImage } from '@/components/SafeImage';
import { formatCurrency } from '@/utils/currency';

type SuperTab = 'overview' | 'users' | 'products';

interface Overview {
  totalCustomers: number;
  totalAdmins: number;
  totalSuperAdmins: number;
  totalUsers: number;
  pendingSellers: number;
  superAdminLimit: number;
  analytics: AnalyticsData;
}

const ROLE_LABEL: Record<UserRole, string> = {
  customer: 'Buyer',
  admin: 'Seller',
  super_admin: 'Super Admin',
};

const VERIFIED_BADGE = '/images/badges/verified-seller.svg';

/** Legacy sellers have no stored approval status and count as approved. */
function addressLine(address: DeliveryAddress | null | undefined): string {
  if (!address) return '';
  return [address.street, address.building, address.district, address.city, address.country]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(', ');
}

function sellerApproval(account: User): 'pending' | 'approved' | 'rejected' {
  if (account.approvalStatus === 'pending' || account.approvalStatus === 'rejected') return account.approvalStatus;
  return 'approved';
}

const ROLE_STYLE: Record<UserRole, string> = {
  customer: 'bg-neutral-100 text-neutral-700',
  admin: 'bg-sky-50 text-sky-700',
  super_admin: 'bg-neutral-950 text-white',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export const SuperAdminConsole: React.FC = () => {
  const { user, authReady, loginSuperAdmin, claimSuperAdminAccount, uploadAvatar, logoutUser, navigate, notify } =
    useStore();

  const [tab, setTab] = useState<SuperTab>('overview');
  const [status, setStatus] = useState<{ claimed: boolean; passcodeConfigured: boolean } | null>(null);

  // Auth form state
  const [claiming, setClaiming] = useState(false);
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authPasscode, setAuthPasscode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Data
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<SuperUser[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<
    'all' | 'buyer' | 'seller' | 'pending' | 'super' | 'disabled'
  >('all');
  const [expandedUserId, setExpandedUserId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');

  const isSuper = user?.role === 'super_admin';

  useEffect(() => {
    if (isSuper) return;
    api
      .superAdminStatus()
      .then(setStatus)
      .catch(() => setStatus({ claimed: false, passcodeConfigured: false }));
  }, [isSuper]);

  // A fresh deployment opens straight into the one-time owner setup.
  useEffect(() => {
    if (status && !status.claimed) setClaiming(true);
  }, [status]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview('');
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const loadData = useCallback(async () => {
    if (!isSuper) return;
    setLoading(true);
    try {
      const [ov, us, pr] = await Promise.all([
        api.getSuperOverview(),
        api.getSuperUsers(),
        api.getSuperProducts(),
      ]);
      setOverview(ov);
      setUsers(us.users);
      setProducts(pr.products);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load platform data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [isSuper, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    try {
      if (claiming) {
        if (authName.trim().length < 2) throw new Error('Enter the platform owner full name.');
        if (authPassword.length < 8) throw new Error('Use a password with at least 8 characters.');
        await claimSuperAdminAccount({
          name: authName.trim(),
          email: authEmail.trim(),
          password: authPassword,
          passcode: authPasscode.trim() || undefined,
        });
      } else {
        await loginSuperAdmin(authEmail.trim(), authPassword);
      }
      // The selected photo is uploaded after the session exists, so the portal
      // never needs a public upload endpoint.
      if (avatarFile) {
        try {
          await uploadAvatar(avatarFile);
          notify('Profile photo saved.', 'success');
        } catch (err) {
          notify(err instanceof Error ? err.message : 'Profile photo could not be saved.', 'error');
        }
      }
      setAvatarFile(null);
      setAuthPassword('');
      notify(claiming ? 'Super administrator account created.' : 'Signed in to the platform console.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Sign-in failed.', 'error');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleRoleChange = async (target: User, role: UserRole) => {
    if (target.role === role) return;
    setBusyId(target.id);
    try {
      const res = await api.updateUserRole(target.id, role);
      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, ...res.user } : u)));
      notify(`${res.user.name} is now ${ROLE_LABEL[res.user.role]}.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not change the role.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const handleApproveSeller = async (target: User) => {
    setBusyId(target.id);
    try {
      const res = await api.approveSeller(target.id);
      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, ...res.user } : u)));
      setOverview((prev) =>
        prev ? { ...prev, pendingSellers: Math.max(0, prev.pendingSellers - 1) } : prev,
      );
      notify(`${res.user.name} verified — the seller badge is now active.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not approve the seller.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const handleRejectSeller = async (target: User) => {
    setBusyId(target.id);
    try {
      const res = await api.rejectSeller(target.id);
      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, ...res.user } : u)));
      setOverview((prev) =>
        prev && sellerApproval(target) === 'pending'
          ? { ...prev, pendingSellers: Math.max(0, prev.pendingSellers - 1) }
          : prev,
      );
      notify(`${res.user.name}'s seller application was rejected.`, 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update the seller.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const handleToggleDisabled = async (target: User) => {
    setBusyId(target.id);
    try {
      const res = await api.toggleUserDisabled(target.id);
      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, ...res.user } : u)));
      notify(res.user.disabled ? `${res.user.name} disabled.` : `${res.user.name} reactivated.`, 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update the account.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const handleDeleteUser = async (target: User) => {
    if (!window.confirm(`Delete ${target.name}'s account permanently?`)) return;
    setBusyId(target.id);
    try {
      await api.deleteUser(target.id);
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      setOverview((prev) =>
        prev
          ? {
              ...prev,
              totalUsers: Math.max(0, prev.totalUsers - 1),
              totalCustomers:
                target.role === 'customer' ? Math.max(0, prev.totalCustomers - 1) : prev.totalCustomers,
              totalAdmins: target.role === 'admin' ? Math.max(0, prev.totalAdmins - 1) : prev.totalAdmins,
              totalSuperAdmins:
                target.role === 'super_admin'
                  ? Math.max(0, prev.totalSuperAdmins - 1)
                  : prev.totalSuperAdmins,
            }
          : prev,
      );
      notify('Account deleted.', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete the account.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const handleTogglePublished = async (product: Product) => {
    setBusyId(product.id);
    try {
      const res = await api.setProductPublished(product.id, !product.published);
      setProducts((prev) => prev.map((p) => (p.id === product.id ? res.product : p)));
      notify(res.product.published ? `${res.product.name} is live.` : `${res.product.name} hidden.`, 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update the product.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!window.confirm(`Remove ${product.name} from the platform?`)) return;
    setBusyId(product.id);
    try {
      const res = await api.deleteSuperProduct(product.id);
      notify(res.message || `${product.name} removed.`, 'info');
      await loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete the product.', 'error');
    } finally {
      setBusyId('');
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-950" />
      </div>
    );
  }

  // Auth gate
  if (!isSuper) {
    const showClaim = Boolean(claiming && status && !status.claimed);
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-5">
            <BrandLogo inverted subtitle="Platform Console" />
            <button
              type="button"
              onClick={() => navigate({ page: 'home' })}
              className="text-xs font-semibold text-neutral-400 hover:text-white inline-flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Store</span>
            </button>
          </div>

          <div className="bg-white rounded-3xl p-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
              <Crown className="w-3.5 h-3.5" />
              <span>Super Administrator</span>
            </div>

            {user ? (
              <div className="mt-4 space-y-4">
                <h1 className="font-display text-xl font-bold text-neutral-950">Platform access required</h1>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  You are signed in as <strong>{user.name || user.email}</strong> (
                  {ROLE_LABEL[user.role]}). This portal is reserved for the platform owner account.
                </p>
                <button
                  type="button"
                  onClick={logoutUser}
                  className="w-full py-3 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
                >
                  Sign out and continue
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ page: 'admin' })}
                  className="w-full py-2.5 rounded-full text-xs font-semibold text-neutral-600 hover:text-neutral-950 cursor-pointer"
                >
                  Go to the seller admin panel
                </button>
              </div>
            ) : (
              <>
                <h1 className="mt-3 font-display text-xl font-bold text-neutral-950">
                  {showClaim ? 'Create the platform owner' : 'Super admin sign in'}
                </h1>
                <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
                  {showClaim
                    ? 'This one-time setup creates the account that governs every buyer, seller and product on the platform.'
                    : 'Control every user account and product from one secure console.'}
                </p>

                {showClaim && (
                  <div className="mt-5 flex items-center gap-3">
                    <div className="relative w-16 h-16 rounded-2xl bg-neutral-100 overflow-hidden shrink-0 flex items-center justify-center">
                      {avatarPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarPreview} alt="Selected profile photo" className="w-full h-full object-cover" />
                      ) : (
                        <UserRound className="w-6 h-6 text-neutral-400" />
                      )}
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-neutral-200 text-xs font-semibold text-neutral-800 hover:border-neutral-950 cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        {avatarFile ? 'Change photo' : 'Add profile photo'}
                      </button>
                      <p className="mt-1 text-[11px] text-neutral-500">Optional, JPEG or PNG up to 5MB.</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          e.target.value = '';
                          if (file && file.size > 5 * 1024 * 1024) {
                            notify('Profile photo must be 5MB or smaller.', 'error');
                            return;
                          }
                          setAvatarFile(file);
                        }}
                      />
                    </div>
                  </div>
                )}

                <form onSubmit={handleAuth} className="mt-5 space-y-4">
                  {showClaim && (
                    <div>
                      <label htmlFor="super-name" className="block text-xs font-semibold text-neutral-800 mb-1">
                        Full Name
                      </label>
                      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3.5 py-2.5 focus-within:border-neutral-950">
                        <UserRound className="w-4 h-4 text-neutral-400 shrink-0" />
                        <input
                          id="super-name"
                          type="text"
                          required
                          autoComplete="name"
                          value={authName}
                          onChange={(e) => setAuthName(e.target.value)}
                          placeholder="Platform Owner"
                          className="w-full bg-transparent text-sm focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="super-email" className="block text-xs font-semibold text-neutral-800 mb-1">
                      Email
                    </label>
                    <div className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3.5 py-2.5 focus-within:border-neutral-950">
                      <Mail className="w-4 h-4 text-neutral-400 shrink-0" />
                      <input
                        id="super-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="owner@yourdomain.com"
                        className="w-full bg-transparent text-sm focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="super-password" className="block text-xs font-semibold text-neutral-800 mb-1">
                      Password {showClaim ? '(8+ characters)' : ''}
                    </label>
                    <div className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3.5 py-2.5 focus-within:border-neutral-950">
                      <Lock className="w-4 h-4 text-neutral-400 shrink-0" />
                      <input
                        id="super-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={showClaim ? 8 : 6}
                        autoComplete={showClaim ? 'new-password' : 'current-password'}
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder={showClaim ? 'Minimum 8 characters' : 'Your password'}
                        className="w-full bg-transparent text-sm focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="text-neutral-400 hover:text-neutral-950 shrink-0 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {showClaim && status?.passcodeConfigured && (
                    <div>
                      <label htmlFor="super-passcode" className="block text-xs font-semibold text-neutral-800 mb-1">
                        Platform Setup Passcode
                      </label>
                      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3.5 py-2.5 focus-within:border-neutral-950">
                        <ShieldCheck className="w-4 h-4 text-neutral-400 shrink-0" />
                        <input
                          id="super-passcode"
                          type="password"
                          required
                          value={authPasscode}
                          onChange={(e) => setAuthPasscode(e.target.value)}
                          placeholder="Server ADMIN_PASSCODE"
                          className="w-full bg-transparent text-sm focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="w-full py-3 rounded-full bg-neutral-950 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-neutral-800 cursor-pointer disabled:opacity-50"
                  >
                    {authSubmitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowRight className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {authSubmitting
                        ? showClaim
                          ? 'Creating owner...'
                          : 'Signing in...'
                        : showClaim
                          ? 'Create owner account'
                          : 'Enter platform console'}
                    </span>
                  </button>
                </form>

                {showClaim && (
                  <button
                    type="button"
                    onClick={() => setClaiming(false)}
                    className="mt-3 w-full text-[11px] font-medium text-neutral-500 hover:text-neutral-950 cursor-pointer"
                  >
                    Already have the owner account? Sign in instead
                  </button>
                )}
                {!showClaim && status && status.claimed && (
                  <p className="mt-3 text-[11px] text-neutral-500">
                    First deployment? The owner account is created once at this URL, then signs in here.
                  </p>
                )}
              </>
            )}
          </div>
          <p className="mt-4 text-center text-[11px] text-neutral-500">
            Platform console · /admin/super
          </p>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    if (userFilter === 'buyer' && u.role !== 'customer') return false;
    if (userFilter === 'seller' && u.role !== 'admin') return false;
    if (userFilter === 'pending' && !(u.role === 'admin' && sellerApproval(u) === 'pending')) return false;
    if (userFilter === 'super' && u.role !== 'super_admin') return false;
    if (userFilter === 'disabled' && !u.disabled) return false;
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q) ||
      ROLE_LABEL[u.role].toLowerCase().includes(q)
    );
  });

  const userFilterCounts: Record<typeof userFilter, number> = {
    all: users.length,
    buyer: users.filter((u) => u.role === 'customer').length,
    seller: users.filter((u) => u.role === 'admin').length,
    pending: users.filter((u) => u.role === 'admin' && sellerApproval(u) === 'pending').length,
    super: users.filter((u) => u.role === 'super_admin').length,
    disabled: users.filter((u) => u.disabled).length,
  };

  const superAdminCount = overview?.totalSuperAdmins ?? users.filter((u) => u.role === 'super_admin').length;
  const superAdminLimit = overview?.superAdminLimit ?? 4;
  const superAdminLimitReached = superAdminCount >= superAdminLimit;

  const filteredProducts = products.filter((p) => {
    if (!productSearch.trim()) return true;
    const q = productSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.categoryName.toLowerCase().includes(q);
  });

  const navItems: Array<{ id: SuperTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'users', label: 'All Users', icon: Users },
    { id: 'products', label: 'All Products', icon: Shirt },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      <aside className="hidden lg:flex w-64 bg-neutral-950 text-white flex-col justify-between p-5 shrink-0 sticky top-0 h-screen">
        <div>
          <div className="pb-6 border-b border-neutral-800">
            <BrandLogo inverted subtitle="Platform Console" />
          </div>

          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-neutral-900/80 p-3">
            <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold">
              {user.avatarUrl ? (
                <SafeImage src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                initials(user.name)
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{user.name}</p>
              <p className="text-[10px] text-neutral-400 truncate">{user.email}</p>
            </div>
          </div>

          <nav aria-label="Super admin navigation" className="mt-5 space-y-1">
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
            onClick={() => navigate({ page: 'admin' })}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-900 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Seller Console</span>
          </button>
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

      <div className="flex-1 min-w-0 pb-24 lg:pb-10">
        <header className="glass-surface border-b border-neutral-200/80 px-4 sm:px-8 py-3.5 sticky top-0 z-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="lg:hidden">
              <BrandLogo subtitle="Platform" />
            </div>
            <div className="hidden lg:block">
              <h1 className="font-display text-xl font-bold text-neutral-950">
                {navItems.find((n) => n.id === tab)?.label}
              </h1>
              <p className="text-[11px] text-neutral-500">Super administrator control centre</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-950 text-white text-[11px] font-semibold">
              <Crown className="w-3.5 h-3.5" />
              Super Admin
            </span>
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="px-3.5 py-2 rounded-full border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 hover:border-neutral-950 cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 space-y-6">
          {/* Mobile tabs */}
          <div className="lg:hidden flex items-center gap-1 bg-white border border-neutral-200 p-1 rounded-xl">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex-1 py-2 rounded-lg text-[11px] font-semibold cursor-pointer ${
                  tab === item.id ? 'bg-neutral-950 text-white' : 'text-neutral-600'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <>
              <div className="relative rounded-3xl overflow-hidden bg-neutral-950 text-white p-6 sm:p-7">
                <div className="relative z-10 max-w-lg">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                    Platform overview
                  </p>
                  <h2 className="mt-1.5 font-display text-2xl sm:text-3xl font-bold leading-tight">
                    Welcome back, {user.name.split(' ')[0]}
                  </h2>
                  <p className="mt-1.5 text-xs sm:text-sm text-neutral-300">
                    Every buyer, seller and product on E-shop All is under your control from this console.
                  </p>
                </div>
              </div>

              {(overview?.pendingSellers ?? 0) > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-amber-900">
                    {overview?.pendingSellers} seller {overview?.pendingSellers === 1 ? 'application is' : 'applications are'} waiting for approval.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('users');
                      setUserFilter('pending');
                    }}
                    className="px-3.5 py-1.5 rounded-full bg-neutral-950 text-white text-[11px] font-semibold cursor-pointer"
                  >
                    Review applications
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Users', value: overview?.totalUsers ?? users.length, note: 'All account roles' },
                  { label: 'Buyers', value: overview?.totalCustomers ?? 0, note: 'Customer accounts' },
                  { label: 'Sellers', value: overview?.totalAdmins ?? 0, note: 'Store operators' },
                  {
                    label: 'Super Admins',
                    value: `${superAdminCount} / ${superAdminLimit}`,
                    note: superAdminLimitReached ? 'Limit reached' : 'Owner seats',
                  },
                ].map((card) => (
                  <div key={card.label} className="bg-white border border-neutral-200/80 rounded-2xl p-4 sm:p-5">
                    <p className="text-xs font-medium text-neutral-500">{card.label}</p>
                    <p className="mt-2 font-display text-2xl font-bold text-neutral-950 tabular-nums">{card.value}</p>
                    <p className="mt-1 text-[11px] text-neutral-500">{card.note}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-neutral-200/80 rounded-2xl p-5">
                  <p className="text-xs font-medium text-neutral-500">Products</p>
                  <p className="mt-2 font-display text-2xl font-bold text-neutral-950 tabular-nums">
                    {overview?.analytics.totalProducts ?? products.length}
                  </p>
                </div>
                <div className="bg-white border border-neutral-200/80 rounded-2xl p-5">
                  <p className="text-xs font-medium text-neutral-500">Orders</p>
                  <p className="mt-2 font-display text-2xl font-bold text-neutral-950 tabular-nums">
                    {overview?.analytics.totalOrders ?? 0}
                  </p>
                </div>
                <div className="bg-white border border-neutral-200/80 rounded-2xl p-5">
                  <p className="text-xs font-medium text-neutral-500">Sales (USD)</p>
                  <p className="mt-2 font-display text-2xl font-bold text-neutral-950 tabular-nums">
                    {formatCurrency(overview?.analytics.totalSales ?? 0, 'USD')}
                  </p>
                </div>
                <div className="bg-white border border-neutral-200/80 rounded-2xl p-5">
                  <p className="text-xs font-medium text-neutral-500">Out of stock</p>
                  <p className="mt-2 font-display text-2xl font-bold text-neutral-950 tabular-nums">
                    {overview?.analytics.outOfStockCount ?? 0}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTab('users')}
                  className="bg-white border border-neutral-200/80 hover:border-neutral-950 rounded-2xl p-5 text-left transition-colors cursor-pointer"
                >
                  <Users className="w-5 h-5 text-neutral-950" />
                  <p className="mt-2 text-sm font-bold text-neutral-950">Manage users</p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    Promote sellers, disable abusive accounts, delete users.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('products')}
                  className="bg-white border border-neutral-200/80 hover:border-neutral-950 rounded-2xl p-5 text-left transition-colors cursor-pointer"
                >
                  <Shirt className="w-5 h-5 text-neutral-950" />
                  <p className="mt-2 text-sm font-bold text-neutral-950">Manage products</p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    Hide, restore or remove any listing across the platform.
                  </p>
                </button>
              </div>
            </>
          )}

          {tab === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-bold text-neutral-950">
                    All Users ({filteredUsers.length})
                  </h2>
                  <p className="text-[11px] text-neutral-500">
                    Approve sellers, change roles, disable or delete any account.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'buyer', label: 'Buyers' },
                        { id: 'seller', label: 'Sellers' },
                        { id: 'pending', label: 'Pending' },
                        { id: 'super', label: 'Super admins' },
                        { id: 'disabled', label: 'Disabled' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setUserFilter(f.id)}
                        className={`px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${
                          userFilter === f.id
                            ? 'bg-neutral-950 text-white'
                            : 'bg-white border border-neutral-200 text-neutral-700'
                        }`}
                      >
                        {f.label} ({userFilterCounts[f.id]})
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-full px-3.5 py-2 w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 text-neutral-400" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search name, email, phone or role…"
                    aria-label="Search users"
                    className="w-full text-xs bg-transparent focus:outline-none"
                  />
                </div>
              </div>

              {loading && users.length === 0 ? (
                <div className="h-40 bg-white rounded-2xl border border-neutral-200 animate-pulse" />
              ) : filteredUsers.length === 0 ? (
                <p className="bg-white border border-neutral-200 rounded-2xl p-6 text-xs text-neutral-500">
                  No users match this search.
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredUsers.map((u) => {
                    const isSelf = u.id === user.id;
                    const busy = busyId === u.id;
                    return (
                      <div
                        key={u.id}
                        className="bg-white border border-neutral-200/80 rounded-2xl p-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-11 h-11 rounded-full bg-neutral-100 overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold text-neutral-700">
                            {u.avatarUrl ? (
                              <SafeImage src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                            ) : (
                              initials(u.name)
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-neutral-950 truncate">{u.name}</p>
                              {u.role === 'admin' && sellerApproval(u) === 'approved' && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={VERIFIED_BADGE} alt="Verified seller" className="w-5 h-5 shrink-0" />
                              )}
                              {isSelf && (
                                <span className="text-[10px] font-semibold text-neutral-500">(you)</span>
                              )}
                              {u.disabled && (
                                <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-semibold">
                                  Disabled
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-neutral-500 truncate">
                              {u.email || u.phone || 'No contact'} · Joined {formatDate(u.createdAt)}
                            </p>
                            <p className="text-[11px] font-medium text-neutral-600 truncate">
                              {u.role === 'admin'
                                ? `${u.productCount ?? 0} listing${u.productCount === 1 ? '' : 's'}`
                                : `${u.orderCount ?? 0} order${u.orderCount === 1 ? '' : 's'} · $${(u.totalSpent ?? 0).toFixed(2)} spent`}
                            </p>
                            <span
                              className={`mt-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${ROLE_STYLE[u.role]}`}
                            >
                              {ROLE_LABEL[u.role]}
                            </span>
                            {u.role === 'admin' && (
                              <span
                                className={`ml-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  sellerApproval(u) === 'approved'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : sellerApproval(u) === 'pending'
                                      ? 'bg-amber-50 text-amber-800'
                                      : 'bg-red-50 text-red-600'
                                }`}
                              >
                                {sellerApproval(u) === 'approved'
                                  ? 'Approved'
                                  : sellerApproval(u) === 'pending'
                                    ? 'Pending approval'
                                    : 'Rejected'}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setExpandedUserId(expandedUserId === u.id ? '' : u.id)}
                            className="px-3 py-2 rounded-full border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:border-neutral-950 cursor-pointer"
                          >
                            {expandedUserId === u.id ? 'Hide details' : 'Details'}
                          </button>
                          {u.role === 'admin' && sellerApproval(u) === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApproveSeller(u)}
                                disabled={busy}
                                className="px-3 py-2 rounded-full bg-neutral-950 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-40"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectSeller(u)}
                                disabled={busy}
                                className="px-3 py-2 rounded-full border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:border-red-300 hover:text-red-600 cursor-pointer disabled:opacity-40"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {u.role === 'admin' && sellerApproval(u) === 'rejected' && (
                            <button
                              type="button"
                              onClick={() => handleApproveSeller(u)}
                              disabled={busy}
                              className="px-3 py-2 rounded-full border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:border-neutral-950 cursor-pointer disabled:opacity-40"
                            >
                              Approve anyway
                            </button>
                          )}
                          <select
                            aria-label={`Role for ${u.name}`}
                            value={u.role}
                            disabled={busy || isSelf}
                            onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                            className="text-[11px] font-semibold rounded-full border border-neutral-200 bg-white px-3 py-2 focus:outline-none focus:border-neutral-950 disabled:opacity-50 cursor-pointer"
                          >
                            <option value="customer">Buyer</option>
                            <option value="admin">Seller</option>
                            <option value="super_admin" disabled={superAdminLimitReached && u.role !== 'super_admin'}>
                              Super Admin{superAdminLimitReached ? ` (max ${superAdminLimit})` : ''}
                            </option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleToggleDisabled(u)}
                            disabled={busy || isSelf}
                            className="px-3 py-2 rounded-full border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:border-neutral-950 cursor-pointer disabled:opacity-40 inline-flex items-center gap-1"
                          >
                            {u.disabled ? <Check className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                            {u.disabled ? 'Enable' : 'Disable'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            disabled={busy || isSelf}
                            aria-label={`Delete ${u.name}`}
                            className="p-2 rounded-full border border-neutral-200 text-neutral-500 hover:border-red-300 hover:text-red-600 cursor-pointer disabled:opacity-40"
                          >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        </div>
                        {expandedUserId === u.id && (
                          <div className="mt-3 pt-3 border-t border-neutral-100 grid sm:grid-cols-2 gap-2 text-[11px] text-neutral-600">
                            <p className="truncate">
                              <span className="font-semibold text-neutral-900">Email:</span> {u.email || '—'}
                            </p>
                            <p className="truncate">
                              <span className="font-semibold text-neutral-900">Telephone:</span> {u.phone || '—'}
                            </p>
                            <p className="sm:col-span-2">
                              <span className="font-semibold text-neutral-900">Location:</span>{' '}
                              {addressLine(u.deliveryAddress) || 'No location saved'}
                            </p>
                            <p>
                              <span className="font-semibold text-neutral-900">Activity:</span>{' '}
                              {u.role === 'admin'
                                ? `${u.productCount ?? 0} listing${u.productCount === 1 ? '' : 's'}`
                                : `${u.orderCount ?? 0} order${u.orderCount === 1 ? '' : 's'} · $${(u.totalSpent ?? 0).toFixed(2)} spent`}
                            </p>
                            <p>
                              <span className="font-semibold text-neutral-900">Account:</span>{' '}
                              {u.disabled ? 'Disabled' : 'Active'}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'products' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-bold text-neutral-950">
                    All Products ({filteredProducts.length})
                  </h2>
                  <p className="text-[11px] text-neutral-500">
                    Every listing on the platform, including hidden drafts.
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-full px-3.5 py-2 w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 text-neutral-400" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search products…"
                    aria-label="Search products"
                    className="w-full text-xs bg-transparent focus:outline-none"
                  />
                </div>
              </div>

              {loading && products.length === 0 ? (
                <div className="h-40 bg-white rounded-2xl border border-neutral-200 animate-pulse" />
              ) : filteredProducts.length === 0 ? (
                <p className="bg-white border border-neutral-200 rounded-2xl p-6 text-xs text-neutral-500">
                  No products match this search.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredProducts.map((p) => {
                    const busy = busyId === p.id;
                    const price = p.discountPrice && p.discountPrice > 0 ? p.discountPrice : p.price;
                    return (
                      <div key={p.id} className="bg-white border border-neutral-200/80 rounded-2xl p-4 flex gap-4">
                        <div className="w-20 h-20 rounded-xl bg-neutral-100 overflow-hidden shrink-0">
                          <SafeImage src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="font-display text-sm font-bold text-neutral-950 truncate">{p.name}</h3>
                              <p className="text-[11px] text-neutral-500 truncate">{p.categoryName}</p>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                                p.published ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-600'
                              }`}
                            >
                              {p.published ? 'Live' : 'Hidden'}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs font-semibold text-neutral-950">
                            {formatCurrency(price, p.currency)}
                            <span className="ml-2 font-normal text-neutral-500">{p.stock} in stock</span>
                          </p>
                          <div className="mt-2.5 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleTogglePublished(p)}
                              disabled={busy}
                              className="px-3 py-1.5 rounded-full border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:border-neutral-950 cursor-pointer disabled:opacity-40 inline-flex items-center gap-1"
                            >
                              {busy ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : p.published ? (
                                <Ban className="w-3 h-3" />
                              ) : (
                                <Check className="w-3 h-3" />
                              )}
                              {p.published ? 'Hide' : 'Publish'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(p)}
                              disabled={busy}
                              className="px-3 py-1.5 rounded-full border border-neutral-200 text-[11px] font-semibold text-neutral-500 hover:border-red-300 hover:text-red-600 cursor-pointer disabled:opacity-40 inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
