/**
 * `ShoppingStoreAddress` (ios/Sources/NexdoCore/ShoppingStoreAddress.swift): "Keeps the existing
 * full-address persistence format while displaying two lines."
 */

export type ShoppingStoreAddress = { street: string; locality: string };

const COUNTRY = ['usa', 'us', 'united states', 'united states of america'];

/** `init(address:zip:)`. */
export function storeAddress(address: string | null | undefined, zip: string | null | undefined): ShoppingStoreAddress {
  const parts = (address ?? '').split(',').map((part) => part.trim());
  if (parts.length > 0 && COUNTRY.includes(parts[parts.length - 1].toLowerCase())) parts.pop();
  let street: string;
  let locality: string;
  // US formatted addresses end with city, state ZIP. Keep commas in street/unit.
  if (parts.length >= 3) {
    street = parts.slice(0, -2).join(', ');
    locality = parts.slice(-2).join(', ');
  } else if (parts.length === 2 && /^\d/.test(parts[0])) {
    street = parts[0];
    locality = parts[1];
  } else {
    street = parts.length === 1 ? parts[0] : '';
    locality = parts.length === 2 ? parts.join(', ') : '';
  }
  if (zip && !locality.includes(zip)) locality += locality === '' ? zip : ` ${zip}`;
  return { street, locality };
}

/** `fullAddress`. */
export function fullAddress(value: ShoppingStoreAddress): string {
  return [value.street, value.locality].filter((part) => part !== '').join(', ');
}

/** `zip`: a trailing US ZIP or ZIP+4 in the locality, else "". */
export function addressZip(value: ShoppingStoreAddress): string {
  return /\b\d{5}(?:-\d{4})?\s*$/.exec(value.locality)?.[0].trim() ?? '';
}

/**
 * `mapsURL(name:address:placeID:directions:)`: a Google Maps search or directions link to "name,
 * address", with the place id when known. `null` when there is nothing to search for.
 */
export function mapsUrl({ name, address, placeId, directions }: { name?: string | null; address?: string | null; placeId?: string | null; directions: boolean }): string | null {
  const destination = [name, address].filter((part): part is string => typeof part === 'string' && part !== '').join(', ');
  if (destination === '') return null;
  const params: [string, string][] = [
    ['api', '1'],
    [directions ? 'destination' : 'query', destination],
  ];
  if (placeId) params.push([directions ? 'destination_place_id' : 'query_place_id', placeId]);
  const query = params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return `${directions ? 'https://www.google.com/maps/dir/' : 'https://www.google.com/maps/search/'}?${query}`;
}

