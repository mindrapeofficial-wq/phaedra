import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.OPENAI_API_KEY = 'test-key';
const { sendVoiceReply, spokenText } = await import('./speech.js');

function mock({ speechStatus = 200 } = {}) {
  const native = fetch, calls = { speech: [], voice: [], text: [] };
  globalThis.fetch = async (url, options = {}) => {
    url = String(url);
    if (url.endsWith('/audio/speech')) { calls.speech.push(JSON.parse(options.body)); return new Response('ogg', { status: speechStatus }); }
    if (url.endsWith('/sendVoice')) { calls.voice.push(options.body.get('caption')); return Response.json({ ok: true }); }
    if (url.endsWith('/sendMessage')) { calls.text.push(JSON.parse(options.body).text); return Response.json({ ok: true }); }
    return new Response('');
  };
  return { calls, restore: () => { globalThis.fetch = native; } };
}

test('a short answer goes only as a voice note disclosed as AI', async () => {
  const { calls, restore } = mock();
  try {
    await sendVoiceReply(1, 'Vamos con tu single.');
    assert.equal(calls.voice.length, 1);
    assert.match(calls.voice[0], /IA/);
    assert.equal(calls.text.length, 0);
    assert.equal(calls.speech[0].response_format, 'opus');
  } finally { restore(); }
});

test('links are not read aloud and are also sent as text', async () => {
  const { calls, restore } = mock();
  try {
    await sendVoiceReply(1, 'Mira https://banana.phaedra.com.es/ ahora');
    assert.doesNotMatch(calls.speech[0].input, /https/);
    assert.equal(calls.voice.length, 1);
    assert.match(calls.text[0], /https/);
  } finally { restore(); }
});

test('long answers and voice failures fall back to text', async () => {
  const long = mock();
  try {
    await sendVoiceReply(1, 'a'.repeat(901));
    assert.equal(long.calls.speech.length, 0);
    assert.equal(long.calls.text.length, 1);
  } finally { long.restore(); }
  const failing = mock({ speechStatus: 500 });
  const error = console.error; console.error = () => {};
  try {
    await sendVoiceReply(1, 'Hola');
    assert.equal(failing.calls.voice.length, 0);
    assert.deepEqual(failing.calls.text, ['Hola']);
  } finally { console.error = error; failing.restore(); }
});

test('markdown symbols are not spoken', () => {
  assert.equal(spokenText('**Hola**'), 'Hola');
});
