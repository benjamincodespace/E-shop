/**
 * Reverse geocoding for the checkout delivery form.
 *
 * A GPS pin is only useful once it becomes an address the customer recognises,
 * so three free, key-less providers are merged and the most precise value wins:
 *
 *  1. Nominatim (OpenStreetMap) — house number + road, and the administrative
 *     district ("Nyarugenge District"). It is the most accurate source, but it
 *     blocks non-browser agents, so it is treated as optional.
 *  2. Photon (komoot, also OSM data) — street and named places, CORS-friendly
 *     and reliable, used for the street/building when Nominatim has none.
 *  3. BigDataCloud — city plus the district from its administrative levels,
 *     used when the OSM services have no match for the area.
 *
 * Every value returned here is only a starting point: the customer can edit
 * all four fields before placing the order.
 */

export interface ReverseGeocodedAddress {
  /** ISO 3166-1 alpha-2 country code, e.g. "RW". */
  country?: string;
  city?: string;
  district?: string;
  street?: string;
  building?: string;
  source: 'osm' | 'photon' | 'bigdatacloud';
}

interface NominatimAddress {
  [key: string]: string | undefined;
}

interface NominatimResponse {
  name?: string;
  display_name?: string;
  address?: NominatimAddress;
}

interface PhotonProperties {
  name?: string;
  street?: string;
  housenumber?: string;
  district?: string;
  city?: string;
  state?: string;
  countrycode?: string;
  type?: string;
}

interface PhotonResponse {
  features?: { properties?: PhotonProperties }[];
}

interface BigDataCloudResponse {
  countryCode?: string;
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  localityInfo?: { administrative?: { name?: string; adminLevel?: number }[] };
}

const FIRST_REQUEST_TIMEOUT_MS = 8000;
const FALLBACK_TIMEOUT_MS = 6000;

const clean = (value?: string | null): string => (value ?? '').replace(/\s+/g, ' ').trim();

function firstOf(values: (string | undefined)[]): string {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned) return cleaned;
  }
  return '';
}

async function getJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      referrerPolicy: 'strict-origin-when-cross-origin',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function mapNominatim(data: NominatimResponse): ReverseGeocodedAddress {
  const a = data.address ?? {};
  const city = firstOf([a.city, a.town, a.village, a.municipality, a.hamlet, a.city_district, a.suburb]);
  const district = firstOf([
    a.city_district,
    a.district,
    a.state_district,
    a.county,
    a.suburb,
    a.neighbourhood,
    a.quarter,
    a.borough,
  ]);
  const road = firstOf([a.road, a.pedestrian, a.footway, a.residential, a.path, a.square, a.avenue]);
  // Only a real road counts as a street here. A neighbourhood or place name
  // would read like a street but send the courier to the wrong spot, so those
  // are left for the Photon pass or for the customer to type.
  const street = clean([clean(a.house_number), road].filter(Boolean).join(' '));
  const namedPlace = firstOf([a.building, a.house_name, a.amenity, a.shop, a.office, a.tourism, a.industrial]);
  // A street name is not a building, even when OSM reuses it for both.
  const building = namedPlace && namedPlace !== street ? namedPlace : '';

  return {
    country: clean(a.country_code).toUpperCase(),
    city,
    district,
    street,
    building,
    source: 'osm',
  };
}

function mapPhoton(data: PhotonResponse): ReverseGeocodedAddress {
  const p = data.features?.[0]?.properties ?? {};
  const isStreet = p.type === 'street';
  const street = clean([clean(p.housenumber), clean(p.street)].filter(Boolean).join(' ')) ||
    (isStreet ? clean(p.name) : '');
  // Named places (a building, school, shop…) are a useful building hint.
  const building = !isStreet && p.type !== 'city' && p.type !== 'district' && p.type !== 'locality' && p.type !== 'state'
    ? clean(p.name)
    : '';

  return {
    country: clean(p.countrycode).toUpperCase(),
    city: clean(p.city),
    district: clean(p.district),
    street,
    building,
    source: 'photon',
  };
}

function mapBigDataCloud(data: BigDataCloudResponse): ReverseGeocodedAddress {
  const admin = data.localityInfo?.administrative ?? [];
  // adminLevel 6 is the district level in Rwanda, Kenya, Uganda and Tanzania.
  const districtLevel = admin.filter((entry) => entry.adminLevel === 6).map((entry) => entry.name);

  return {
    country: clean(data.countryCode).toUpperCase(),
    city: firstOf([data.city, data.locality]),
    district: firstOf([...districtLevel, data.principalSubdivision]),
    street: '',
    building: '',
    source: 'bigdatacloud',
  };
}

function dropEmpty(address: ReverseGeocodedAddress): ReverseGeocodedAddress {
  const next: ReverseGeocodedAddress = { source: address.source };
  if (address.country) next.country = address.country;
  if (address.city) next.city = address.city;
  if (address.district) next.district = address.district;
  if (address.street) next.street = address.street;
  if (address.building) next.building = address.building;
  return next;
}

/**
 * Resolves a pin to an address. Resolves to null when no provider knows the
 * place, so the caller can fall back to manual entry.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodedAddress | null> {
  const language = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en';
  const region = language.split('-')[0] || 'en';

  const osmUrl =
    'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&layer=address&zoom=18' +
    `&lat=${lat.toFixed(7)}&lon=${lng.toFixed(7)}` +
    `&accept-language=${encodeURIComponent(language)}`;
  const photonUrl =
    `https://photon.komoot.io/reverse?lat=${lat.toFixed(7)}&lon=${lng.toFixed(7)}` +
    `&lang=${encodeURIComponent(region)}&limit=1`;

  // Street-level providers run together; each is allowed to fail on its own.
  const [osmData, photonData] = await Promise.all([
    getJson<NominatimResponse>(osmUrl, FIRST_REQUEST_TIMEOUT_MS),
    getJson<PhotonResponse>(photonUrl, FIRST_REQUEST_TIMEOUT_MS),
  ]);

  const fromOsm = osmData ? mapNominatim(osmData) : null;
  const fromPhoton = photonData ? mapPhoton(photonData) : null;

  let merged = dropEmpty({
    country: fromOsm?.country || fromPhoton?.country,
    // Photon returns the familiar city name ("Kigali"); Nominatim's may be the
    // province ("City of Kigali"), so it is the last choice here.
    city: fromPhoton?.city || fromOsm?.city,
    // The administrative district is the detail customers usually get wrong,
    // so Nominatim's structured district wins when it has one.
    district: fromOsm?.district || fromPhoton?.district,
    street: fromOsm?.street || fromPhoton?.street,
    building: fromOsm?.building || fromPhoton?.building,
    source: fromOsm ? 'osm' : 'photon',
  });

  if (!merged.district || !merged.city || !merged.street) {
    const bdcUrl =
      'https://api.bigdatacloud.net/data/reverse-geocode-client' +
      `?latitude=${lat}&longitude=${lng}&localityLanguage=${encodeURIComponent(region)}`;
    const bdcData = await getJson<BigDataCloudResponse>(bdcUrl, FALLBACK_TIMEOUT_MS);
    const fromBdc = bdcData ? mapBigDataCloud(bdcData) : null;
    if (fromBdc) {
      merged = dropEmpty({
        ...merged,
        country: merged.country || fromBdc.country,
        city: merged.city || fromBdc.city,
        district: merged.district || fromBdc.district,
        street: merged.street || fromBdc.street,
        building: merged.building || fromBdc.building,
      });
    }
  }

  if (!merged.city && !merged.district && !merged.street) return null;
  return merged;
}
