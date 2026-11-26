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
 *
 * Accuracy: instead of accepting the first fix, we keep watching for a few
 * seconds and keep the tightest one. The browser often reports a coarse
 * network fix first and a precise GPS fix a moment later; taking the first
 * would put the pin on the wrong street.
 */
export function useCurrentLocation() {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [location, setLocation] = useState<CapturedLocation | null>(null);

  const request = useCallback((): Promise<CapturedLocation | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return Promise.resolve(null);
    }
    setStatus('locating');

    return new Promise<CapturedLocation | null>((resolve) => {
      let best: CapturedLocation | null = null;
      let fixes = 0;
      let settled = false;
      let watchId: number | null = null;

      const finish = (failed: LocationStatus | null) => {
        if (settled) return;
        settled = true;
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        clearTimeout(timer);
        if (best) {
          setLocation(best);
          setStatus('captured');
          resolve(best);
          return;
        }
        setStatus(failed ?? 'unavailable');
        resolve(null);
      };

      // Hard stop: never leave the button spinning while the GPS hunts.
      const timer = setTimeout(() => finish(null), 15000);

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const next: CapturedLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          fixes += 1;
          // Keep a fix only when it is meaningfully tighter than the last one.
          if (!best || next.accuracy < best.accuracy - 5) {
            best = next;
            setLocation(next);
            setStatus('captured');
          }
          // Good enough for a street-level address lookup, or the device has
          // stopped improving: stop watching and hand back the best fix.
          if ((best && best.accuracy <= 20) || fixes >= 4) finish(null);
        },
        (error) => {
          // 1 === PERMISSION_DENIED; compare numerically so it also works in
          // environments that expose a plain error object.
          const denied = error.code === 1 || error.code === error.PERMISSION_DENIED;
          finish(denied ? 'denied' : 'unavailable');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
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
