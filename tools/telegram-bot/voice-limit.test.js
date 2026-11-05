import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_OWNER_ID = '1';
const { voiceDenial } = await import('./voice-limit.js');

function mock(used) {
  const native = fetch;
  globalThis.fetch = async () => Response.json(Array.from({ length: used }, () => ({})));
  return () => { globalThis.fetch = native; };
}

test('free users get 1 voice note in 24 hours', async () => {
  let restore = mock(0);
  try { assert.equal(await voiceDenial(7, 'free'), null); } finally { restore(); }
  restore = mock(1);
  try { assert.match(await voiceDenial(7, 'free'), /gratuita/); } finally { restore(); }
});

test('Pro users get 10, and the owner has no limit', async () => {
  let restore = mock(9);
  try { assert.equal(await voiceDenial(7, 'pro'), null); } finally { restore(); }
  restore = mock(10);
  try {
    assert.match(await voiceDenial(7, 'pro'), /10 notas/);
    assert.equal(await voiceDenial(1, 'free'), null);
  } finally { restore(); }
});
