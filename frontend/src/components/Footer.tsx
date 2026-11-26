'use client';

import React, { useState } from 'react';
import { BrandLogo } from './BrandLogo';
import { useStore } from '@/context/StoreContext';
import { api } from '@/services/api';

export const Footer: React.FC = () => {
  const { navigate, notify } = useStore();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.subscribeNewsletter(email.trim());
      notify(res.message, 'success');
      setEmail('');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Subscription failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <footer className="border-t border-neutral-200 bg-white mt-14 pb-20 lg:pb-8">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div>
          <BrandLogo subtitle="Wear Your Style" />
          <p className="mt-3 text-xs text-neutral-500 leading-relaxed max-w-xs">
            Monochrome heavyweight T-shirts engineered for clean silhouettes, organic cotton comfort, and daily durability.
          </p>
        </div>

        <div>
          <h3 className="font-display text-xs font-bold text-neutral-950 mb-3">Quick Links</h3>
          <ul className="space-y-2 text-xs text-neutral-600">
            <li>
              <button type="button" onClick={() => navigate({ page: 'home' })} className="hover:text-neutral-950 cursor-pointer">
                Home
              </button>
            </li>
            <li>
              <button type="button" onClick={() => navigate({ page: 'catalog' })} className="hover:text-neutral-950 cursor-pointer">
                Shop All T-Shirts
              </button>
            </li>
            <li>
              <button type="button" onClick={() => navigate({ page: 'about' })} className="hover:text-neutral-950 cursor-pointer">
                About E-shop All
              </button>
            </li>
            <li>
              <button type="button" onClick={() => navigate({ page: 'admin' })} className="hover:text-neutral-950 cursor-pointer">
                Admin Console
              </button>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-display text-xs font-bold text-neutral-950 mb-3">Customer Care</h3>
          <ul className="space-y-2 text-xs text-neutral-600">
            <li>
              <button type="button" onClick={() => navigate({ page: 'signup' })} className="hover:text-neutral-950 cursor-pointer">
                Create Account / Sign In
              </button>
            </li>
            <li>
              <button type="button" onClick={() => navigate({ page: 'favorites' })} className="hover:text-neutral-950 cursor-pointer">
                Saved Favorites
              </button>
            </li>
            <li>
              <button type="button" onClick={() => navigate({ page: 'cart' })} className="hover:text-neutral-950 cursor-pointer">
                Shopping Cart
              </button>
            </li>
            <li>support@eshopall.studio</li>
          </ul>
        </div>

        <div>
          <h3 className="font-display text-xs font-bold text-neutral-950 mb-2">Subscribe to our Newsletter</h3>
          <p className="text-xs text-neutral-500 mb-3">Get the latest drops and restock updates.</p>
          <form onSubmit={handleSubscribe} className="flex items-center gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              aria-label="Newsletter email address"
              className="flex-1 min-w-0 rounded-full border border-neutral-200 px-3.5 py-2 text-xs focus:outline-none focus:border-neutral-950"
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-full bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              Subscribe
            </button>
          </form>
        </div>
      </div>

      <div className="border-t border-neutral-100 py-4 text-center text-[11px] text-neutral-400">
        © {new Date().getFullYear()} E-shop All. All rights reserved.
      </div>
    </footer>
  );
};
