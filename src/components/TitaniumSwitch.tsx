import React from 'react';

interface TitaniumSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  size?: 'sm' | 'md';
}

/**
 * Tactile Ultramono-Titanium hardware toggle switch.
 * Uses explicit property transitions (never transition-all) and responds instantly on press.
 */
export const TitaniumSwitch: React.FC<TitaniumSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  size = 'md',
}) => {
  const trackSize = size === 'sm' ? 'w-8 h-[18px]' : 'w-9 h-5';
  const thumbSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const translateOn = size === 'sm' ? 'translate-x-[14px]' : 'translate-x-4';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full border p-[1px] cursor-pointer transition-[background-color,border-color,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0c10] disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.96] ${trackSize} ${
        checked
          ? 'bg-[#e2e8f0] border-white/80'
          : 'bg-[#171b24] border-white/[0.14] hover:border-white/[0.24]'
      }`}
    >
      <span
        className={`pointer-events-none block rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.45)] transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${thumbSize} ${
          checked ? `${translateOn} bg-[#0a0c10]` : 'translate-x-0 bg-slate-400'
        }`}
      />
    </button>
  );
};
