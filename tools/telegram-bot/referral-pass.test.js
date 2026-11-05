import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
const { passUntil, withReferralPass } = await import('./referral-pass.js');

const t0 = Date.parse('2026-11-05T10:00:00Z'), hour = 3600_000;
const row = (claimed, joined = claimed, status = 'pending') => ({ status, created_at: new Date(claimed).toISOString(), referred: { created_at: new Date(joined).toISOString() } });

test('one new invited user gives one day', () => {
  assert.equal(passUntil([row(t0)]), t0 + 24 * hour);
});

test('invitations add up and separate ones do not overlap', () => {
  assert.equal(passUntil([row(t0), row(t0 + hour)]), t0 + 48 * hour);
  assert.equal(passUntil([row(t0), row(t0 + 72 * hour)]), t0 + 96 * hour);
});

test('existing users and voided referrals give nothing', () => {
  assert.equal(passUntil([row(t0, t0 - 48 * hour)]), 0);
  assert.equal(passUntil([row(t0, t0, 'void')]), 0);
});

test('the tier only rises for free users while the pass lasts, and fails closed', async () => {
  const native = fetch;
  globalThis.fetch = async () => Response.json([row(t0)]);
  try {
    assert.equal((await withReferralPass({ telegram_id: 7, tier: 'free' }, t0 + hour)).tier, 'pro');
    assert.equal((await withReferralPass({ telegram_id: 7, tier: 'free' }, t0 + 25 * hour)).tier, 'free');
    assert.equal((await withReferralPass({ telegram_id: 7, tier: 'owner' }, t0 + hour)).tier, 'owner');
    globalThis.fetch = async () => new Response('', { status: 500 });
    const error = console.error; console.error = () => {};
    try { assert.equal((await withReferralPass({ telegram_id: 7, tier: 'free' }, t0 + hour)).tier, 'free'); } finally { console.error = error; }
  } finally { globalThis.fetch = native; }
});
