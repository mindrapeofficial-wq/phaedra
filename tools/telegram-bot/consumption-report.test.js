import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_OWNER_ID = '1';
const { buildConsumptionReport, sendConsumptionReport } = await import('./consumption-report.js');

const now = Date.parse('2026-11-05T12:00:00Z');
const at = hours => new Date(now - hours * 3600_000).toISOString();

test('each user is listed apart, with the last 2 hours and today', () => {
  const report = buildConsumptionReport([
    { telegram_id: 7, action: 'image', created_at: at(1) },
    { telegram_id: 7, action: 'chat', created_at: at(1) },
    { telegram_id: 7, action: 'stems', created_at: at(5) },
    { telegram_id: 8, action: 'music_lite', created_at: at(1) },
    { telegram_id: 1, action: 'image', created_at: at(1) },
  ], new Map([[7, '@ana']]), now);
  assert.match(report, /@ana: 0,27 \$\n• imágenes PRO: 1 \(0,25 \$\)\n• mensajes: 1 \(0,02 \$\)\nHoy en total: 0,77 \$/);
  assert.match(report, /Usuario 8: 0,15 \$/);
  assert.match(report, /Total: 0,42 \$/);
  assert.equal(report.includes('Usuario 1'), false);
});

test('quiet periods and free commands produce no report', () => {
  assert.equal(buildConsumptionReport([{ telegram_id: 7, action: 'image', created_at: at(3) }, { telegram_id: 7, action: 'claim', created_at: at(1) }], new Map(), now), null);
});

test('it runs once every 2 hours and goes only to the owner', async () => {
  const native = fetch, sent = [];
  globalThis.fetch = async (url, options = {}) => {
    url = String(url);
    if (url.endsWith('/sendMessage')) { sent.push(JSON.parse(options.body)); return Response.json({ ok: true }); }
    if (url.includes('sb_usage_events')) return Response.json([{ telegram_id: 7, action: 'chat', created_at: at(1) }]);
    return Response.json([]);
  };
  try {
    const state = {};
    assert.equal(await sendConsumptionReport(state, now), true);
    assert.equal(await sendConsumptionReport(state, now + 3600_000), false);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].chat_id, 1);
  } finally { globalThis.fetch = native; }
});
