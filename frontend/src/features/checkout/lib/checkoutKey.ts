/**
 * Creates the idempotency key sent with a checkout. The Go API stores it on the
 * order and returns the existing order when the same key is submitted again, so
 * a double click or a retry after a dropped connection cannot create a second
 * order or decrement stock twice.
 */
export function createCheckoutKey(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Mirrors the pattern the API validates the Idempotency-Key header against. */
export const CHECKOUT_KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
