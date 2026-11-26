import test from 'node:test';
import assert from 'node:assert/strict';
import { composeDeliveryAddress, hasPin } from './address';

test('composeDeliveryAddress joins populated parts in display order', () => {
  assert.equal(
    composeDeliveryAddress({
      country: 'RW',
      city: 'Kigali',
      district: 'Gasabo',
      street: 'KG 11 Ave',
      building: 'Apt 4B',
    }),
    'KG 11 Ave, Apt 4B, Gasabo, Kigali, RW',
  );
});

test('composeDeliveryAddress skips blanks and matches the server OneLine output', () => {
  assert.equal(
    composeDeliveryAddress({ country: 'RW', city: 'Kigali', street: ' KG 11 Ave ', district: '' }),
    'KG 11 Ave, Kigali, RW',
  );
  assert.equal(composeDeliveryAddress(null), '');
  assert.equal(composeDeliveryAddress(undefined), '');
});

test('hasPin requires finite numeric coordinates', () => {
  assert.equal(hasPin({ country: 'RW', city: 'Kigali', street: 'KG 11 Ave', latitude: -1.94, longitude: 30.06 }), true);
  assert.equal(hasPin({ country: 'RW', city: 'Kigali', street: 'KG 11 Ave' }), false);
  assert.equal(
    hasPin({ country: 'RW', city: 'Kigali', street: 'KG 11 Ave', latitude: Number.NaN, longitude: 30.06 }),
    false,
  );
});
