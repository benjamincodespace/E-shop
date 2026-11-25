'use client';

import React from 'react';
import { useStore } from '@/context/StoreContext';

export const ToastStack: React.FC = () => {
  const { toasts } = useStore();
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto px-4 py-3 rounded-2xl text-xs font-semibold shadow-lg border transition-all ${
            t.tone === 'error'
              ? 'bg-neutral-950 text-white border-neutral-800'
              : t.tone === 'success'
                ? 'bg-neutral-950 text-white border-neutral-800'
                : 'glass-surface text-neutral-950 border-neutral-200'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
};
