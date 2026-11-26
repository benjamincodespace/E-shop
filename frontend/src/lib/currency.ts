import type { CurrencyCode } from '../types/store';

export interface CurrencyOption {
  code: CurrencyCode;
  name: string;
  symbol: string;
  perUsd: number;
  decimals: number;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', perUsd: 1, decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', perUsd: 0.92, decimals: 2 },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', perUsd: 2600, decimals: 0 },
  { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw', perUsd: 1400, decimals: 0 },
  { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA', perUsd: 600, decimals: 0 },
];

const CURRENCY_MAP = new Map(CURRENCIES.map((option) => [option.code, option]));

export const CURRENCY_STORAGE_KEY = 'teestore_currency';

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && CURRENCIES.some((currency) => currency.code === value.toUpperCase());
}

export function normalizeCurrency(value?: string | null): CurrencyCode {
  const upper = (value || '').trim().toUpperCase();
  if (CURRENCIES.some((currency) => currency.code === upper)) {
    return upper as CurrencyCode;
  }
  return 'USD';
}

export function getCurrencyOption(code?: string | null): CurrencyOption {
  return CURRENCY_MAP.get(normalizeCurrency(code)) || CURRENCIES[0];
}

export function convertCurrency(amount: number, from?: string | null, to?: string | null): number {
  if (!Number.isFinite(amount)) return 0;
  const fromOption = getCurrencyOption(from);
  const toOption = getCurrencyOption(to);
  if (fromOption.code === toOption.code) return amount;
  return (amount / fromOption.perUsd) * toOption.perUsd;
}

export function roundForCurrency(amount: number, code?: string | null): number {
  const decimals = getCurrencyOption(code).decimals;
  if (decimals === 0) return Math.round(amount);
  const factor = 10 ** decimals;
  return Math.round(amount * factor) / factor;
}

export function formatCurrency(amount: number, code?: string | null): string {
  const option = getCurrencyOption(code);
  const safe = Number.isFinite(amount) ? amount : 0;
  const rounded = roundForCurrency(safe, option.code);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: option.decimals,
    maximumFractionDigits: option.decimals,
  }).format(rounded);
  const sign = safe < 0 ? '-' : '';
  const spacer = option.symbol.length > 1 ? ' ' : '';
  return `${sign}${option.symbol}${spacer}${formatted}`;
}

export function formatPrice(amount: number, from?: string | null, to?: string | null): string {
  return formatCurrency(convertCurrency(amount, from, to), to);
}

export function currencyRateLabel(code?: string | null): string {
  const option = getCurrencyOption(code);
  return option.code === 'USD' ? '1 USD' : `1 USD ≈ ${option.perUsd.toLocaleString()} ${option.code}`;
}
