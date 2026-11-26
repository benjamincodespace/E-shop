'use client';

import React from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { SafeImage } from './SafeImage';

export const AboutView: React.FC = () => {
  const { navigate } = useStore();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        <div className="md:col-span-6 space-y-4">
          <p className="text-xs font-semibold text-neutral-500">E-shop All Atelier</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-neutral-950 tracking-tight">
            Built around the essential T-shirt.
          </h1>
          <p className="text-sm text-neutral-600 leading-relaxed">
            E-shop All strips away seasonal noise in favor of enduring monochrome silhouettes. Every garment is cut
            from long-staple combed cotton, pre-shrunk for consistent sizing, and finished with high-density ribbed
            collars that hold their structure wash after wash.
          </p>
          <ul className="space-y-2 pt-2 text-xs text-neutral-800">
            {[
              '240gsm–300gsm heavyweight organic combed cotton',
              'Pre-shrunk enzyme-washed finish with zero-twist softness',
              'Verified buyer review system with transparent sizing feedback',
            ].map((line) => (
              <li key={line} className="flex items-center gap-2">
                <Check className="w-4 h-4 text-neutral-950 shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => navigate({ page: 'catalog' })}
            className="mt-4 px-6 py-3 rounded-full bg-neutral-950 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <span>Explore the Collection</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="md:col-span-6 rounded-3xl overflow-hidden bg-neutral-100 aspect-[4/3]">
          <SafeImage
            src="/images/hero_monochrome_tee_1795513062252.jpg"
            alt="E-shop All monochrome studio showcase"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </div>
  );
};
