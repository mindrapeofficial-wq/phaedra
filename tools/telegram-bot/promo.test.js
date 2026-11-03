import test from 'node:test';
import assert from 'node:assert/strict';
import { withPromoTier, proPromoActive } from './promo.js';

const during = Date.parse('2026-11-05T12:00:00Z');
const after = Date.parse('2026-11-06T12:30:00Z');

test('free users are Pro only until the promotion ends', () => {
  assert.equal(withPromoTier({ tier: 'free' }, during).tier, 'pro');
  assert.equal(withPromoTier({ tier: 'free' }, after).tier, 'free');
  assert.equal(proPromoActive(after), false);
});

test('the promotion never changes an owner', () => {
  assert.equal(withPromoTier({ tier: 'owner' }, during).tier, 'owner');
});
