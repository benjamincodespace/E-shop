'use client';

import React from 'react';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-xl font-bold text-neutral-950">Admin console error</h1>
      <p className="mt-2 text-xs text-neutral-500">
        {error.message || 'The dashboard could not be loaded.'}
        {error.digest ? ` (${error.digest})` : ''}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
      >
        Retry
      </button>
    </div>
  );
}
