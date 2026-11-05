import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
const { paidTier, withSubscriptionTier, runExclusive } = await import('./paid-tier.js');
const paid = [{ livemode: true, status: 'active', risk_hold: false, paid_until: '2099-01-01' }];

function mock(subs) {
  const native = fetch;
  globalThis.fetch = async url => Response.json(String(url).includes('sb_subscriptions') ? subs : [{ user_id: 'u1' }]);
  return () => { globalThis.fetch = native; };
}

test('only a live payment is Pro', async () => {
  let restore = mock([]);
  try { assert.equal(await paidTier(7), 'free'); } finally { restore(); }
  restore = mock(paid);
  try {
    assert.equal(await paidTier(7), 'pro');
    assert.equal((await withSubscriptionTier({ tier: 'free', user_id: 'u1' })).tier, 'pro');
    assert.equal((await withSubscriptionTier({ tier: 'owner', user_id: 'u1' })).tier, 'owner');
  } finally { restore(); }
});

test('a second job from the same person waits for no one and spends nothing', async () => {
  let release;
  const first = runExclusive(7, () => new Promise(resolve => { release = resolve; }), () => 'busy');
  assert.equal(await runExclusive(7, () => 'ran', () => 'busy'), 'busy');
  assert.equal(await runExclusive(8, () => 'ran', () => 'busy'), 'ran');
  release('done');
  assert.equal(await first, 'done');
  assert.equal(await runExclusive(7, () => 'ran', () => 'busy'), 'ran');
});
