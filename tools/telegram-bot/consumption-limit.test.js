import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_OWNER_ID = '1';
const { percentUsed, levelFor, noticeFor, consumptionLimit, notifyConsumption, consumptionGate } = await import('./consumption-limit.js');
const now = Date.parse('2026-11-20T12:00:00Z');

function mock(rows, state = {}) {
  const native = fetch, log = { sent: [], saved: null, urls: [] };
  globalThis.fetch = async (url, options = {}) => {
    url = String(url);
    if (url.endsWith('/sendMessage')) { log.sent.push(JSON.parse(options.body).text); return Response.json({ ok: true }); }
    if (url.includes('sb_usage_events')) { log.urls.push(url); return Response.json(rows); }
    if (options.method === 'POST') { log.saved = JSON.parse(options.body).state; return new Response(''); }
    return Response.json([{ state }]);
  };
  return { log, restore: () => { globalThis.fetch = native; } };
}
const images = n => Array.from({ length: n }, () => ({ action: 'image' }));

test('limits and percentages', () => {
  assert.equal(consumptionLimit('free'), 1);
  assert.equal(consumptionLimit('pro'), 8);
  assert.equal(percentUsed(images(2), 'free'), 50);
  assert.equal(percentUsed(images(4), 'pro'), 12);
  assert.equal(levelFor(24), 0);
  assert.equal(levelFor(80), 75);
});

test('notices speak in percentages, never money', () => {
  for (const level of [25, 50, 75, 100]) {
    assert.match(noticeFor(level), new RegExp(`${level}%`));
    assert.doesNotMatch(noticeFor(level), /€|\$|euro/i);
  }
});

test('each level is announced once and only the highest one reached', async () => {
  const first = mock(images(3));
  try {
    await notifyConsumption(7, 'free', now);
    assert.deepEqual(first.log.sent, [noticeFor(75)]);
    assert.equal(first.log.saved.consumptionNotice.level, 75);
  } finally { first.restore(); }
  const again = mock(images(3), { consumptionNotice: { period: 'total', level: 75 } });
  try { await notifyConsumption(7, 'free', now); assert.equal(again.log.sent.length, 0); } finally { again.restore(); }
});

test('free spending is cumulative, Pro restarts each month', async () => {
  const free = mock([]);
  try { await notifyConsumption(7, 'free', now); assert.ok(free.log.urls[0].includes('2026-11-05T10:40')); } finally { free.restore(); }
  const pro = mock([]);
  try { await notifyConsumption(7, 'pro', Date.parse('2026-12-20T12:00:00Z')); assert.ok(pro.log.urls[0].includes('2026-12-01')); } finally { pro.restore(); }
});

test('100% blocks and warns, the owner is exempt', async () => {
  const full = mock(images(4));
  try {
    assert.match(await consumptionGate(7, now), /100%/);
    assert.deepEqual(full.log.sent, [noticeFor(100)]);
    assert.equal(await consumptionGate(1, now), null);
  } finally { full.restore(); }
});

test('an unreadable limit stops the request', async () => {
  const native = fetch, error = console.error;
  globalThis.fetch = async () => new Response('', { status: 500 });
  console.error = () => {};
  try { assert.match(await consumptionGate(7, now), /no puedo comprobar/); }
  finally { globalThis.fetch = native; console.error = error; }
});

test('a promotion does not raise the limit: without a payment 1 € applies', async () => {
  const free = mock(images(4));
  try { assert.match(await consumptionGate(7, now), /100%/); } finally { free.restore(); }
});
