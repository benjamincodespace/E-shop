import type { Metadata } from 'next';
import { SettingsControls } from '@/features/settings/components/SettingsControls';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Settings',
  description: `Language, appearance and currency preferences for ${SITE.name}.`,
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <h1 className="font-display text-2xl font-bold text-neutral-950">Settings</h1>
      <p className="mt-1 text-xs text-neutral-500">Language, appearance and currency preferences.</p>

      <div className="mt-5 bg-white border border-neutral-200/80 rounded-3xl p-5 sm:p-6">
        <SettingsControls />
      </div>
    </div>
  );
}
