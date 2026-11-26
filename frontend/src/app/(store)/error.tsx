'use client';

import React from 'react';

export default function StoreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <h1 className="font-display text-xl font-bold text-neutral-950">Something went wrong</h1>
      <p className="mt-2 text-xs text-neutral-500">
        We could not load this page. Please try again{error.digest ? ` (${error.digest})` : ''}.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
      >
        Try Again
      </button>
    </div>
  );
}
