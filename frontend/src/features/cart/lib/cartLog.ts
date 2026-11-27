import type { CartItem } from '@/types/store';

export type CartLogAction = 'added' | 'quantity' | 'removed' | 'cleared';

export interface CartLogEntry {
  id: string;
  at: string;
  action: CartLogAction;
  productId: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
}

export const CART_LOG_STORAGE_KEY = 'eshop_cart_log';
export const CART_LOG_LIMIT = 50;

function itemKey(item: Pick<CartItem, 'productId' | 'size' | 'color'>): string {
  return `${item.productId}::${item.size}::${item.color}`;
}

function makeEntry(
  action: CartLogAction,
  item: CartItem,
  quantity: number,
  at: string,
): CartLogEntry {
  return {
    id: `${Date.parse(at)}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    action,
    productId: item.productId,
    productName: item.productName,
    size: item.size,
    color: item.color,
    quantity,
  };
}

/**
 * Compares two cart snapshots and returns the log entries they produced.
 * A cart emptied in one step is reported as a single `cleared` entry.
 */
export function diffCart(previous: CartItem[], next: CartItem[]): CartLogEntry[] {
  const at = new Date().toISOString();

  if (next.length === 0) {
    if (previous.length === 0) return [];
    const total = previous.reduce((sum, item) => sum + item.quantity, 0);
    return [
      makeEntry('cleared', previous[0], total, at),
    ];
  }

  const previousByKey = new Map(previous.map((item) => [itemKey(item), item]));
  const entries: CartLogEntry[] = [];

  for (const item of next) {
    const before = previousByKey.get(itemKey(item));
    if (!before) {
      entries.push(makeEntry('added', item, item.quantity, at));
      continue;
    }
    previousByKey.delete(itemKey(item));
    if (before.quantity !== item.quantity) {
      entries.push(makeEntry('quantity', item, item.quantity, at));
    }
  }

  for (const item of previousByKey.values()) {
    entries.push(makeEntry('removed', item, item.quantity, at));
  }

  return entries;
}

export function isCartLogEntry(value: unknown): value is CartLogEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<CartLogEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.at === 'string' &&
    typeof entry.action === 'string' &&
    typeof entry.productName === 'string'
  );
}

export function loadCartLog(): CartLogEntry[] {
  try {
    const raw = window.localStorage.getItem(CART_LOG_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter(isCartLogEntry).slice(0, CART_LOG_LIMIT) : [];
  } catch {
    return [];
  }
}

export function saveCartLog(entries: CartLogEntry[]): void {
  try {
    window.localStorage.setItem(
      CART_LOG_STORAGE_KEY,
      JSON.stringify(entries.slice(0, CART_LOG_LIMIT)),
    );
  } catch {
    // Storage can be full or blocked; the in-memory log still works.
  }
}
