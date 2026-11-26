'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Crosshair,
  Lock,
  MapPin,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { calculateCartSummary } from '@/lib/storeLogic';
import { formatCurrency, formatPrice } from '@/utils/currency';
import { api } from '@/services/api';
import { SafeImage } from '@/components/SafeImage';
import { COUNTRIES, detectCountryCode, flagEmoji } from '@/lib/countries';
import type { DeliveryAddress, Order } from '@/types/store';
import { composeDeliveryAddress } from '../lib/address';
import { createCheckoutKey } from '../lib/checkoutKey';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { DeliveryPinMap } from './DeliveryPinMap';

const KNOWN_CODES = new Set(COUNTRIES.map((country) => country.code));

const fieldClass = (invalid: boolean) =>
  `w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${
    invalid ? 'border-red-300 focus:border-red-400' : 'border-neutral-200 focus:border-neutral-950'
  }`;

const FieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? (
    <p id={id} role="alert" className="mt-1 text-[11px] font-medium text-red-600">
      {message}
    </p>
  ) : null;

/* Mobile-money brand marks shown beside the payment methods. */
const AirtelMoneyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
    <rect width="32" height="32" rx="8" fill="#E40000" />
    <path
      d="M8.5 21.5c3.6-1.6 6.4-5 7.5-9.5"
      fill="none"
      stroke="#fff"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M16 12c1.1 4.5 3.9 7.9 7.5 9.5"
      fill="none"
      stroke="#fff"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <circle cx="16" cy="23" r="1.5" fill="#fff" />
  </svg>
);

const MtnMoneyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 44 44" className={className} aria-hidden="true" focusable="false">
    <rect width="44" height="44" rx="9" fill="#FFCB05" />
    <text
      x="22"
      y="27.5"
      textAnchor="middle"
      fontFamily="Arial, Helvetica, sans-serif"
      fontSize="12"
      fontWeight="800"
      fill="#111111"
    >
      MTN
    </text>
  </svg>
);

const VisaIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 512 320" className={className} aria-hidden="true" focusable="false">
    <path d="M288 0c-43 0-78 35-78 78s35 78 78 78 78-35 78-78-35-78-78-78zM288 32c48 0 88 39 88 88s-40 88-88 88-88-39-88-88 40-88 88-88zM288 160c-41.4 0-75.2 33.8-75.2 75.2s33.8 75.2 75.2 75.2 75.2-33.8 75.2-75.2-33.8-75.2-75.2-75.2zm0 88a13.08 13.08 0 0 1-13.08 13.08 13.08 13.08 0 0 1-13.08-13.08 13.08 13.08 0 0 1 13.08-13.08 13.08 13.08 0 0 1 13.08 13.08z" fill="#1A1F71" />
    <path fill="#F7B600" fillRule="evenodd" d="M512 96v128c0 42-34 76-76 76H256c-33 0-64-27-64-60V96c0-42 34-76 76-76H436c33 0 64 27 64 60v96c0 6-5 11-11 11H267c-6 0-11-5-11-11v-96H152c-16 0-31 11-34 26l34 34c3-1 6-2 9-2h190c16 0 31 11 34 26l-34 34c-6 1-11 5-11 11v12h192c16 0 31 11 34 26l-34 34c-6 1-11 5-11 11h-176c0-19 15-34 34-34h190c3 2 5 3 8 3h190c6 0 11-5 11-11v-96h-33c-6 0-11-5-11-11v-16c0-6 5-11 11-11h47c6 0 11 5 11 11v16H460c6 0 11 5 11 11v96c0 2-2 4-5 4H267c-3 0-5-2-5-5v-96h33c6 0 11 5 11 11v16H460c6 0 11 5 11 11v96c0 6-5 11-11 11H288V96c0-42 34-76 76-76h190c6 0 11 5 11 11v96c0 10-8 18-18 18H256c-10 0-18-8-18-18V96c0-10 8-18 18-18h256zM429 224H256V160h173c6 0 11 5 11 11v6h-9c-6 0-11-5-11-11z" clipRule="evenodd" />
  </svg>
);

