import React from 'react';

interface BrandLogoProps {
  inverted?: boolean;
  subtitle?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ inverted = false, subtitle }) => {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <svg
        width="32"
        height="24"
        viewBox="0 0 36 26"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          d="M18 7.5V5.2C18 3.7 19.2 2.5 20.7 2.5C22.2 2.5 23.3 3.6 23.3 5C23.3 6.2 22.4 7.1 21.1 7.4L18 8.3L3.5 17.7C2.4 18.4 2.9 20 4.2 20H31.8C33.1 20 33.6 18.4 32.5 17.7L18 8.3Z"
          stroke={inverted ? '#FFFFFF' : '#0A0A0B'}
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7 22.8H29"
          stroke={inverted ? '#A1A1AA' : '#71717A'}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <span className="flex flex-col leading-none">
        <span
          className={`font-display text-lg font-bold tracking-tight whitespace-nowrap ${
            inverted ? 'text-white' : 'text-neutral-950'
          }`}
        >
          E-shop
        </span>
        {subtitle && (
          <span
            className={`text-[11px] font-medium tracking-tight mt-0.5 whitespace-nowrap ${
              inverted ? 'text-neutral-400' : 'text-neutral-500'
            }`}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
};
