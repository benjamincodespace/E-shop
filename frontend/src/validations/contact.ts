/**
 * Phone validation shared by sign-up, profile and checkout forms. Mirrors the
 * Go API's rules: an optional leading "+" followed by 7–15 digits.
 */
export function normalizePhoneNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return '';
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

export function isValidPhoneNumber(raw: string): boolean {
  const normalized = normalizePhoneNumber(raw);
  if (!normalized.startsWith('+')) return false;
  const digits = normalized.length - 1;
  return digits >= 7 && digits <= 15;
}

export function isValidEmail(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}
