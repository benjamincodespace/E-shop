'use client';

import React, { useEffect, useState } from 'react';
import { Shirt } from 'lucide-react';
import cloudinaryLoader from '@/lib/cloudinaryLoader';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
}

export const SafeImage: React.FC<SafeImageProps> = ({ src, alt, className = '', eager = false }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-neutral-100 text-neutral-400 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Shirt className="w-9 h-9 stroke-[1.5]" />
        <span className="mt-1.5 text-[11px] font-medium text-neutral-500 px-3 text-center line-clamp-1">
          {alt}
        </span>
      </div>
    );
  }

  const isCloudinary = src.includes('res.cloudinary.com') && src.includes('/image/upload/');
  const resolvedSrc = isCloudinary ? cloudinaryLoader({ src, width: 800 }) : src;
  const srcSet = isCloudinary
    ? [400, 800, 1200]
        .map((w) => `${cloudinaryLoader({ src, width: w })} ${w}w`)
        .join(', ')
    : undefined;

  return (
    <img
      src={resolvedSrc}
      srcSet={srcSet}
      sizes={isCloudinary ? '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw' : undefined}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
