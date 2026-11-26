import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <p className="font-mono-num text-xs font-semibold text-neutral-500">404</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-neutral-950">Page not found</h1>
      <p className="mt-2 text-xs text-neutral-500">The page you are looking for does not exist or has moved.</p>
      <div className="mt-5 flex items-center gap-2">
        <Link href="/" className="px-5 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold">
          Back Home
        </Link>
        <Link href="/catalog" className="px-5 py-2.5 rounded-full border border-neutral-200 text-xs font-semibold text-neutral-800">
          Browse Catalog
        </Link>
      </div>
    </div>
  );
}
