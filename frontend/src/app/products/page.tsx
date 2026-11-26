import { permanentRedirect } from 'next/navigation';

/**
 * Public alias kept for the documented route map. The catalogue lives at
 * /catalog (with client filtering and pagination), so this permanent redirect
 * keeps one canonical URL instead of duplicating the page.
 */
export default function ProductsPage() {
  permanentRedirect('/catalog');
}
