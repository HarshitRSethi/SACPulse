import React from 'react';

interface BrandMarkProps {
  size?: 'sm' | 'md';
}

/**
 * Clean geometric architectural mark for IIITA Student Activity Centre (SACPulse).
 * Replaces generic emoji icons with an institutional vector monogram.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ size = 'sm' }) => {
  const dimensions = size === 'md' ? 'h-8 w-8' : 'h-7 w-7';
  return (
    <span
      className={`inline-flex ${dimensions} items-center justify-center rounded-md bg-zinc-900 text-white shrink-0`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'}
      >
        <rect
          x="2.5"
          y="2.5"
          width="6"
          height="6"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <rect
          x="11.5"
          y="2.5"
          width="6"
          height="6"
          rx="1"
          fill="currentColor"
        />
        <rect
          x="2.5"
          y="11.5"
          width="6"
          height="6"
          rx="1"
          fill="currentColor"
        />
        <rect
          x="11.5"
          y="11.5"
          width="6"
          height="6"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.75"
        />
      </svg>
    </span>
  );
};

