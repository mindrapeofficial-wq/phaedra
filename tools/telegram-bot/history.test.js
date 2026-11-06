import test from 'node:test';
import assert from 'node:assert/strict';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_OWNER_ID = '1';
const { compactHistory, RECENT_MESSAGES } = await import('./history.js');
const { chat } = await import('./ai.js');

const turns = count => Array.from({ length: count }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `mensaje ${i} ${'x'.repeat(300)}` }));

test('only the latest turns travel verbatim and older ones become a bounded digest', () => {
  const { digest, recent } = compactHistory(turns(40));
  assert.equal(recent.length, RECENT_MESSAGES);
  assert.match(recent[0].content, /^mensaje 28 /);
  assert.match(digest, /Artista: mensaje 26 /);
  assert.ok(digest.length <= 2400);
  assert.doesNotMatch(digest, /mensaje 0 /, 'the most distant past is dropped first');
});

test('a short history is sent as it is, with no digest', () => {
  const { digest, recent } = compactHistory([{ role: 'user', content: 'hola' }, { role: 'assistant', content: '¡Hola!' }]);
  assert.equal(digest, null);
  assert.deepEqual(recent, [{ role: 'user', content: 'hola' }, { role: 'assistant', content: '¡Hola!' }]);
});

test('a chat request carries the digest, the full profile and a short system prompt', async () => {
  const native = fetch, log = console.log;
  let body;
  globalThis.fetch = async (url, options) => { body = JSON.parse(options.body); return Response.json({ usage: {}, choices: [{ message: { content: 'ok' } }] }); };
  console.log = () => {};
  const profile = { artist_name: 'Ary Nox', goals: 'g'.repeat(1500), sellos: [{ name: 'Sello' }] };
  try {
    await chat('y la portada?', null, null, [...turns(40), { role: 'user', content: 'y la portada?' }], { profile, userId: 9, account: { tier: 'pro_plus', percent: 30 } });
  } finally { globalThis.fetch = native; console.log = log; }
  const system = body.messages.filter(message => message.role === 'system').map(message => message.content);
  assert.ok(system[0].length < 12_000, `system prompt has ${system[0].length} characters`);
  assert.match(system[0], /Soy Emil Banana/);
  assert.ok(system.some(content => content.includes('Resumen de mensajes anteriores')));
  assert.ok(system.some(content => content.includes(JSON.stringify(profile))), 'the profile is never trimmed');
  assert.ok(system.some(content => content.includes('plan PRO+, 30%')));
  assert.equal(body.messages.filter(message => message.role !== 'system').length, RECENT_MESSAGES + 1);
  assert.equal(body.messages.at(-2).content, 'y la portada?');
});
