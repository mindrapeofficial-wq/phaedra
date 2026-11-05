import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_OWNER_ID = '1';
const { imageLiteDenial, imageLiteAllowance, wantsLite } = await import('./image-lite.js');

function mock(used, subs = []) {
  const native = fetch, urls = [];
  globalThis.fetch = async url => {
    url = String(url);
    if (url.includes('sb_telegram_users')) return Response.json([{ user_id: 'u1' }]);
    if (url.includes('sb_subscriptions')) return Response.json(subs);
    urls.push(url);
    return Response.json(Array.from({ length: used }, () => ({})));
  };
  return { urls, restore: () => { globalThis.fetch = native; } };
}
const paid = [{ livemode: true, status: 'active', risk_hold: false, paid_until: '2099-01-01' }];

test('only the word Lite selects it', () => {
  assert.ok(wantsLite('hazla lite') && wantsLite('LITE'));
  assert.equal(wantsLite('elite satellite'), false);
  assert.deepEqual(imageLiteAllowance(false), { count: 5, monthly: false });
});

test('free accounts have 5 in total', async () => {
  const within = mock(4);
  try { assert.equal(await imageLiteDenial(7), null); assert.equal(within.urls[0].includes('created_at'), false); } finally { within.restore(); }
  const over = mock(5);
  try { assert.match(await imageLiteDenial(7), /gratuitas/); } finally { over.restore(); }
});

test('paid accounts have 25 a month and the owner has no limit', async () => {
  const over = mock(25, paid);
  try { assert.match(await imageLiteDenial(7), /este mes/); assert.ok(over.urls[0].includes('created_at')); assert.equal(await imageLiteDenial(1), null); } finally { over.restore(); }
});
