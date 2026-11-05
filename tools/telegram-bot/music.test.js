import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_OWNER_ID = '1';
const { generateMusic, musicAllowance } = await import('./music.js');

function mock({ subs = [], used = [], status = 200 } = {}) {
  const native = fetch, bodies = [], urls = [];
  globalThis.fetch = async (url, options = {}) => {
    url = String(url);
    if (url.includes('elevenlabs')) { bodies.push(JSON.parse(options.body)); return new Response('mp3', { status }); }
    if (url.includes('sb_telegram_users')) return Response.json([{ user_id: 'u1' }]);
    if (url.includes('sb_subscriptions')) return Response.json(subs);
    if (url.includes('sb_usage_events') && options.method !== 'POST') { urls.push(url); return Response.json(used.filter(row => url.includes(row.action))); }
    return new Response('');
  };
  return { bodies, urls, restore: () => { globalThis.fetch = native; } };
}
const paid = [{ livemode: true, status: 'active', risk_hold: false, paid_until: '2099-01-01' }];
const events = (action, n) => Array.from({ length: n }, () => ({ action }));
const pro = { use: 'to rap over', references: 'heavy 808s', avoid: 'none', genre: 'trap', mood: 'dark', bpm: '140', key: 'A minor', instruments: '808', structure: 'intro, drop', seconds: 170, vocals: false, confirmed: true };
const lite = { genre: 'trap', mood: 'sad' };

test('without a key nothing is sent', async () => {
  delete process.env.ELEVENLABS_API_KEY;
  const { bodies, restore } = mock();
  try {
    assert.match((await generateMusic({ userId: 1, quality: 'lite', brief: lite })).denied, /no está activada/);
    assert.equal(bodies.length, 0);
  } finally { restore(); }
});

test('allowances: free 1 PRO and 5 Lite in total; paid 5 PRO and 25 Lite per month', () => {
  assert.deepEqual(musicAllowance(false), { pro: 1, lite: 5, monthly: false });
  assert.deepEqual(musicAllowance(true), { pro: 5, lite: 25, monthly: true });
});

test('free accounts can use both tiers until each limit, and old beats are not time-limited', async () => {
  process.env.ELEVENLABS_API_KEY = 'k';
  const ok = mock();
  try {
    assert.ok((await generateMusic({ userId: 7, quality: 'lite', brief: lite })).audio);
    assert.ok((await generateMusic({ userId: 7, quality: 'pro', brief: pro })).audio);
    assert.equal(ok.urls.some(url => url.includes('created_at')), false);
  } finally { ok.restore(); }
  const spentPro = mock({ used: events('music_pro', 1) });
  try {
    assert.match((await generateMusic({ userId: 7, quality: 'pro', brief: pro })).denied, /PRO gratuita/);
    assert.equal(spentPro.bodies.length, 0);
    assert.ok((await generateMusic({ userId: 7, quality: 'lite', brief: lite })).audio);
  } finally { spentPro.restore(); }
  const spentLite = mock({ used: events('music_lite', 5) });
  try { assert.match((await generateMusic({ userId: 7, quality: 'lite', brief: lite })).denied, /Lite gratuitas/); }
  finally { spentLite.restore(); }
});

test('paid accounts have monthly limits', async () => {
  process.env.ELEVENLABS_API_KEY = 'k';
  const within = mock({ subs: paid, used: events('music_pro', 4) });
  try {
    assert.ok((await generateMusic({ userId: 7, quality: 'pro', brief: pro })).audio);
    assert.ok(within.urls.every(url => url.includes('created_at')));
  } finally { within.restore(); }
  const over = mock({ subs: paid, used: events('music_lite', 25) });
  try { assert.match((await generateMusic({ userId: 7, quality: 'lite', brief: lite })).denied, /este mes/); }
  finally { over.restore(); }
});

test('Lite asks only style and mood, is instrumental and at most a minute', async () => {
  process.env.ELEVENLABS_API_KEY = 'k';
  const { bodies, restore } = mock();
  try {
    assert.deepEqual((await generateMusic({ userId: 1, quality: 'lite', brief: { genre: 'trap' } })).needsBrief, ['ambiente o emoción']);
    await generateMusic({ userId: 1, quality: 'lite', brief: { ...lite, seconds: 170, vocals: true } });
    assert.equal(bodies[0].music_length_ms, 60000);
    assert.equal(bodies[0].force_instrumental, true);
  } finally { restore(); }
});

test('PRO needs the full brief and a confirmation before any spend', async () => {
  process.env.ELEVENLABS_API_KEY = 'k';
  const { bodies, restore } = mock();
  try {
    const partial = await generateMusic({ userId: 1, quality: 'pro', brief: { genre: 'trap' } });
    assert.ok(partial.needsBrief.includes('BPM'));
    assert.ok(partial.needsBrief.includes('para qué es la pista'));
    assert.ok(partial.needsBrief.includes('si lleva voz o es instrumental'));
    const unconfirmed = await generateMusic({ userId: 1, quality: 'pro', brief: { ...pro, confirmed: false } });
    assert.equal(unconfirmed.needsConfirmation, true);
    assert.equal(bodies.length, 0);
    await generateMusic({ userId: 1, quality: 'pro', brief: pro });
    assert.equal(bodies[0].music_length_ms, 170000);
  } finally { restore(); }
});

test('an unspecified tier asks the user to choose, and errors are reported', async () => {
  process.env.ELEVENLABS_API_KEY = 'k';
  const none = mock();
  try { assert.equal((await generateMusic({ userId: 7, brief: lite })).needsQuality, true); } finally { none.restore(); }
  const failing = mock({ status: 402 });
  const error = console.error; console.error = () => {};
  try { assert.match((await generateMusic({ userId: 1, quality: 'lite', brief: lite })).error, /402/); }
  finally { console.error = error; failing.restore(); }
});
