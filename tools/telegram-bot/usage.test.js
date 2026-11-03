import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_OWNER_ID = '1';
process.env.TELEGRAM_GROUP_CHAT_ID = '-5';
const { notifyAction, withUsageContext, costOf, summarize, flushChatNotices, runUsageTick } = await import('./usage.js');

function capture(rows = []) {
  const native = fetch, sent = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/sendMessage')) { sent.push(JSON.parse(options.body)); return Response.json({ ok: true }); }
    if (options.method === 'POST') return new Response('');
    return Response.json(rows);
  };
  return { sent, restore: () => { globalThis.fetch = native; } };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

test('private actions notify the owner by name and the group anonymously, without content', async () => {
  const { sent, restore } = capture();
  try {
    withUsageContext({ userId: 7, username: 'ana', isPrivate: true }, () => notifyAction('image'));
    await settle();
    assert.match(sent.find(m => m.chat_id === 1).text, /@ana generó una imagen PRO/);
    const group = sent.find(m => m.chat_id === '-5').text;
    assert.match(group, /Alguien/);
    assert.doesNotMatch(group, /@ana/);
  } finally { restore(); }
});

test('the owner and group chats generate no notices', async () => {
  const { sent, restore } = capture();
  try {
    withUsageContext({ userId: 1, isPrivate: true }, () => notifyAction('referral'));
    withUsageContext({ userId: 7, isPrivate: false }, () => notifyAction('referral'));
    await settle();
    assert.equal(sent.length, 0);
  } finally { restore(); }
});

test('chat messages are grouped instead of notified one by one', async () => {
  const { sent, restore } = capture();
  try {
    withUsageContext({ userId: 8, username: 'leo', isPrivate: true }, () => { notifyAction('chat'); notifyAction('chat'); });
    await settle();
    assert.equal(sent.length, 0);
    await flushChatNotices(Date.now() + 11 * 60_000);
    assert.match(sent[0].text, /@leo: 2 mensajes/);
  } finally { restore(); }
});

test('costs use published prices and unknown models add nothing', () => {
  assert.equal(costOf('gpt-4.1', 1_000_000, 1_000_000), 10);
  assert.equal(costOf('claude-opus-5-5', 1_000_000, 1_000_000), 24);
  assert.equal(costOf('other', 1_000_000, 1_000_000), 0);
  const s = summarize([{ telegram_id: 7, action: 'image', images: 1 }, { telegram_id: 7, action: 'ai_tokens', model: 'gpt-4.1', input_tokens: 1000, output_tokens: 0 }]);
  assert.equal(s.images, 1);
  assert.equal(s.users.size, 1);
  assert.equal(s.actions.has('ai_tokens'), false);
});

test('the spend alert fires once a day', async () => {
  const rows = Array.from({ length: 20 }, () => ({ telegram_id: 7, action: 'image', images: 1 }));
  const { sent, restore } = capture(rows);
  const now = Date.parse('2026-11-03T12:00:00Z');
  try {
    const state = {};
    await runUsageTick(state, now);
    await runUsageTick(state, now + 11 * 60_000);
    assert.equal(sent.filter(m => /Alerta de gasto/.test(m.text)).length, 1);
  } finally { restore(); }
});
