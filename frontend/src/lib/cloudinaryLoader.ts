export interface ImageLoaderParams {
  src: string;
  width: number;
  quality?: number;
}

/**
 * Responsive Cloudinary image transformation loader for Next.js & Cloudflare Workers.
 * Automatically injects f_auto, q_auto (or explicit quality), c_limit, and w_<width>
 * for Cloudinary URLs while leaving local /images/* studio assets unchanged.
 */
export default function cloudinaryLoader({ src, width, quality }: ImageLoaderParams): string {
  if (!src) return '';
  if (!src.includes('res.cloudinary.com') || !src.includes('/image/upload/')) {
    return src;
  }

  const q = quality ? `q_${quality}` : 'q_auto';
  const transforms = `f_auto,${q},c_limit,w_${Math.max(100, Math.round(width || 800))}`;
  const marker = '/image/upload/';
  const idx = src.indexOf(marker);
  if (idx === -1) return src;

  const prefix = src.slice(0, idx + marker.length);
  const rest = src.slice(idx + marker.length);
  // Avoid duplicating transforms if already prefixed before version segment
  if (/^(f_|q_|w_|c_)/.test(rest)) {
    return src;
  }
  return `${prefix}${transforms}/${rest}`;
}
