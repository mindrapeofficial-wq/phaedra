import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_OWNER_ID = '1';
const { handleStems, audioFile, audioNote, wantsStems, stemsAllowance } = await import('./stems.js');

function mock({ used = 0, subs = [], status = 200 } = {}) {
  const native = fetch, log = { eleven: 0, messages: [], documents: 0 };
  globalThis.fetch = async (url, options = {}) => {
    url = String(url);
    if (url.includes('stem-separation')) { log.eleven++; return new Response('zip', { status }); }
    if (url.endsWith('/getFile')) return Response.json({ result: { file_path: 'a.mp3' } });
    if (url.includes('/file/bot')) return new Response('mp3');
    if (url.endsWith('/sendDocument')) { log.documents++; return Response.json({ ok: true }); }
    if (url.endsWith('/sendMessage')) { log.messages.push(JSON.parse(options.body).text); return Response.json({ ok: true }); }
    if (url.includes('sb_telegram_users')) return Response.json([{ user_id: 'u1' }]);
    if (url.includes('sb_subscriptions')) return Response.json(subs);
    if (url.includes('sb_usage_events')) return Response.json(Array.from({ length: used }, () => ({})));
    return new Response('');
  };
  return { log, restore: () => { globalThis.fetch = native; } };
}
const file = { file_id: 'f', duration: 100, file_size: 1000, mime_type: 'audio/mpeg' };
const run = (over = {}) => handleStems({ chatId: 7, userId: 7, isGroup: false, file, ...over });

test('requests and audio are recognised, including replies', () => {
  assert.ok(wantsStems('sepárame') === false && wantsStems('separa las pistas') && wantsStems('/separar') && wantsStems('quítale la voz') === false);
  assert.ok(wantsStems('quita la voz'));
  assert.equal(audioFile({ reply_to_message: { audio: file } }), file);
  assert.equal(audioFile({ document: { mime_type: 'application/pdf' } }), null);
  assert.deepEqual(stemsAllowance(false), { count: 1, monthly: false });
});

test('a free user gets one separation, then is refused without spending', async () => {
  process.env.ELEVENLABS_API_KEY = 'k';
  const first = mock();
  try { await run(); assert.equal(first.log.eleven, 1); assert.equal(first.log.documents, 1); } finally { first.restore(); }
  const second = mock({ used: 1 });
  try { await run(); assert.equal(second.log.eleven, 0); assert.match(second.log.messages[0], /gratuita/); } finally { second.restore(); }
});

test('groups, big files and long audio never reach the provider', async () => {
  process.env.ELEVENLABS_API_KEY = 'k';
  const { log, restore } = mock();
  try {
    await run({ isGroup: true });
    await run({ file: { ...file, file_size: 30e6 } });
    await run({ file: { ...file, duration: 999 } });
    assert.equal(log.eleven, 0);
  } finally { restore(); }
});

test('a provider failure is reported honestly', async () => {
  process.env.ELEVENLABS_API_KEY = 'k';
  const { log, restore } = mock({ status: 500 });
  const error = console.error; console.error = () => {};
  try { await run(); assert.equal(log.documents, 0); assert.match(log.messages.at(-1), /no te lo he descontado/); }
  finally { console.error = error; restore(); }
});

test('a reference track reaches the conversation with its details and without pretending to hear it', () => {
  const note = audioNote({ title: 'Memphis Nightmares', performer: 'nyob3', duration: 164 });
  assert.match(note, /Memphis Nightmares/);
  assert.match(note, /No puedes escucharlo/);
});
