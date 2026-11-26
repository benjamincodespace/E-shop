'use client';

import { useCallback, useState } from 'react';

export type LocationStatus = 'idle' | 'locating' | 'captured' | 'denied' | 'unavailable';

export interface CapturedLocation {
  lat: number;
  lng: number;
  accuracy: number;
}

/**
 * Browser GPS, requested only when the customer presses "Use Current
 * Location". A denial or timeout is reported, never thrown, so checkout can
 * continue with manual entry.
 */
export function useCurrentLocation() {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [location, setLocation] = useState<CapturedLocation | null>(null);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setStatus('captured');
      },
      (error) => {
        // 1 === PERMISSION_DENIED; compare numerically so it also works in
        // environments that expose a plain error object.
        setStatus(error.code === 1 || error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, []);

  const clear = useCallback(() => {
    setLocation(null);
    setStatus('idle');
  }, []);

  // Restore a previously saved pin without asking for permission again.
  const restore = useCallback((lat: number, lng: number) => {
    setLocation((current) => current ?? { lat, lng, accuracy: 0 });
    setStatus('captured');
  }, []);

  return { status, location, request, clear, restore };
}
