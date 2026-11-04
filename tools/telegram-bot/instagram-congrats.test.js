import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_OWNER_ID = '1';
process.env.TELEGRAM_GROUP_CHAT_ID = '-5';
const { congratulateInstagramConnection } = await import('./instagram-congrats.js');

test('congratulates once in the group, by Telegram name, and never the owner', async () => {
  const native = fetch, sent = [];
  let state = null;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/sendMessage')) { sent.push(JSON.parse(options.body)); return Response.json({ ok: true }); }
    if (options.method === 'POST') { state = JSON.parse(options.body).state; return new Response(null, { status: 204 }); }
    return Response.json(state ? [{ state }] : []);
  };
  try {
    assert.equal(await congratulateInstagramConnection(7, { id: 7, first_name: 'Ana' }), true);
    assert.equal(await congratulateInstagramConnection(7, { id: 7, first_name: 'Ana' }), false);
    assert.equal(await congratulateInstagramConnection(1, { id: 1, first_name: 'Owner' }), false);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].chat_id, '-5');
    assert.match(sent[0].text, /Ana/);
  } finally { globalThis.fetch = native; }
});
