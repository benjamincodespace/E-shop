'use client';

import React, { useState } from 'react';
import { ArrowRight, Camera, Clock, Eye, EyeOff, Lock, Mail, ShoppingBag, Store, UserRound } from 'lucide-react';
import { isValidPhoneNumber } from 'libphonenumber-js/min';
import { useStore } from '@/context/StoreContext';
import type { Gender } from '@/types/store';
import { PhoneInput } from './PhoneInput';
import { GenderSelect } from './GenderSelect';
import { useDetectedCountry } from '../hooks/useDetectedCountry';

type Mode = 'signup' | 'signin' | 'seller';

const VERIFIED_BADGE = '/images/badges/verified-seller.svg';

export const SignUpView: React.FC = () => {
  const { user, registerUser, registerSeller, uploadAvatar, loginShopper, navigate } = useStore();
  const detected = useDetectedCountry();

  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const avatarInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview('');
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode !== 'signin' && name.trim().length < 2) {
      setError(mode === 'seller' ? 'Enter your store name with at least 2 characters.' : 'Enter a user name with at least 2 characters.');
      return;
    }
    if (mode === 'seller') {
      if (!email.trim().includes('@')) {
        setError('Enter a valid business email address.');
        return;
      }
      if (phone && !isValidPhoneNumber(phone)) {
        setError('Enter a valid phone number for the selected country.');
        return;
      }
      if (password.length < 8) {
        setError('Seller passwords need at least 8 characters.');
        return;
      }
    } else {
      if (!phone || !isValidPhoneNumber(phone)) {
        setError('Enter a valid phone number for the selected country.');
        return;
      }
      if (password.length < 6) {
        setError('Your password needs at least 6 characters.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await registerUser(phone, password, gender || undefined, name.trim());
      } else if (mode === 'seller') {
        await registerSeller({
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phone || undefined,
        });
      } else {
        await loginShopper(phone, password);
      }
      if (mode !== 'signin' && avatarFile) {
        // The account now exists; attach the chosen profile photo to it.
        try {
          await uploadAvatar(avatarFile);
        } catch {
          setError('Account created, but the profile photo could not be uploaded. You can add it later.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (user) {
    const isSellerAccount = user.role === 'admin' || user.role === 'super_admin';
    const pending = user.role === 'admin' && user.approvalStatus === 'pending';
    const rejected = user.role === 'admin' && user.approvalStatus === 'rejected';
    const verified = Boolean(user.verified) || user.role === 'super_admin';

    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white border border-neutral-200/80 rounded-3xl p-7 text-center shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
          <div className="relative w-12 h-12 mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-neutral-950 text-white flex items-center justify-center overflow-hidden">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : isSellerAccount ? (
                <Store className="w-5 h-5" />
              ) : (
                <ShoppingBag className="w-5 h-5" />
              )}
            </div>
            {verified && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={VERIFIED_BADGE}
                alt="Verified seller"
                className="absolute -bottom-1.5 -right-1.5 w-5 h-5 drop-shadow"
              />
            )}
          </div>
          <h1 className="mt-4 font-display text-xl font-bold text-neutral-950">
            {pending ? 'Application received' : rejected ? 'Application not approved' : "You're signed in"}
          </h1>
          <p className="mt-1.5 text-xs text-neutral-500">{user.name || user.phone || user.email}</p>

          {pending && (
            <p className="mt-3 text-xs text-neutral-600 leading-relaxed bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 flex items-start gap-2 text-left">
              <Clock className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                A super administrator is reviewing your seller account. You will get the verified badge and full seller
                access as soon as it is approved.
              </span>
            </p>
          )}
          {rejected && (
            <p className="mt-3 text-xs text-neutral-600 leading-relaxed bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-left">
              This seller application was not approved. Contact the platform owner if you believe this is a mistake.
            </p>
          )}

          <button
            type="button"
            onClick={() => navigate({ page: isSellerAccount ? 'admin' : 'catalog' })}
            className="mt-6 w-full py-3 rounded-full bg-neutral-950 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>{isSellerAccount ? 'Open Seller Panel' : 'Start Shopping'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => navigate({ page: 'home' })}
            className="mt-2 w-full py-2.5 rounded-full text-xs font-semibold text-neutral-600 hover:text-neutral-950 cursor-pointer"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12 sm:py-16">
      <div className="bg-white border border-neutral-200/80 rounded-3xl p-7 shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl mb-6">
          {(
            [
              { id: 'signup', label: 'Sign Up' },
              { id: 'seller', label: 'Sell' },
              { id: 'signin', label: 'Sign In' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setMode(tab.id);
                setError('');
              }}
              aria-pressed={mode === tab.id}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                mode === tab.id ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-600 hover:text-neutral-950'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <h1 className="font-display text-xl font-bold text-neutral-950">
          {mode === 'signup'
            ? 'Sign up with your phone'
            : mode === 'seller'
              ? 'Become a seller'
              : 'Welcome back'}
        </h1>
        <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
          {mode === 'signup'
            ? 'Pick a user name, then sign up with your phone number and a password — no email required.'
            : mode === 'seller'
              ? 'Apply for a seller account. A super administrator verifies every seller before the store unlocks.'
              : 'Sign in with the phone number and password you used to sign up.'}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode !== 'signin' && (
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-neutral-100 overflow-hidden shrink-0 flex items-center justify-center">
                {avatarPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarPreview} alt="Selected profile photo" className="w-full h-full object-cover" />
                ) : (
                  <UserRound className="w-5 h-5 text-neutral-400" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-neutral-800">Profile photo</p>
                <p className="text-[11px] text-neutral-500">Optional, helps buyers recognise you.</p>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="mt-1 inline-flex items-center gap-1 px-3 py-1 rounded-full border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:border-neutral-950 cursor-pointer"
                >
                  <Camera className="w-3 h-3" />
                  {avatarFile ? 'Change photo' : 'Add photo'}
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    e.target.value = '';
                    if (file && file.size > 5 * 1024 * 1024) {
                      setError('Profile photo must be 5MB or smaller.');
                      return;
                    }
                    setAvatarFile(file);
                  }}
                />
              </div>
            </div>
          )}

          {mode !== 'signin' && (
            <div>
              <label htmlFor="account-name" className="block text-xs font-semibold text-neutral-800 mb-1">
                {mode === 'seller' ? 'Store / Seller Name' : 'User Name'}
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3.5 py-2.5 focus-within:border-neutral-950">
                {mode === 'seller' ? (
                  <Store className="w-4 h-4 text-neutral-400 shrink-0" />
                ) : (
                  <UserRound className="w-4 h-4 text-neutral-400 shrink-0" />
                )}
                <input
                  id="account-name"
                  type="text"
                  autoComplete={mode === 'seller' ? 'organization' : 'nickname'}
                  maxLength={40}
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={mode === 'seller' ? 'Aline Studio' : 'Aline Uwase'}
                  className="w-full bg-transparent text-sm focus:outline-none"
                />
              </div>
            </div>
          )}

          {mode === 'seller' && (
            <div>
              <label htmlFor="account-email" className="block text-xs font-semibold text-neutral-800 mb-1">
                Business Email
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3.5 py-2.5 focus-within:border-neutral-950">
                <Mail className="w-4 h-4 text-neutral-400 shrink-0" />
                <input
                  id="account-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="store@yourdomain.com"
                  className="w-full bg-transparent text-sm focus:outline-none"
                />
              </div>
            </div>
          )}

          <PhoneInput
            id="account-phone"
            initialCountry={detected.country}
            onChange={(value) => setPhone(value)}
            autoComplete="tel"
          />

          {mode === 'signup' && <GenderSelect value={gender} onChange={setGender} />}

          <div>
            <label htmlFor="account-password" className="block text-xs font-semibold text-neutral-800 mb-1">
              Password
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3.5 py-2.5 focus-within:border-neutral-950">
              <Lock className="w-4 h-4 text-neutral-400 shrink-0" />
              <input
                id="account-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'seller' ? 8 : 6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'seller' ? 'At least 8 characters' : 'At least 6 characters'}
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

          {error && (
            <p role="alert" className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-full bg-neutral-950 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-neutral-800 cursor-pointer disabled:opacity-50"
          >
            <span>
              {submitting
                ? mode === 'signup'
                  ? 'Creating account...'
                  : mode === 'seller'
                    ? 'Submitting application...'
                    : 'Signing in...'
                : mode === 'signup'
                  ? 'Create Account'
                  : mode === 'seller'
                    ? 'Apply as Seller'
                    : 'Sign In'}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {mode === 'seller' && (
            <p className="text-[11px] text-neutral-500 leading-relaxed text-center">
              Seller accounts stay read-only until a super administrator approves them. Approval is automatic after
              review and includes the verified seller badge.
            </p>
          )}
        </form>
      </div>
    </div>
  );
};
