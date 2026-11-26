'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Crown,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  Store,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { SafeImage } from './SafeImage';
import { useCurrentLocation } from '@/features/checkout/hooks/useCurrentLocation';
import { reverseGeocode } from '@/features/checkout/lib/reverseGeocode';
import type { DeliveryAddress } from '@/types/store';

const VERIFIED_BADGE = '/images/badges/verified-seller.svg';

const EMPTY_ADDRESS: DeliveryAddress = {
  country: '',
  city: '',
  district: '',
  street: '',
  building: '',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function formatAddress(address: DeliveryAddress | null | undefined): string {
  if (!address) return '';
  return [address.street, address.building, address.district, address.city, address.country]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Header profile menu. It replaces the old sign-up shortcut once someone is
 * signed in: the avatar opens their details, saved location, seller plan state
 * and sign-out.
 */
export const UserMenu: React.FC = () => {
  const { user, navigate, updateDeliveryAddress, logoutUser, notify } = useStore();
  const { request } = useCurrentLocation();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DeliveryAddress>(EMPTY_ADDRESS);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Signing out or switching accounts closes the panel and any draft.
  useEffect(() => {
    if (!user) {
      setOpen(false);
      setEditing(false);
    }
  }, [user]);

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => navigate({ page: 'signup' })}
        aria-label="Create an account"
        className="relative w-10 h-10 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-800 transition-colors cursor-pointer"
      >
        <UserPlus className="w-4.5 h-4.5" />
      </button>
    );
  }

  const isSeller = user.role === 'admin' || user.role === 'super_admin';
  const isPendingSeller = user.role === 'admin' && user.approvalStatus === 'pending';
  const savedAddress = user.deliveryAddress || null;
  const savedLine = formatAddress(savedAddress);

  const startEditing = () => {
    setDraft(savedAddress ? { ...savedAddress } : { ...EMPTY_ADDRESS });
    setError('');
    setEditing(true);
  };

  const detectCurrentLocation = async () => {
    setError('');
    setLocating(true);
    try {
      const captured = await request();
      if (!captured) {
        setError('Could not get your location. Allow location access or enter your address manually.');
        return;
      }
      const geocoded = await reverseGeocode(captured.lat, captured.lng);
      setDraft((prev) => ({
        ...prev,
        country: geocoded?.country || prev.country,
        city: geocoded?.city || prev.city,
        district: geocoded?.district || prev.district,
        street: geocoded?.street || prev.street,
        building: geocoded?.building || prev.building,
        latitude: captured.lat,
        longitude: captured.lng,
      }));
    } catch {
      setError('Could not look up that location. Enter your address manually.');
    } finally {
      setLocating(false);
    }
  };

  const saveLocation = async () => {
    setError('');
    if (draft.country.trim().length < 2) {
      setError('Country is required.');
      return;
    }
    if (draft.city.trim().length < 2) {
      setError('City or town is required.');
      return;
    }
    if (draft.street.trim().length < 3) {
      setError('Street or area is required.');
      return;
    }
    setSaving(true);
    try {
      await updateDeliveryAddress({
        ...draft,
        country: draft.country.trim(),
        city: draft.city.trim(),
        district: (draft.district || '').trim(),
        street: draft.street.trim(),
        building: (draft.building || '').trim(),
      });
      notify('Location saved to your profile.', 'success');
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your location.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setOpen(false);
    setEditing(false);
    await logoutUser();
  };

  const field = (
    label: string,
    key: keyof DeliveryAddress,
    placeholder: string,
    required = false,
  ) => (
    <label className="block">
      <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type="text"
        value={(draft[key] as string) || ''}
        onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
        placeholder={placeholder}
        className="mt-0.5 w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs focus:outline-none focus:border-neutral-950"
      />
    </label>
  );

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open your profile"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative w-10 h-10 rounded-full flex items-center justify-center text-neutral-800 transition-colors cursor-pointer hover:bg-neutral-100"
      >
        <span className="w-9 h-9 rounded-full overflow-hidden bg-neutral-950 text-white flex items-center justify-center text-[11px] font-bold">
          {user.avatarUrl ? (
            <SafeImage src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
          ) : (
            initials(user.name || user.email || '?')
          )}
        </span>
        {user.verified && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={VERIFIED_BADGE}
            alt="Verified"
            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 drop-shadow"
          />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Your profile"
          className="absolute right-0 top-full mt-2 w-[min(23rem,calc(100vw-1.5rem))] rounded-2xl border border-neutral-200 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.16)] p-4 z-50"
        >
          {/* Avatar + identity */}
          <div className="flex items-center gap-3">
            <div className="relative w-16 h-16 shrink-0">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-neutral-950 text-white flex items-center justify-center text-lg font-bold">
                {user.avatarUrl ? (
                  <SafeImage src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  initials(user.name || user.email || '?')
                )}
              </div>
              {user.verified && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={VERIFIED_BADGE}
                  alt="Verified seller"
                  className="absolute -bottom-1 -right-1 w-6 h-6 drop-shadow"
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-neutral-950 truncate">{user.name || 'Your account'}</p>
              <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 text-[10px] font-semibold text-neutral-700">
                {user.role === 'super_admin' ? (
                  <>
                    <Crown className="w-3 h-3" /> Super Admin
                  </>
                ) : user.role === 'admin' ? (
                  <>
                    <Store className="w-3 h-3" /> Seller
                  </>
                ) : (
                  <>
                    <UserRound className="w-3 h-3" /> Buyer
                  </>
                )}
              </span>
              {user.verified && (
                <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-sky-600">
                  <ShieldCheck className="w-3 h-3" /> Verified seller
                </p>
              )}
            </div>
          </div>

          {/* Contact details */}
          <dl className="mt-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 text-neutral-700">
              <Phone className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <dt className="sr-only">Telephone</dt>
              <dd className="truncate">{user.phone || <span className="text-neutral-400">No phone added</span>}</dd>
            </div>
            <div className="flex items-center gap-2 text-neutral-700">
              <Mail className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <dt className="sr-only">Email</dt>
              <dd className="truncate">{user.email || <span className="text-neutral-400">No email added</span>}</dd>
            </div>
          </dl>

          {/* Location */}
          <div className="mt-3 rounded-xl border border-neutral-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-neutral-900">
                <MapPin className="w-3.5 h-3.5" /> Location
              </p>
              {!editing && (
                <button
                  type="button"
                  onClick={startEditing}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-neutral-200 text-[10px] font-semibold text-neutral-700 hover:border-neutral-950 cursor-pointer"
                >
                  {savedLine ? <Pencil className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                  {savedLine ? 'Edit' : 'Add location'}
                </button>
              )}
            </div>

            {!editing ? (
              <p className="mt-1.5 text-[11px] text-neutral-600 leading-relaxed">
                {savedLine || 'No location saved yet. Add it once and checkout fills it in for you.'}
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                <button
                  type="button"
                  onClick={detectCurrentLocation}
                  disabled={locating}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-950 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                >
                  {locating ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
                  {locating ? 'Finding your location…' : 'Use current location'}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  {field('Country', 'country', 'RW', true)}
                  {field('City / Town', 'city', 'Kigali', true)}
                  {field('District / Area', 'district', 'Nyarugenge')}
                  {field('Street / Address', 'street', 'KG 11 St', true)}
                </div>
                {field('Building / Apartment', 'building', 'Apartment 4B')}

                {error && (
                  <p role="alert" className="text-[10px] font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">
                    {error}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveLocation}
                    disabled={saving}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-full bg-neutral-950 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Save location
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setError('');
                    }}
                    className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-full border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:border-neutral-950 cursor-pointer"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Seller plan */}
          {isSeller && (
            <div className="mt-3 rounded-xl bg-neutral-50 border border-neutral-200 p-3">
              <p className="text-[11px] font-bold text-neutral-900">
                {user.verified ? 'Unlimited seller plan' : isPendingSeller ? 'Free seller plan' : 'Seller account'}
              </p>
              <p className="mt-0.5 text-[10px] text-neutral-600 leading-relaxed">
                {user.verified
                  ? 'Your store is verified: unlimited products and images.'
                  : isPendingSeller
                    ? '10 products and 10 images included. Upgrade or get verified for unlimited uploads.'
                    : 'Open the seller panel to manage your plan and uploads.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate({ page: 'admin' });
                }}
                className="mt-2 w-full px-3 py-1.5 rounded-full bg-neutral-950 text-white text-[11px] font-semibold cursor-pointer"
              >
                {user.verified ? 'Open seller panel' : 'Upgrade / get verified'}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full border border-neutral-200 text-[11px] font-semibold text-neutral-700 hover:border-red-300 hover:text-red-600 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Log out
          </button>
        </div>
      )}
    </div>
  );
};
