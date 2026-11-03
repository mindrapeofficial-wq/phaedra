import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
const { claimReferral, referralSummary, REFERRAL_NOTE } = await import('./referrals.js');

function mockDatabase(handler) {
  const native = fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('sb_telegram_users')) return Response.json([{ telegram_id: 7, tier: 'free' }]);
    return handler(String(url), options);
  };
  return () => { globalThis.fetch = native; };
}

test('a referral link is shown with real counts and without promising a reward today', async () => {
  const restore = mockDatabase(url => {
    if (url.includes('on_conflict')) return new Response('', { status: 201 });
    if (url.includes('sb_referral_codes')) return Response.json([{ code: 'abcdef0123' }]);
    return Response.json([{ status: 'pending' }, { status: 'pending' }, { status: 'qualified' }]);
  });
  try {
    const text = await referralSummary(7);
    assert.match(text, /start=ref_abcdef0123/);
    assert.match(text, /Invitados: 2/);
    assert.match(text, /pendiente de aplicar: 1/);
    assert.match(text, /todavía no se puede ganar/);
  } finally { restore(); }
});

test('each referral claim result gets its own reply', async () => {
  for (const [result, expected] of [['recorded', /registrado/], ['self', /es tuyo/], ['already_referred', /primera/], ['existing_customer', /ya tiene/], ['unknown', /no es válido/]]) {
    const restore = mockDatabase(() => Response.json(result));
    try { assert.match(await claimReferral('abcdef0123', 7), expected); } finally { restore(); }
  }
});

test('the free-plan note states the offer and that payments are not live', () => {
  assert.match(REFERRAL_NOTE, /1 mes gratis/);
  assert.match(REFERRAL_NOTE, /aún no están activos/);
});
