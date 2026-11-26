'use client';

import React from 'react';
import type { Gender } from '@/types/store';

const OPTIONS: Array<{ value: Gender; label: string }> = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

interface GenderSelectProps {
  value: Gender | '';
  onChange: (value: Gender | '') => void;
}

/**
 * Optional gender choice. Selecting the active option again clears it, so the
 * field can never block registration.
 */
export const GenderSelect: React.FC<GenderSelectProps> = ({ value, onChange }) => {
  return (
    <fieldset>
      <legend className="block text-xs font-semibold text-neutral-800 mb-1">
        Gender <span className="font-normal text-neutral-500">(optional)</span>
      </legend>
      <div role="radiogroup" aria-label="Gender" className="grid grid-cols-3 gap-1.5">
        {OPTIONS.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(active ? '' : option.value)}
              className={`px-2 py-2.5 rounded-xl border text-center text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 ${
                active
                  ? 'bg-neutral-950 text-white border-neutral-950'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-neutral-500">Only used to improve sizing recommendations.</p>
    </fieldset>
  );
};
