'use client';

import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, Phone, ShoppingBag } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { isValidPhoneNumber } from '@/validations/contact';

type Mode = 'signup' | 'signin';

export const SignUpView: React.FC = () => {
  const { user, registerUser, loginShopper, navigate } = useStore();

  const [mode, setMode] = useState<Mode>('signup');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isValidPhoneNumber(phone)) {
      setError('Enter your phone number with the country code, for example +1 555 010 0000.');
      return;
    }
    if (password.length < 6) {
      setError('Your password needs at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await registerUser(phone.trim(), password);
      } else {
        await loginShopper(phone.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white border border-neutral-200/80 rounded-3xl p-7 text-center shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
          <div className="w-12 h-12 rounded-2xl bg-neutral-950 text-white flex items-center justify-center mx-auto">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <h1 className="mt-4 font-display text-xl font-bold text-neutral-950">You&apos;re signed in</h1>
          <p className="mt-1.5 text-xs text-neutral-500">
            {user.phone || user.email || user.name}
          </p>
          <button
            type="button"
            onClick={() => navigate({ page: 'catalog' })}
            className="mt-6 w-full py-3 rounded-full bg-neutral-950 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Start Shopping</span>
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
              { id: 'signup', label: 'Create Account' },
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
          {mode === 'signup' ? 'Sign up with your phone' : 'Welcome back'}
        </h1>
        <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
          {mode === 'signup'
            ? 'All you need is a phone number and a password — no email required.'
            : 'Sign in with the phone number and password you used to sign up.'}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="account-phone" className="block text-xs font-semibold text-neutral-800 mb-1">
              Phone Number
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3.5 py-2.5 focus-within:border-neutral-950">
              <Phone className="w-4 h-4 text-neutral-400 shrink-0" />
              <input
                id="account-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 010 0000"
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">Include your country code, starting with +.</p>
          </div>

          <div>
            <label htmlFor="account-password" className="block text-xs font-semibold text-neutral-800 mb-1">
              Password
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3.5 py-2.5 focus-within:border-neutral-950">
              <Lock className="w-4 h-4 text-neutral-400 shrink-0" />
              <input
                id="account-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
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
                  : 'Signing in...'
                : mode === 'signup'
                  ? 'Create Account'
                  : 'Sign In'}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
