'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { CURRENCY_STORAGE_KEY } from '@/utils/currency';
import { SettingsControls } from './SettingsControls';

const ONBOARDING_STORAGE_KEY = 'eshopall_preferences_onboarded';

/**
 * Shown once, on the very first visit, so language, appearance and currency
 * start from an explicit choice instead of an implicit default. Choices are
 * stored by the provider's setters; this component only records that the
 * welcome step has been completed.
 */
export const PreferencesOnboarding: React.FC = () => {
  const { currencyReady, t } = useStore();
  const [open, setOpen] = useState(false);
  const decidedRef = useRef(false);

  useEffect(() => {
    if (!currencyReady || decidedRef.current) return;
    decidedRef.current = true;

    let completed = false;
    try {
      completed =
        window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1' ||
        // Returning visitors from before this welcome step already have a
        // saved currency; don't interrupt them again.
        Boolean(window.localStorage.getItem(CURRENCY_STORAGE_KEY));
    } catch {
      // Storage blocked: show the welcome step for this visit.
    }

    if (!completed) setOpen(true);
  }, [currencyReady]);

  const finish = useCallback(() => {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    } catch {
      // Storage blocked: the defaults still apply for this visit.
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label={t('settings.start')}
        onClick={finish}
        className="onboarding-fade absolute inset-0 bg-neutral-950/55 backdrop-blur-sm cursor-default"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-subtitle"
        className="onboarding-pop relative w-full sm:max-w-lg bg-white border border-neutral-200 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
          <Sparkles className="w-3 h-3" />
          {t('settings.welcome')}
        </span>
        <h2
          id="onboarding-title"
          className="mt-3 font-display text-xl sm:text-2xl font-bold tracking-tight text-neutral-950"
        >
          {t('settings.welcomeTitle')}
        </h2>
        <p id="onboarding-subtitle" className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
          {t('settings.welcomeSubtitle')}
        </p>

        <div className="onboarding-stagger">
          <SettingsControls />
        </div>

        <button
          type="button"
          onClick={finish}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-full bg-neutral-950 px-5 py-3.5 text-xs font-semibold text-white hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          {t('settings.start')}
          <ArrowRight className="w-4 h-4" />
        </button>
        <p className="mt-3 text-center text-[11px] text-neutral-500">{t('settings.welcomeSaved')}</p>
      </div>
    </div>
  );
};
