'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { SettingsControls } from './SettingsControls';

export const SettingsPanel: React.FC = () => {
  const { settingsOpen, setSettingsOpen, t } = useStore();

  // Keep the page behind the sheet still while it is open.
  useEffect(() => {
    if (!settingsOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, setSettingsOpen]);

  if (!settingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label={t('settings.close')}
        onClick={() => setSettingsOpen(false)}
        className="absolute inset-0 bg-black/45 backdrop-blur-xs cursor-default"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="relative w-full sm:max-w-md bg-white border border-neutral-200 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[88vh] overflow-y-auto shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="settings-title" className="font-display text-lg font-bold text-neutral-950">
              {t('settings.title')}
            </h2>
            <p className="mt-0.5 text-[11px] text-neutral-500">{t('settings.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            aria-label={t('settings.close')}
            className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-700 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <SettingsControls />
      </div>
    </div>
  );
};
