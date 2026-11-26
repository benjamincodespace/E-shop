'use client';

import React from 'react';
import { Check, Coins, Globe, Moon, Sun } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { CURRENCIES, currencyRateLabel } from '@/utils/currency';
import { LANGUAGES } from '@/lib/i18n';
import type { CurrencyCode } from '@/types/store';

/** Language, appearance and currency controls shared by the settings sheet and page. */
export const SettingsControls: React.FC = () => {
  const { language, setLanguage, theme, setTheme, currency, setCurrency, t } = useStore();

  return (
    <>
      <section className="mt-5">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 mb-2">
          <Globe className="w-3.5 h-3.5" />
          {t('settings.language')}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {LANGUAGES.map((option) => {
            const active = language === option.code;
            return (
              <button
                key={option.code}
                type="button"
                onClick={() => setLanguage(option.code)}
                aria-pressed={active}
                className={`px-3 py-2.5 rounded-xl border text-left text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'border-neutral-950 bg-neutral-950 text-white'
                    : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400'
                }`}
              >
                <span className="block">{option.native}</span>
                <span className={`block text-[10px] font-normal ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-5">
        <h3 className="text-xs font-semibold text-neutral-800 mb-2">{t('settings.appearance')}</h3>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: 'light', label: t('settings.light'), icon: Sun },
              { id: 'dark', label: t('settings.dark'), icon: Moon },
            ] as const
          ).map((option) => {
            const Icon = option.icon;
            const active = theme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                aria-pressed={active}
                className={`inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'border-neutral-950 bg-neutral-950 text-white'
                    : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{option.label}</span>
                {active && <Check className="w-3 h-3" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-5">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 mb-2">
          <Coins className="w-3.5 h-3.5" />
          {t('settings.currency')}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CURRENCIES.map((option) => {
            const active = currency === option.code;
            return (
              <button
                key={option.code}
                type="button"
                onClick={() => setCurrency(option.code as CurrencyCode)}
                aria-pressed={active}
                title={currencyRateLabel(option.code)}
                className={`px-3 py-2 rounded-xl border text-left text-[11px] font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'border-neutral-950 bg-neutral-950 text-white'
                    : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400'
                }`}
              >
                <span className="block">{option.code}</span>
                <span className={`block text-[10px] font-normal ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>
                  {option.symbol} · {option.name}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <p className="mt-5 text-[11px] text-neutral-500">{t('settings.savedAuto')}</p>
    </>
  );
};
