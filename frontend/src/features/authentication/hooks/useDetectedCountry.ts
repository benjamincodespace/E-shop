'use client';

import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { COUNTRIES, detectCountryCode } from '@/lib/countries';

export type CountrySource = 'edge' | 'locale';

interface DetectedCountry {
  country: string;
  source: CountrySource;
}

const KNOWN_CODES = new Set(COUNTRIES.map((country) => country.code));

/**
 * Approximate country for prefilling the dial code. It first asks the API for
 * the country its CDN/proxy reports, then falls back to the browser locale and
 * time zone. It is only ever a default the shopper can override; no GPS or
 * precise location is requested, and failures fall back silently.
 */
export function useDetectedCountry(): DetectedCountry {
  const [detected, setDetected] = useState<DetectedCountry>({
    country: 'US',
    source: 'locale',
  });

  useEffect(() => {
    let active = true;

    const fallback = detectCountryCode();
    setDetected({ country: fallback, source: 'locale' });

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);

    api
      .getGeoCountry()
      .then((res) => {
        if (!active) return;
        const code = (res.countryCode || '').toUpperCase();
        if (KNOWN_CODES.has(code)) {
          setDetected({ country: code, source: 'edge' });
        }
      })
      .catch(() => {
        // Keep the locale/time-zone default.
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return detected;
}
