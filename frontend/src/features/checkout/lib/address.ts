import type { DeliveryAddress } from '@/types/store';

/** One-line form of a structured address, used for display and legacy fields. */
export function composeDeliveryAddress(address: DeliveryAddress | null | undefined): string {
  if (!address) return '';
  return [address.street, address.building, address.district, address.city, address.country]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(', ');
}

export function hasPin(address: DeliveryAddress | null | undefined): boolean {
  return Boolean(
    address &&
      typeof address.latitude === 'number' &&
      typeof address.longitude === 'number' &&
      Number.isFinite(address.latitude) &&
      Number.isFinite(address.longitude),
  );
}
