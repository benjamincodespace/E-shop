'use client';

import React from 'react';
import { MobileBottomNav, StoreHeader } from './StoreHeader';
import { Footer } from './Footer';

export const StoreShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-white text-neutral-950">
      <StoreHeader />
      <main className="flex-1">{children}</main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
};
