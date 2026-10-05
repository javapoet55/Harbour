import { addressZip, fullAddress, mapsUrl, storeAddress } from '../storeAddress';

/** Port of ios/Tests/NexdoCoreTests/ShoppingStoreAddressTests.swift. */

test('US address lines', () => {
  const value = storeAddress('3150 Fostoria Way #21b, Danville, CA 94526, USA', '94526');
  expect(value.street).toBe('3150 Fostoria Way #21b');
  expect(value.locality).toBe('Danville, CA 94526');
  expect(addressZip(value)).toBe('94526');
});

test('keeps the suite and a legacy city', () => {
  expect(storeAddress('123 Main St, Suite 4, San Ramon, CA 94582, USA', '94582').street).toBe('123 Main St, Suite 4');
  expect(storeAddress('Danville, CA', '94526').locality).toBe('Danville, CA 94526');
});

test('a partial manual address survives reopening', () => {
  const value = storeAddress('123 Main St, 94582', '94582');
  expect(value.street).toBe('123 Main St');
  expect(value.locality).toBe('94582');
  expect(fullAddress(value)).toBe('123 Main St, 94582');
});

test('the map destination includes the branch and escapes names', () => {
  const url = mapsUrl({ name: 'A & B', address: '1 Main St', placeId: 'abc', directions: true })!;
  const query = new URLSearchParams(url.split('?')[1]);
  expect(url.startsWith('https://www.google.com/maps/dir/?')).toBe(true);
  expect(query.get('destination')).toBe('A & B, 1 Main St');
  expect(query.get('destination_place_id')).toBe('abc');
  expect(mapsUrl({ name: 'Store', address: null, placeId: null, directions: false })).toBe('https://www.google.com/maps/search/?api=1&query=Store');
  expect(mapsUrl({ name: '', address: '', placeId: 'abc', directions: false })).toBeNull();
});
