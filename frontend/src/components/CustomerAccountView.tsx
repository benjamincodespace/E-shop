'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Heart, LogOut, Package, Star, Trash2, User as UserIcon } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { api } from '@/services/api';
import type { Order, Review } from '@/types/store';
import { COUNTRIES, detectCountryCode, findCountry, flagEmoji, isValidPhoneDigits, toE164 } from '@/lib/countries';
import { ProductCard } from './ProductCard';
import { SafeImage } from './SafeImage';

export const FavoritesView: React.FC = () => {
  const { products, wishlistIds, navigate } = useStore();
  const favProducts = products.filter((p) => wishlistIds.includes(p.id));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-neutral-950">Favorites</h1>
          <p className="text-xs text-neutral-500 mt-0.5 tabular-nums">{favProducts.length} saved items</p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ page: 'catalog' })}
          className="text-xs font-semibold text-neutral-700 hover:text-neutral-950 cursor-pointer"
        >
          Explore Catalog →
        </button>
      </div>

      {favProducts.length === 0 ? (
        <div className="bg-neutral-50 border border-neutral-200/80 rounded-2xl p-12 text-center">
          <Heart className="w-10 h-10 text-neutral-400 mx-auto" />
          <h2 className="mt-3 font-display text-lg font-bold text-neutral-950">No favorites yet</h2>
          <p className="mt-1 text-xs text-neutral-500">Tap the heart icon on any T-shirt to save it here.</p>
          <button
            type="button"
            onClick={() => navigate({ page: 'catalog' })}
            className="mt-5 px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
          >
            Browse T-Shirts
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {favProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
};

export const AuthView: React.FC = () => {
  const { user, loginUser, registerUser, navigate, notify } = useStore();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState('US');
  const [address, setAddress] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [previewResetCode, setPreviewResetCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // While a sign-in/sign-up request is in flight, the submit handler owns the
  // redirect; the effect below only covers users who land here already signed in.
  const submitOwnsRedirect = useRef(false);

  useEffect(() => {
    if (user && !submitOwnsRedirect.current) {
      navigate({ page: user.role === 'admin' ? 'admin' : 'profile' });
    }
  }, [user, navigate]);

  // Detect the visitor's country after mount so server and client markup match.
  useEffect(() => {
    setPhoneCountry(detectCountryCode());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    submitOwnsRedirect.current = true;
    try {
      if (mode === 'login') {
        const loggedIn = await loginUser(email, password, 'customer');
        notify(`Welcome back, ${loggedIn.name}!`, 'success');
        navigate({ page: loggedIn.role === 'admin' ? 'admin' : 'home' });
      } else if (mode === 'register') {
        if (!isValidPhoneDigits(phone)) {
          notify('Enter a valid phone number for the selected country.', 'error');
          return;
        }
        const created = await registerUser({
          name,
          phone: toE164(findCountry(phoneCountry).dial, phone),
          password,
          address,
        });
        notify(`Welcome to TeeStore, ${created.name}!`, 'success');
        navigate({ page: 'home' });
      } else if (mode === 'forgot') {
        if (resetStep === 'request') {
          const res = await api.forgotPassword(email);
          notify(res.message, 'info');
          if (res.previewResetCode) {
            setPreviewResetCode(res.previewResetCode);
          }
          setResetStep('confirm');
        } else {
          const res = await api.resetPassword({ email, code: resetCode, newPassword });
          notify(res.message, 'success');
          setMode('login');
          setResetStep('request');
          setPreviewResetCode(null);
        }
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Authentication failed.', 'error');
    } finally {
      setLoading(false);
      submitOwnsRedirect.current = false;
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-10 sm:py-14">
      <div className="bg-white border border-neutral-200/80 rounded-3xl p-6 sm:p-8 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-xl mb-6">
          {(
            [
              { id: 'login', label: 'Sign In' },
              { id: 'register', label: 'Create Account' },
              { id: 'forgot', label: 'Reset' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setMode(t.id);
                setResetStep('request');
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                mode === t.id ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <h1 className="font-display text-xl font-bold text-neutral-950">
          {mode === 'login'
            ? 'Welcome back to TeeStore'
            : mode === 'register'
              ? 'Create your TeeStore account'
              : 'Recover your password'}
        </h1>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          {mode === 'register' && (
            <div>
              <label htmlFor="auth-name" className="block text-xs font-semibold text-neutral-800 mb-1">
                Full Name
              </label>
              <input
                id="auth-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Morgan"
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
              />
            </div>
          )}

          {mode !== 'register' && (
            <div>
              <label htmlFor="auth-email" className="block text-xs font-semibold text-neutral-800 mb-1">
                Email or Phone Number
              </label>
              <input
                id="auth-email"
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com or +1 555 010 0100"
                autoComplete="username"
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
              />
            </div>
          )}

          {mode !== 'forgot' && (
            <div>
              <label htmlFor="auth-password" className="block text-xs font-semibold text-neutral-800 mb-1">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
              />
            </div>
          )}

          {mode === 'register' && (
            <>
              <div>
                <label htmlFor="auth-phone" className="block text-xs font-semibold text-neutral-800 mb-1">
                  Phone Number
                </label>
                <div className="flex gap-2">
                  <select
                    aria-label="Country calling code"
                    value={phoneCountry}
                    onChange={(e) => setPhoneCountry(e.target.value)}
                    className="w-[10.5rem] shrink-0 rounded-xl border border-neutral-200 bg-white px-2.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950 cursor-pointer"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        +{c.dial} {flagEmoji(c.code)} {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    id="auth-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="555 010 0100"
                    autoComplete="tel-national"
                    className="flex-1 min-w-0 rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-500">
                  Your number +{findCountry(phoneCountry).dial} will be your sign-in ID.
                </p>
              </div>
              <div>
                <label htmlFor="auth-address" className="block text-xs font-semibold text-neutral-800 mb-1">
                  Default Delivery Address (Optional)
                </label>
                <input
                  id="auth-address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, City, Postal Code"
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
                />
              </div>
            </>
          )}

          {mode === 'forgot' && resetStep === 'confirm' && (
            <>
              {previewResetCode && (
                <div className="p-3 rounded-xl bg-neutral-100 border border-neutral-200 text-xs text-neutral-800">
                  Verification code: <strong className="font-mono-num">{previewResetCode}</strong>
                </div>
              )}
              <div>
                <label htmlFor="reset-code" className="block text-xs font-semibold text-neutral-800 mb-1">
                  6-Digit Verification Code
                </label>
                <input
                  id="reset-code"
                  type="text"
                  required
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder="123456"
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm font-mono-num focus:outline-none focus:border-neutral-950"
                />
              </div>
              <div>
                <label htmlFor="reset-pw" className="block text-xs font-semibold text-neutral-800 mb-1">
                  New Password
                </label>
                <input
                  id="reset-pw"
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-5 rounded-full bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading
              ? 'Please wait...'
              : mode === 'login'
                ? 'Sign In'
                : mode === 'register'
                  ? 'Create Account'
                  : resetStep === 'request'
                    ? 'Send Reset Code'
                    : 'Update Password'}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-neutral-100 text-center">
          <button
            type="button"
            onClick={() => navigate({ page: 'admin' })}
            className="text-xs font-medium text-neutral-500 hover:text-neutral-950 cursor-pointer"
          >
            Store Administrator? Open Admin Panel →
          </button>
        </div>
      </div>
    </div>
  );
};

export const CustomerAccountView: React.FC<{ initialTab?: 'profile' | 'orders' | 'reviews' }> = ({
  initialTab = 'profile',
}) => {
  const { user, logoutUser, navigate, notify, refreshAuth, refreshCatalog } = useStore();
  const [tab, setTab] = useState<'profile' | 'orders' | 'reviews'>(initialTab);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [saving, setSaving] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setPhone(user.phone);
    setAddress(user.address);

    setLoadingData(true);
    Promise.all([api.getMyOrders(), api.getMyReviews()])
      .then(([ordRes, revRes]) => {
        setOrders(ordRes.orders);
        setMyReviews(revRes.reviews);
      })
      .catch((err) => {
        notify(err instanceof Error ? err.message : 'Could not load your account history.', 'error');
      })
      .finally(() => setLoadingData(false));
  }, [user, notify]);

  if (!user) {
    return <AuthView />;
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateProfile({ name, phone, address });
      await refreshAuth();
      notify('Profile saved', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    try {
      await api.deleteReview(reviewId);
      setMyReviews((prev) => prev.filter((r) => r.id !== reviewId));
      notify('Review deleted', 'info');
      refreshCatalog();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to delete review.', 'error');
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-neutral-950 text-white font-display text-lg font-bold flex items-center justify-center">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-neutral-950">{user.name}</h1>
            <p className="text-xs text-neutral-500">{user.email || user.phone}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user.role === 'admin' && (
            <button
              type="button"
              onClick={() => navigate({ page: 'admin' })}
              className="px-4 py-2 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
            >
              Open Admin Panel
            </button>
          )}
          <button
            type="button"
            onClick={logoutUser}
            className="px-4 py-2 rounded-full border border-neutral-200 text-xs font-semibold text-neutral-700 hover:border-neutral-950 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-neutral-100 p-1 rounded-xl w-fit mb-6">
        <button
          type="button"
          onClick={() => setTab('profile')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
            tab === 'profile' ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-600'
          }`}
        >
          <UserIcon className="w-3.5 h-3.5" />
          <span>Profile</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('orders')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
            tab === 'orders' ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-600'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Order History ({orders.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('reviews')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
            tab === 'reviews' ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-600'
          }`}
        >
          <Star className="w-3.5 h-3.5" />
          <span>My Reviews ({myReviews.length})</span>
        </button>
      </div>

      {tab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="max-w-xl bg-white border border-neutral-200/80 rounded-2xl p-6 space-y-4"
        >
          <h2 className="font-display text-base font-bold text-neutral-950">Profile Details</h2>
          <div>
            <label htmlFor="prof-name" className="block text-xs font-semibold text-neutral-800 mb-1">
              Full Name
            </label>
            <input
              id="prof-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
            />
          </div>
          <div>
            <label htmlFor="prof-phone" className="block text-xs font-semibold text-neutral-800 mb-1">
              Phone Number
            </label>
            <input
              id="prof-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
            />
          </div>
          <div>
            <label htmlFor="prof-addr" className="block text-xs font-semibold text-neutral-800 mb-1">
              Default Delivery Address
            </label>
            <textarea
              id="prof-addr"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-neutral-950"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      )}

      {tab === 'orders' && (
        <div className="space-y-4">
          {loadingData ? (
            <div className="h-32 bg-neutral-100 rounded-2xl animate-pulse" />
          ) : orders.length === 0 ? (
            <div className="bg-neutral-50 border border-neutral-200/80 rounded-2xl p-10 text-center">
              <p className="font-display text-base font-bold text-neutral-950">No orders yet</p>
              <p className="mt-1 text-xs text-neutral-500">Your placed orders will appear here with live status updates.</p>
              <button
                type="button"
                onClick={() => navigate({ page: 'catalog' })}
                className="mt-4 px-5 py-2 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
              >
                Shop T-Shirts
              </button>
            </div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="bg-white border border-neutral-200/80 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-100">
                  <div>
                    <span className="font-mono-num text-sm font-bold text-neutral-950">
                      {order.orderNumber}
                    </span>
                    <span className="mx-2 text-neutral-300">·</span>
                    <span className="text-xs text-neutral-500">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-full bg-neutral-100 text-neutral-900 text-xs font-semibold">
                      {order.status}
                    </span>
                    <span className="font-mono-num text-sm font-bold text-neutral-950">
                      ${order.total.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {order.items.map((item, idx) => (
                    <div key={item.id || `${item.productId}-${idx}`} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-neutral-100 overflow-hidden shrink-0">
                          <SafeImage src={item.productImage} alt={item.productName} className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => navigate({ page: 'product', slug: item.productSlug })}
                            className="text-xs font-semibold text-neutral-950 hover:underline truncate block cursor-pointer"
                          >
                            {item.productName}
                          </button>
                          <p className="text-[11px] text-neutral-500">
                            Size {item.size} · {item.color} · Qty {item.quantity}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono-num text-xs font-semibold text-neutral-900">
                        ${(item.unitPrice * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'reviews' && (
        <div className="space-y-3">
          {myReviews.length === 0 ? (
            <div className="bg-neutral-50 border border-neutral-200/80 rounded-2xl p-10 text-center">
              <p className="font-display text-base font-bold text-neutral-950">No reviews written yet</p>
              <p className="mt-1 text-xs text-neutral-500">
                After purchasing a T-shirt, you can leave a verified 1–5 star review on its product page.
              </p>
            </div>
          ) : (
            myReviews.map((rev) => (
              <div key={rev.id} className="bg-white border border-neutral-200/80 rounded-2xl p-5 flex items-start justify-between gap-4">
                <div>
                  <button
                    type="button"
                    onClick={() => rev.productSlug && navigate({ page: 'product', slug: rev.productSlug })}
                    className="font-display text-sm font-bold text-neutral-950 hover:underline cursor-pointer"
                  >
                    {rev.productName}
                  </button>
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
                  <p className="mt-2 text-sm text-neutral-700">{rev.comment}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteReview(rev.id)}
                  aria-label="Delete my review"
                  className="p-2 rounded-full text-neutral-400 hover:text-neutral-950 hover:bg-neutral-100 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
