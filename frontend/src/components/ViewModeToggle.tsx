'use client';

import React from 'react';
import { LayoutGrid, List } from 'lucide-react';

export type ProductViewMode = 'single' | 'grid';

interface ViewModeToggleProps {
  value: ProductViewMode;
  onChange: (mode: ProductViewMode) => void;
  className?: string;
}

const OPTIONS = [
  { mode: 'single' as const, label: 'Single column view', Icon: List },
  { mode: 'grid' as const, label: 'Grid view', Icon: LayoutGrid },
];

/**
 * Lets shoppers switch a product listing between one product per row and a
 * multi-column grid. Single column is the default on every listing page.
 */
export const ViewModeToggle: React.FC<ViewModeToggleProps> = ({
  value,
  onChange,
  className = '',
}) => (
  <div
    role="group"
    aria-label="Product layout"
    className={`flex items-center bg-neutral-100 p-1 rounded-xl shrink-0 ${className}`}
  >
    {OPTIONS.map(({ mode, label, Icon }) => (
      <button
        key={mode}
        type="button"
        onClick={() => onChange(mode)}
        aria-pressed={value === mode}
        aria-label={label}
        title={label}
        className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
          value === mode ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
        }`}
      >
        <Icon className="w-4 h-4" />
      </button>
    ))}
  </div>
);
