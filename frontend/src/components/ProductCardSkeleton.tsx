import React from 'react';

export const ProductCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl p-3 border border-neutral-200/70 animate-pulse">
      <div className="aspect-square rounded-xl bg-neutral-100" />
      <div className="mt-3 h-4 w-3/4 rounded bg-neutral-100" />
      <div className="mt-2 h-3.5 w-1/3 rounded bg-neutral-100" />
      <div className="mt-2 h-3 w-1/2 rounded bg-neutral-100" />
      <div className="mt-3 h-9 w-full rounded-full bg-neutral-100" />
    </div>
  );
};
