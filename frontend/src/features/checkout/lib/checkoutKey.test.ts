import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKOUT_KEY_PATTERN, createCheckoutKey } from './checkoutKey';

test('checkout keys are unique and match the API validation pattern', () => {
  const keys = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    const key = createCheckoutKey();
    assert.match(key, CHECKOUT_KEY_PATTERN);
    keys.add(key);
  }
  assert.equal(keys.size, 50, 'every checkout must get its own key');
});