const PaymentMethodCard: React.FC<{
  name: string;
  icon: React.ReactElement;
  selected: boolean;
  onClick: () => void;
}> = ({ name, icon, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={`flex items-center gap-3 rounded-xl border text-left transition-colors cursor-pointer ${
      selected
          ? "border-neutral-950 bg-neutral-950 text-white shadow-[0_6px_14px_rgba(0,0,0,0.16)]"
          : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400"
    }`}
  >
    <span className={`shrink-0 ${selected ? "text-white" : "text-neutral-700"}`}>{icon}</span>
    <span className={`flex-1 min-w-0 font-semibold text-xs ${selected ? "text-white" : "text-neutral-900"}`}>
      {name}
    </span>
  </button>
);

export const CheckoutView: React.FC = () => {
  const {
    cart,
    clearCartLocal,
    navigate,
    notify,
    refreshCatalog,
    currency,
    t,
    user,
    authReady,
    updateDeliveryAddress,
  } = useStore();
  const summary = calculateCartSummary(cart);
  const location = useCurrentLocation();

  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [street, setStreet] = useState('');
  const [building, setBuilding] = useState('');
  const [instructions, setInstructions] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash on Delivery');
  const [saveToProfile, setSaveToProfile] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // One key per checkout attempt: the API returns the first order instead of
  // creating a duplicate when the same key arrives twice.
  const checkoutKeyRef = useRef('');
  if (!checkoutKeyRef.current) {
    checkoutKeyRef.current = createCheckoutKey();
  }
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [geoHint, setGeoHint] = useState('');
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Priority 1: the customer's own saved profile details.
  useEffect(() => {
    if (!authReady) return;
    if (user) {
      setNameIfEmpty(user.name);
      setPhoneIfEmpty(user.phone);
      const saved = user.deliveryAddress;
      if (saved) {
        setCountry((value) => value || saved.country || '');
        setCity((value) => value || saved.city || '');
        setDistrict((value) => value || saved.district || '');
        setStreet((value) => value || saved.street || '');
        setBuilding((value) => value || saved.building || '');
        setInstructions((value) => value || saved.instructions || '');
        if (typeof saved.latitude === 'number' && typeof saved.longitude === 'number') {
          location.restore(saved.latitude, saved.longitude);
        }
      } else if (user.address) {
        setStreet((value) => value || user.address);
      }
    }
    setProfileLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user]);

  // Priority 3: an approximate country/city from the network, used only to fill
  // fields the customer has left empty. Manual entry always wins.
  useEffect(() => {
    if (!authReady) return;
    let active = true;
    api
      .getGeoCountry()
      .then((res) => {
        if (!active) return;
        const code = (res.countryCode || '').toUpperCase();
        const fallback = KNOWN_CODES.has(code) ? code : detectCountryCode();
        setCountry((value) => value || fallback);
        if (res.city) {
          setCity((value) => value || res.city);
          setGeoHint(`${res.city}${code ? `, ${code}` : ''}`);
        } else if (code) {
          setGeoHint(`country ${code}`);
        }
      })
      .catch(() => {
        if (active) setCountry((value) => value || detectCountryCode());
      })
      .finally(() => {
        if (active) setProfileLoaded(true);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  function setNameIfEmpty(value: string) {
    setCustomerName((current) => current || value || '');
  }
  function setPhoneIfEmpty(value: string) {
    setPhone((current) => current || value || '');
  }

  const pin = location.location;

  const deliveryAddress: DeliveryAddress = useMemo(
    () => ({
      country,
      city: city.trim(),
      district: district.trim() || undefined,
      street: street.trim(),
      building: building.trim() || undefined,
      instructions: instructions.trim() || undefined,
      ...(pin ? { latitude: pin.lat, longitude: pin.lng } : {}),
    }),
    [country, city, district, street, building, instructions, pin],
  );

  const composedAddress = useMemo(() => composeDeliveryAddress(deliveryAddress), [deliveryAddress]);

  if (confirmedOrder) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <div className="bg-white border border-neutral-200 rounded-3xl p-8 text-center shadow-[0_6px_28px_rgba(0,0,0,0.04)]">
          <CheckCircle2 className="w-12 h-12 text-neutral-950 mx-auto" />
          <h1 className="mt-4 font-display text-2xl font-bold text-neutral-950">
            Order {confirmedOrder.orderNumber} Confirmed
          </h1>
          <p className="mt-1.5 text-sm text-neutral-600">
            Thank you, {confirmedOrder.customerName}. Your order is currently{' '}
            <strong>{confirmedOrder.status}</strong>.
          </p>

          <div className="mt-6 text-left bg-neutral-50 border border-neutral-200/70 rounded-2xl p-5 space-y-3">
            <div className="flex justify-between gap-4 text-xs text-neutral-600">
              <span>Delivery Address</span>
              <span className="font-medium text-neutral-950 text-right max-w-xs">{confirmedOrder.address}</span>
            </div>
            {confirmedOrder.deliveryAddress?.instructions && (
              <div className="flex justify-between gap-4 text-xs text-neutral-600">
                <span>Delivery Instructions</span>
                <span className="font-medium text-neutral-950 text-right max-w-xs">
                  {confirmedOrder.deliveryAddress.instructions}
                </span>
              </div>
            )}
            <div className="flex justify-between text-xs text-neutral-600">
              <span>Phone</span>
              <span className="font-mono-num font-medium text-neutral-950">{confirmedOrder.phone}</span>
            </div>
            {confirmedOrder.deliveryAddress?.latitude != null &&
              confirmedOrder.deliveryAddress?.longitude != null && (
                <div className="flex justify-between text-xs text-neutral-600">
                  <span>Delivery Pin</span>
                  <span className="font-mono-num font-medium text-neutral-950">
                    {confirmedOrder.deliveryAddress.latitude.toFixed(5)},{' '}
                    {confirmedOrder.deliveryAddress.longitude.toFixed(5)}
                  </span>
                </div>
              )}
            {confirmedOrder.notes && (
              <div className="flex justify-between gap-4 text-xs text-neutral-600">
                <span>Order Notes</span>
                <span className="font-medium text-neutral-950 text-right max-w-xs">{confirmedOrder.notes}</span>
              </div>
            )}
            <div className="border-t border-neutral-200 pt-3 space-y-2">
              {confirmedOrder.items.map((it, idx) => (
                <div key={it.id || `${it.productId}-${idx}`} className="flex justify-between text-xs">
                  <span className="text-neutral-800">
                    {it.quantity}× {it.productName} ({it.size}, {it.color})
                  </span>
                  <span className="font-mono-num font-semibold text-neutral-950">
                    {formatCurrency(it.unitPrice * it.quantity, confirmedOrder.currency)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-neutral-200 pt-3 flex justify-between text-sm font-bold text-neutral-950">
              <span>{t('cart.total')}</span>
              <span className="font-mono-num">{formatCurrency(confirmedOrder.total, confirmedOrder.currency)}</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate({ page: 'catalog' })}
              className="px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
            >
              {t('cart.continue')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="font-display text-2xl font-bold text-neutral-950 mb-6">{t('checkout.title')}</h1>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" aria-busy="true">
          <div className="lg:col-span-7 bg-white border border-neutral-200/80 rounded-2xl p-6 space-y-4">
            <div className="h-4 w-40 rounded bg-neutral-100 animate-pulse" />
            <p className="text-[11px] text-neutral-500">Loading your profile…</p>
            {[0, 1, 2].map((row) => (
              <div key={row} className="space-y-1.5">
                <div className="h-3 w-24 rounded bg-neutral-100 animate-pulse" />
                <div className="h-10 w-full rounded-xl bg-neutral-100 animate-pulse" />
              </div>
            ))}
          </div>
          <div className="lg:col-span-5 bg-white border border-neutral-200/80 rounded-2xl p-6 space-y-3">
            <div className="h-4 w-32 rounded bg-neutral-100 animate-pulse" />
            <div className="h-16 w-full rounded-xl bg-neutral-100 animate-pulse" />
            <div className="h-10 w-full rounded-full bg-neutral-100 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14 text-center">
        <h1 className="font-display text-2xl font-bold text-neutral-950">{t('cart.empty')}</h1>
        <button
          type="button"
          onClick={() => navigate({ page: 'catalog' })}
          className="mt-5 px-6 py-2.5 rounded-full bg-neutral-950 text-white text-xs font-semibold cursor-pointer"
        >
          {t('cart.browse')}
        </button>
      </div>
    );
  }

  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (customerName.trim().length < 2) next.name = 'Enter the recipient’s full name.';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 15) {
      next.phone = 'Enter a valid phone number, including the country code.';
    }
    if (!country) next.country = 'Select a delivery country.';
    if (city.trim().length < 2) next.city = 'Enter the delivery city.';
    if (street.trim().length < 3) next.street = 'Enter the street, area or nearest landmark.';
    if (!confirmed) next.confirmed = 'Please confirm the delivery address before placing the order.';
    return next;
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const found = validate();
    setErrors(found);
    const firstKey = Object.keys(found)[0];
    if (firstKey) {
      const targets: Record<string, string> = {
        name: 'chk-name',
        phone: 'chk-phone',
        country: 'chk-country',
        city: 'chk-city',
        street: 'chk-street',
        confirmed: 'chk-confirm',
      };
      document.getElementById(targets[firstKey] || '')?.focus();
      notify(found[firstKey], 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.createOrder(
        {
          customerName: customerName.trim(),
          phone: phone.trim(),
          address: composedAddress,
          deliveryAddress,
          notes: notes.trim(),
          paymentMethod,
          currency,
          items: cart.map((c) => ({
            productId: c.productId,
            size: c.size,
            color: c.color,
            quantity: c.quantity,
          })),
        },
        checkoutKeyRef.current,
      );
      checkoutKeyRef.current = createCheckoutKey();
      clearCartLocal();
      setConfirmedOrder(res.order);
      notify(`Order ${res.order.orderNumber} placed successfully!`, 'success');
      await refreshCatalog();

      if (user && saveToProfile) {
        try {
          await updateDeliveryAddress(deliveryAddress);
          notify('Delivery address saved to your profile.', 'success');
        } catch {
          notify('Order placed, but the address could not be saved to your profile.', 'error');
        }
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Checkout failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const locationMessage: Record<string, string> = {
    idle: 'Drop a pin with your browser location, or type the address manually — whichever is easiest.',
    locating: 'Requesting your location…',
    captured: 'Pin captured. Check it on the map, then complete any missing street details.',
    denied: 'Location permission was denied. No problem — type the delivery details above.',
    unavailable: 'Your browser could not provide a location. Enter the address manually.',
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-2xl font-bold text-neutral-950 mb-6">{t('checkout.title')}</h1>

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-neutral-200/80 rounded-2xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-neutral-950">Delivery Information</h2>
              <p className="mt-0.5 text-[11px] text-neutral-500" aria-live="polite">
                {!profileLoaded
                  ? 'Loading your profile…'
                  : user
                    ? 'Details filled from your profile — edit anything you need.'
                    : 'Checking out as a guest — no account required.'}
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-semibold text-neutral-700">
              {user ? <UserRound className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              {user ? 'Signed in' : 'Guest'}
            </span>
          </div>

          {!user && (
            <p className="text-[11px] text-neutral-600 bg-neutral-50 border border-neutral-200/70 rounded-xl px-3 py-2">
              Want your details filled in next time?{' '}
              <button
                type="button"
                onClick={() => navigate({ page: 'signup' })}
                className="font-semibold text-neutral-950 underline underline-offset-2 cursor-pointer"
              >
                Sign in or create an account
              </button>
              .
            </p>
          )}

          <div>
            <label htmlFor="chk-name" className="block text-xs font-semibold text-neutral-800 mb-1.5">
              Full Name
            </label>
            <input
              id="chk-name"
              type="text"
              autoComplete="name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'chk-name-error' : undefined}
              placeholder="Jean Bosco"
              className={fieldClass(Boolean(errors.name))}
            />
            <FieldError id="chk-name-error" message={errors.name} />
          </div>

          <div>
            <label htmlFor="chk-phone" className="block text-xs font-semibold text-neutral-800 mb-1.5">
              Phone Number
            </label>
            <input
              id="chk-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'chk-phone-error' : 'chk-phone-hint'}
              placeholder="+250 788 123 456"
              className={fieldClass(Boolean(errors.phone))}
            />
            {!errors.phone && (
              <p id="chk-phone-hint" className="mt-1 text-[11px] text-neutral-500">
                Used by the courier to reach you before delivery.
              </p>
            )}
            <FieldError id="chk-phone-error" message={errors.phone} />
          </div>

          <fieldset className="pt-1 space-y-3">
            <legend className="text-xs font-semibold text-neutral-800 mb-1.5">Delivery Address</legend>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="chk-country" className="block text-[11px] font-semibold text-neutral-700 mb-1">
                  Country
                </label>
                <select
                  id="chk-country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  aria-invalid={Boolean(errors.country)}
                  aria-describedby={errors.country ? 'chk-country-error' : undefined}
                  className={fieldClass(Boolean(errors.country))}
                >
                  <option value="">Select country</option>
                  {COUNTRIES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {flagEmoji(item.code)} {item.name}
                    </option>
                  ))}
                </select>
                <FieldError id="chk-country-error" message={errors.country} />
              </div>

              <div>
                <label htmlFor="chk-city" className="block text-[11px] font-semibold text-neutral-700 mb-1">
                  City / Town
                </label>
                <input
                  id="chk-city"
                  type="text"
                  autoComplete="address-level2"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  aria-invalid={Boolean(errors.city)}
                  aria-describedby={errors.city ? 'chk-city-error' : undefined}
                  placeholder="Kigali"
                  className={fieldClass(Boolean(errors.city))}
                />
                <FieldError id="chk-city-error" message={errors.city} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="chk-district" className="block text-[11px] font-semibold text-neutral-700 mb-1">
                  District / Area <span className="font-normal text-neutral-500">(optional)</span>
                </label>
                <input
                  id="chk-district"
                  type="text"
                  autoComplete="address-level3"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="Gasabo"
                  className={fieldClass(false)}
                />
              </div>

              <div>
                <label htmlFor="chk-building" className="block text-[11px] font-semibold text-neutral-700 mb-1">
                  Building / Apartment <span className="font-normal text-neutral-500">(optional)</span>
                </label>
                <input
                  id="chk-building"
                  type="text"
                  autoComplete="address-line2"
                  value={building}
                  onChange={(e) => setBuilding(e.target.value)}
                  placeholder="Apt 4B, 3rd floor"
                  className={fieldClass(false)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="chk-street" className="block text-[11px] font-semibold text-neutral-700 mb-1">
                Street / Address
              </label>
              <input
                id="chk-street"
                type="text"
                autoComplete="address-line1"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                aria-invalid={Boolean(errors.street)}
                aria-describedby={errors.street ? 'chk-street-error' : 'chk-street-hint'}
                placeholder="KG 11 Ave, near Simba Supermarket"
                className={fieldClass(Boolean(errors.street))}
              />
              {!errors.street && (
                <p id="chk-street-hint" className="mt-1 text-[11px] text-neutral-500">
                  A landmark helps the courier find you quickly.
                </p>
              )}
              <FieldError id="chk-street-error" message={errors.street} />
            </div>

            <div>
              <label htmlFor="chk-instructions" className="block text-[11px] font-semibold text-neutral-700 mb-1">
                Delivery Instructions <span className="font-normal text-neutral-500">(optional)</span>
              </label>
              <textarea
                id="chk-instructions"
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Gate code, floor, or where to leave the package"
                className={fieldClass(false)}
              />
            </div>
          </fieldset>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-neutral-900">Delivery location</p>
                <p className="text-[11px] text-neutral-500" aria-live="polite">
                  {locationMessage[location.status]}
                </p>
              </div>
              <button
                type="button"
                onClick={location.request}
                disabled={location.status === 'locating'}
                className="inline-flex items-center gap-1.5 rounded-full bg-neutral-950 px-4 py-2 text-[11px] font-semibold text-white hover:bg-neutral-800 cursor-pointer disabled:opacity-60"
              >
                <Crosshair className="w-3.5 h-3.5" />
                {location.status === 'locating' ? 'Locating…' : 'Use Current Location'}
              </button>
            </div>

            {pin && <DeliveryPinMap lat={pin.lat} lng={pin.lng} accuracy={pin.accuracy} onRemove={location.clear} />}

            <p className="text-[11px] text-neutral-500 inline-flex items-start gap-1">
              <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
              {geoHint
                ? `Approximate area from your network: ${geoHint}. It is only a suggestion and never used as the delivery address.`
                : 'Location suggestions are approximate — always check the address above.'}
            </p>
          </div>

          <div>
            <label htmlFor="chk-notes" className="block text-xs font-semibold text-neutral-800 mb-1.5">
              Order Notes <span className="font-normal text-neutral-500">(optional)</span>
            </label>
            <textarea
              id="chk-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Call me before delivery. Deliver to the main entrance. Please contact me when you arrive."
              className={fieldClass(false)}
            />
          </div>

          {user && (
            <label className="flex items-start gap-2 text-[11px] text-neutral-700 cursor-pointer">
              <input
                type="checkbox"
                checked={saveToProfile}
                onChange={(e) => setSaveToProfile(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Save this address to my profile for next time. Your saved name and phone stay unchanged.
              </span>
            </label>
          )}

          <div className="pt-2">
            <span className="block text-xs font-semibold text-neutral-800 mb-2">Payment Method</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <PaymentMethodCard
                name="Cash on Delivery"
                icon={<ShieldCheck className="w-5 h-5" />}
                selected={paymentMethod === 'Cash on Delivery'}
                onClick={() => setPaymentMethod('Cash on Delivery')}
              />
              <PaymentMethodCard
                name="Pay on Pickup"
                icon={<CheckCircle2 className="w-5 h-5" />}
                selected={paymentMethod === 'Pay on Pickup'}
                onClick={() => setPaymentMethod('Pay on Pickup')}
              />
              <PaymentMethodCard
                name="Airtel Money"
                icon={<AirtelMoneyIcon className="h-6 w-6" />}
                selected={paymentMethod === 'Airtel Money'}
                onClick={() => setPaymentMethod('Airtel Money')}
              />
              <PaymentMethodCard
                name="MTN Money"
                icon={<MtnMoneyIcon className="h-6 w-6" />}
                selected={paymentMethod === 'MTN Money'}
                onClick={() => setPaymentMethod('MTN Money')}
              />
              <PaymentMethodCard
                name="VISA"
                icon={<VisaIcon className="h-6 w-6" />}
                selected={paymentMethod === 'VISA'}
                onClick={() => setPaymentMethod('VISA')}
              />
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">
              Select a payment method. Mobile money and card options are shown for reference; order confirmation uses the method you pick here.
            </p>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-neutral-200/80 rounded-2xl p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-neutral-950">Order Review</h2>
          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {cart.map((item) => (
              <div key={`${item.productId}-${item.size}-${item.color}`} className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-neutral-100 overflow-hidden shrink-0">
                  <SafeImage src={item.productImage} alt={item.productName} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-neutral-950 truncate">{item.productName}</p>
                  <p className="text-[11px] text-neutral-500">
                    Size {item.size} · Qty {item.quantity}
                  </p>
                </div>
                <span className="font-mono-num text-xs font-semibold text-neutral-950">
                  {formatPrice(item.unitPrice * item.quantity, 'USD', currency)}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-neutral-200 space-y-2 text-xs">
            <div className="flex justify-between text-neutral-600">
              <span>{t('cart.subtotal')}</span>
              <span className="font-mono-num font-semibold text-neutral-950">
                {formatPrice(summary.subtotal, 'USD', currency)}
              </span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>{t('cart.shipping')}</span>
              <span className="font-mono-num font-semibold text-neutral-950">
                {summary.shippingFee === 0 ? t('cart.free') : `${formatPrice(summary.shippingFee, 'USD', currency)}`}
              </span>
            </div>
            <div className="pt-2 border-t border-neutral-200 flex justify-between text-sm font-bold text-neutral-950">
              <span>{t('cart.total')}</span>
              <span className="font-mono-num">{formatPrice(summary.total, 'USD', currency)}</span>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-neutral-900">Delivering to</p>
            <p className="text-[11px] text-neutral-700 leading-relaxed">
              {composedAddress || 'Add a delivery address on the left.'}
            </p>
            {pin && (
              <p className="text-[11px] font-mono-num text-neutral-600">
                Pin: {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
              </p>
            )}
            <label htmlFor="chk-confirm" className="flex items-start gap-2 text-[11px] font-semibold text-neutral-800 cursor-pointer">
              <input
                id="chk-confirm"
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                aria-invalid={Boolean(errors.confirmed)}
                aria-describedby={errors.confirmed ? 'chk-confirm-error' : undefined}
                className="mt-0.5"
              />
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> I confirm this delivery address is correct.
              </span>
            </label>
            <FieldError id="chk-confirm-error" message={errors.confirmed} />
          </div>

          <button
            type="submit"
            disabled={submitting || !confirmed}
            className="w-full py-3.5 px-5 rounded-full bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {submitting ? `${t('checkout.confirm')}...` : t('checkout.confirm')}
            {!submitting && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
          {!confirmed && (
            <p className="text-[11px] text-neutral-500 text-center">Confirm the delivery address to place your order.</p>
          )}
        </div>
      </form>
    </div>
  );
};
