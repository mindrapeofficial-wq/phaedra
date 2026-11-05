import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.OPENAI_API_KEY = 'test-key';
delete process.env.ELEVENLABS_API_KEY;
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

test('a short answer goes only as a voice note, disclosed as AI only when requested', async () => {
  const { calls, restore } = mock();
  try {
    assert.equal(await sendVoiceReply(1, 'Vamos con tu single.', { disclose: true }), true);
    await sendVoiceReply(1, 'Seguimos.');
    assert.equal(calls.voice.length, 2);
    assert.match(calls.voice[0], /IA/);
    assert.equal(calls.voice[1], '');
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

test('ElevenLabs speaks first with the chosen voice, and OpenAI covers its failures', async () => {
  const native = fetch, urls = [];
  let elevenStatus = 200;
  process.env.ELEVENLABS_API_KEY = 'k';
  globalThis.fetch = async url => {
    url = String(url); urls.push(url);
    if (url.includes('elevenlabs')) return new Response('ogg', { status: elevenStatus });
    if (url.endsWith('/audio/speech')) return new Response('ogg');
    return Response.json({ ok: true });
  };
  const error = console.error; console.error = () => {};
  try {
    await sendVoiceReply(1, 'Hola');
    assert.ok(urls.some(u => u.includes('text-to-speech/SZXOlCpjEUCaedG9kg4Y')));
    assert.equal(urls.some(u => u.endsWith('/audio/speech')), false);
    urls.length = 0; elevenStatus = 401;
    assert.equal(await sendVoiceReply(1, 'Hola'), true);
    assert.ok(urls.some(u => u.endsWith('/audio/speech')));
  } finally { console.error = error; globalThis.fetch = native; delete process.env.ELEVENLABS_API_KEY; }
});
