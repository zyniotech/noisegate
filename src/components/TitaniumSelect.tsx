import React, { useEffect, useId, useRef, useState } from 'react';
import { CaretDown, Check } from '@phosphor-icons/react';

export interface TitaniumSelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface TitaniumSelectProps<T extends string = string> {
  value: T;
  options: Array<TitaniumSelectOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  align?: 'left' | 'right';
  triggerPrefix?: string;
  className?: string;
}

export function TitaniumSelect<T extends string = string>({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  ariaLabelledBy,
  size = 'md',
  fullWidth = true,
  align = 'left',
  triggerPrefix = '',
  className = '',
}: TitaniumSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();

  const selectedIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  );
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const openMenu = () => {
    if (disabled || options.length === 0) return;
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setOpenUpward(window.innerHeight - rect.bottom < 220 && rect.top > 220);
    }
    setHighlightedIndex(selectedIndex);
    setOpen(true);
  };

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
    } else {
      openMenu();
    }
  };

  const commitValue = (nextValue: T) => {
    setOpen(false);
    if (nextValue !== value) {
      onChange(nextValue);
    }
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (disabled || options.length === 0) return;

    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openMenu();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + options.length) % options.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setHighlightedIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setHighlightedIndex(options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const target = options[highlightedIndex];
      if (target) commitValue(target.value);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  const sizeClass =
    size === 'sm'
      ? 'h-8 pl-2.5 pr-2 text-[12px] text-slate-100'
      : 'h-9 pl-3 pr-2.5 text-[13px] text-white';

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className={`relative ${fullWidth ? 'w-full' : 'inline-block'} ${className}`}
    >
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={toggleMenu}
        className={`flex items-center justify-between gap-2 rounded-md border border-white/[0.1] bg-[#0a0c10] text-left transition-[border-color] duration-120 hover:border-white/[0.22] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/55 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed ${sizeClass} ${
          fullWidth ? 'w-full' : ''
        }`}
      >
        <span className="truncate">
          {triggerPrefix}
          {selectedOption?.label ?? ''}
        </span>
        <CaretDown
          size={size === 'sm' ? 12 : 13}
          aria-hidden="true"
          className={`shrink-0 text-slate-300 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className={`absolute z-50 ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'} ${
            align === 'right' ? 'right-0' : 'left-0'
          } min-w-full w-max max-w-[min(320px,85vw)] max-h-60 overflow-y-auto rounded-md border border-white/[0.14] bg-[#10131a] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.68)]`}
        >
          {options.map((opt, index) => {
            const isSelected = opt.value === value;
            const isHighlighted = index === highlightedIndex;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => commitValue(opt.value)}
                className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded text-left text-[12.5px] cursor-pointer transition-colors duration-100 ${
                  isSelected
                    ? 'bg-white/[0.12] text-white font-medium'
                    : isHighlighted
                      ? 'bg-white/[0.07] text-slate-100'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check size={12} weight="bold" className="shrink-0 text-white" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
