import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_OWNER_ID = '1';
const { generateMusic, clampSeconds } = await import('./music.js');

function mock(routes = {}) {
  const native = fetch, bodies = [];
  globalThis.fetch = async (url, options = {}) => {
    url = String(url);
    if (url.includes('elevenlabs')) { bodies.push(JSON.parse(options.body)); return new Response('mp3', { status: routes.status || 200 }); }
    if (url.includes('sb_telegram_users')) return Response.json([{ user_id: 'u1' }]);
    if (url.includes('sb_subscriptions')) return Response.json(routes.subs || []);
    if (url.includes('sb_usage_events') && options.method !== 'POST') return Response.json(routes.used || []);
    return new Response('');
  };
  return { bodies, restore: () => { globalThis.fetch = native; } };
}
const paid = [{ livemode: true, status: 'active', risk_hold: false, paid_until: '2099-01-01' }];

test('without a key nothing is sent to the provider', async () => {
  delete process.env.ELEVENLABS_API_KEY;
  const { bodies, restore } = mock();
  try {
    assert.match((await generateMusic({ userId: 1, prompt: 'trap' })).denied, /no está activada/);
    assert.equal(bodies.length, 0);
  } finally { restore(); }
});

test('the owner gets an instrumental track by default', async () => {
  process.env.ELEVENLABS_API_KEY = 'k';
  const { bodies, restore } = mock();
  try {
    const result = await generateMusic({ userId: 1, prompt: 'trap oscuro', seconds: 120 });
    assert.ok(result.audio);
    assert.equal(bodies[0].force_instrumental, true);
    assert.equal(bodies[0].music_length_ms, 120000);
    assert.equal(bodies[0].model_id, 'music_v2_5');
  } finally { restore(); }
});

test('free accounts are refused and paid accounts have a monthly quota', async () => {
  process.env.ELEVENLABS_API_KEY = 'k';
  const free = mock();
  try {
    assert.match((await generateMusic({ userId: 7, prompt: 'x' })).denied, /suscripción/);
    assert.equal(free.bodies.length, 0);
  } finally { free.restore(); }
  const within = mock({ subs: paid, used: [{}, {}] });
  try { assert.ok((await generateMusic({ userId: 7, prompt: 'x' })).audio); } finally { within.restore(); }
  const over = mock({ subs: paid, used: [{}, {}, {}, {}, {}] });
  try {
    assert.match((await generateMusic({ userId: 7, prompt: 'x' })).denied, /este mes/);
    assert.equal(over.bodies.length, 0);
  } finally { over.restore(); }
});

test('provider errors are reported and lengths are bounded', async () => {
  process.env.ELEVENLABS_API_KEY = 'k';
  const { restore } = mock({ status: 402 });
  const error = console.error; console.error = () => {};
  try { assert.match((await generateMusic({ userId: 1, prompt: 'x' })).error, /402/); }
  finally { console.error = error; restore(); }
  assert.equal(clampSeconds(5), 15);
  assert.equal(clampSeconds(9999), 180);
  assert.equal(clampSeconds(undefined), 90);
});
