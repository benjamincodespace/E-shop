'use client';

import React from 'react';
import { ExternalLink, MapPin, X } from 'lucide-react';

interface DeliveryPinMapProps {
  lat: number;
  lng: number;
  accuracy?: number;
  onRemove?: () => void;
}

/**
 * A keyless OpenStreetMap preview so the customer can sanity-check the pin
 * before confirming. It is deliberately only a preview: the address fields stay
 * editable and the customer confirms the final address explicitly.
 */
export const DeliveryPinMap: React.FC<DeliveryPinMapProps> = ({ lat, lng, accuracy, onRemove }) => {
  const delta = Math.min(0.02, Math.max(0.003, (accuracy || 300) / 111000));
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(',');
  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox,
  )}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`;
  const largerUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      <iframe
        title="Delivery pin preview"
        src={embedUrl}
        loading="lazy"
        className="w-full h-40 border-0"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px] text-neutral-600">
        <span className="inline-flex items-center gap-1 font-mono-num">
          <MapPin className="w-3 h-3" />
          {lat.toFixed(5)}, {lng.toFixed(5)}
          {accuracy ? ` · ±${Math.round(accuracy)} m` : ''}
        </span>
        <span className="inline-flex items-center gap-3">
          <a
            href={largerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-neutral-800 hover:text-neutral-950"
          >
            Larger map <ExternalLink className="w-3 h-3" />
          </a>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 font-semibold text-neutral-500 hover:text-neutral-950 cursor-pointer"
            >
              <X className="w-3 h-3" /> Remove pin
            </button>
          )}
        </span>
      </div>
    </div>
  );
};
