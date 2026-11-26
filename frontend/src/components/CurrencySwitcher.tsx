'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { CURRENCIES, currencyRateLabel } from '@/lib/currency';
import type { CurrencyCode } from '@/types/store';

interface CurrencySwitcherProps {
  compact?: boolean;
}

/**
 * Storefront currency picker. Prices are converted and formatted through the
 * shared currency helpers, so changing this updates every price on the page.
 */
export const CurrencySwitcher: React.FC<CurrencySwitcherProps> = ({ compact = false }) => {
  const { currency, setCurrency } = useStore();

  return (
    <div className="relative shrink-0">
      <label htmlFor={compact ? 'currency-select-mobile' : 'currency-select'} className="sr-only">
        Display currency
      </label>
      <select
        id={compact ? 'currency-select-mobile' : 'currency-select'}
        value={currency}
        onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
        title={currencyRateLabel(currency)}
        className={`appearance-none rounded-full border border-neutral-200 bg-white font-semibold text-neutral-800 cursor-pointer focus:outline-none focus:border-neutral-950 ${
          compact ? 'h-9 pl-3 pr-7 text-[11px]' : 'h-9 pl-3 pr-7 text-[11px]'
        }`}
      >
        {CURRENCIES.map((option) => (
          <option key={option.code} value={option.code}>
            {option.code}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400" aria-hidden="true" />
    </div>
  );
};
