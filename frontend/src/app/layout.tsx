import type { Metadata } from 'next';
import './globals.css';
import { StoreProvider } from '@/context/StoreContext';
import { ToastStack } from '@/components/ToastStack';
import { getSiteOrigin } from '@/lib/serverCatalog';

const siteOrigin = getSiteOrigin();

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: 'TeeStore — Minimalist Premium T-Shirt Store',
    template: '%s — TeeStore',
  },
  description:
    'Shop heavyweight monochrome T-shirts crafted for everyday comfort. Browse popular drops, verified customer reviews, and fast shipping.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: 'TeeStore',
    title: 'TeeStore — Minimalist Premium T-Shirt Store',
    description:
      'Shop heavyweight monochrome T-shirts crafted for everyday comfort. Browse popular drops, verified customer reviews, and fast shipping.',
    url: siteOrigin,
    images: [
      {
        url: '/images/hero_monochrome_tee_1795513062252.jpg',
        width: 1200,
        height: 630,
        alt: 'TeeStore — Wear Your Style',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TeeStore — Minimalist Premium T-Shirt Store',
    description: 'Shop heavyweight monochrome T-shirts crafted for everyday comfort.',
    images: ['/images/hero_monochrome_tee_1795513062252.jpg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-white text-neutral-950 antialiased selection:bg-neutral-950 selection:text-white">
        <StoreProvider>
          {children}
          <ToastStack />
        </StoreProvider>
      </body>
    </html>
  );
}
