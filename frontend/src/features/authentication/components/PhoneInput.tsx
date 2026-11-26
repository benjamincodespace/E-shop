'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { AsYouType, isValidPhoneNumber } from 'libphonenumber-js/min';
import { COUNTRIES, findCountry, flagEmoji } from '@/lib/countries';

interface PhoneInputProps {
  id: string;
  /** ISO country code used until the shopper picks another one. */
  initialCountry: string;
  /** Emits the E.164 value (or best-effort `+dial digits`) and validity. */
  onChange: (value: string, meta: { countryCode: string; valid: boolean }) => void;
  label?: string;
  error?: string;
  autoComplete?: string;
}

/**
 * International phone field: flag + dial code + national number, with a
 * searchable country list and E.164 output validated by libphonenumber-js.
 */
export const PhoneInput: React.FC<PhoneInputProps> = ({
  id,
  initialCountry,
  onChange,
  label = 'Phone Number',
  error,
  autoComplete = 'tel',
}) => {
  const [country, setCountry] = useState(() => findCountry(initialCountry).code);
  const [digits, setDigits] = useState('');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [touched, setTouched] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const userPicked = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const selected = findCountry(country);

  // A later geolocation result may still arrive; only apply it while the
  // shopper has not chosen a country themselves.
  useEffect(() => {
    if (!userPicked.current) {
      setCountry(findCountry(initialCountry).code);
    }
  }, [initialCountry]);

  const formatted = useMemo(() => {
    if (!digits) return '';
    return new AsYouType(country as never).input(digits);
  }, [digits, country]);

  const e164 = digits ? `+${selected.dial}${digits}` : '';
  const valid = digits ? isValidPhoneNumber(`+${selected.dial}${digits}`) : false;

  useEffect(() => {
    onChangeRef.current(e164, { countryCode: country, valid });
  }, [e164, country, valid]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      window.setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return COUNTRIES;
    return COUNTRIES.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        item.code.toLowerCase().includes(needle) ||
        `+${item.dial}`.includes(needle) ||
        item.dial.includes(needle.replace(/^\+/, '')),
    );
  }, [query]);

  const pickCountry = (code: string) => {
    userPicked.current = true;
    setCountry(code);
    setOpen(false);
    setTouched(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(filtered.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[activeIndex];
      if (option) pickCountry(option.code);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  };

  const showInlineError = !error && touched && digits.length >= 4 && !valid;

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={id} className="block text-xs font-semibold text-neutral-800 mb-1">
        {label}
      </label>

      <div
        className={`flex items-stretch rounded-xl border bg-white transition-colors focus-within:border-neutral-950 ${
          error || showInlineError ? 'border-red-300' : 'border-neutral-200'
        }`}
      >
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Country: ${selected.name} (+${selected.dial})`}
          className="flex items-center gap-1.5 pl-3 pr-2 rounded-l-xl text-sm font-medium text-neutral-800 hover:bg-neutral-50 cursor-pointer shrink-0"
        >
          <span aria-hidden="true" className="text-base leading-none">
            {flagEmoji(selected.code)}
          </span>
          <span className="font-mono-num text-xs">+{selected.dial}</span>
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
        </button>

        <div className="w-px bg-neutral-200 my-2" aria-hidden="true" />

        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete}
          value={formatted}
          onChange={(event) => {
            const next = event.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 15);
            setDigits(next);
            setTouched(true);
          }}
          onBlur={() => setTouched(true)}
          placeholder="Phone number"
          aria-invalid={Boolean(error || showInlineError)}
          aria-describedby={`${id}-hint`}
          className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm focus:outline-none"
        />
      </div>

      <p id={`${id}-hint`} className="mt-1 text-[11px] text-neutral-500">
        {error || showInlineError
          ? ''
          : `Saved as ${e164 && valid ? e164 : `+${selected.dial}…`} · change the country any time`}
      </p>
      {(error || showInlineError) && (
        <p role="alert" className="mt-1 text-[11px] font-medium text-red-600">
          {error || `Enter a valid ${selected.name} phone number.`}
        </p>
      )}

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 rounded-2xl border border-neutral-200 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100">
            <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search country or code"
              aria-label="Search countries"
              className="w-full bg-transparent text-xs focus:outline-none"
            />
          </div>
          <ul role="listbox" aria-label="Countries" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-xs text-neutral-500">No countries match “{query}”.</li>
            ) : (
              filtered.map((item, index) => {
                const active = item.code === country;
                return (
                  <li key={item.code} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => pickCountry(item.code)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs cursor-pointer ${
                        index === activeIndex ? 'bg-neutral-100' : 'bg-white'
                      }`}
                    >
                      <span aria-hidden="true" className="text-base leading-none">
                        {flagEmoji(item.code)}
                      </span>
                      <span className="flex-1 truncate text-neutral-800">{item.name}</span>
                      <span className="font-mono-num text-[11px] text-neutral-500">+{item.dial}</span>
                      {active && <Check className="w-3.5 h-3.5 text-neutral-950" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
