import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.OPENAI_API_KEY = 'test-key';
const { interpretUploadRequest, saveToCollection, canAccess, collectionsFor, savedReply } = await import('./collections.js');

function mock(llm) {
  const native = fetch;
  let state = null;
  globalThis.fetch = async (url, options = {}) => {
    url = String(url);
    if (url.includes('chat/completions')) return llm ? Response.json({ choices: [{ message: { content: JSON.stringify(llm) } }] }) : new Response('', { status: 500 });
    if (options.method === 'POST') { state = JSON.parse(options.body).state; return new Response(null, { status: 204 }); }
    return Response.json(state ? [{ state }] : []);
  };
  return () => { globalThis.fetch = native; };
}

test('the full sentence yields the file name and its artists', async () => {
  const restore = mock({ action: 'save', collection: '2CB Records', artists: ['Cachacero', 'Loyal T', 'Lunatico'] });
  try {
    const result = await interpretUploadRequest('guárdalos en una ficha llamada 2cb records para cachacero, loyal t y lunatico');
    assert.equal(result.collection, '2CB Records');
    assert.equal(result.artists.length, 3);
  } finally { restore(); }
});

test('if the model fails, simple saving still works', async () => {
  const restore = mock(null);
  const error = console.error; console.error = () => {};
  try {
    assert.equal((await interpretUploadRequest('guárdalas')).action, 'save');
    assert.equal((await interpretUploadRequest('haz una portada')).action, 'other');
  } finally { console.error = error; restore(); }
});

test('files accumulate, and only the creator can change a file', async () => {
  const restore = mock();
  try {
    await saveToCollection({ name: '2CB Records', files: ['a'], artists: ['Loyal T'], ownerId: 1 });
    const { entry } = await saveToCollection({ name: '2cb records', files: ['a', 'b'], artists: ['Lunatico'], ownerId: 1 });
    assert.deepEqual(entry.files, ['a', 'b']);
    assert.deepEqual(entry.artists, ['Loyal T', 'Lunatico']);
    assert.equal((await saveToCollection({ name: '2CB Records', files: ['c'], artists: [], ownerId: 9 })).denied, true);
    assert.match(savedReply(entry, 2), /«2CB Records».*Loyal T, Lunatico/);
    assert.equal((await collectionsFor({ id: 5, first_name: 'Loyal-T' })).length, 1);
    assert.equal((await collectionsFor({ id: 6, first_name: 'Emil' })).length, 0);
    assert.equal((await collectionsFor({ id: 6, first_name: 'Emil' }, true)).length, 1);
  } finally { restore(); }
});

test('authorization matches names ignoring accents, case and symbols', () => {
  const entry = { ownerId: 1, artists: ['Lunático', 'Loyal T'] };
  assert.equal(canAccess(entry, { id: 2, first_name: 'LUNATICO' }), true);
  assert.equal(canAccess(entry, { id: 3, username: 'loyal_t' }), true);
  assert.equal(canAccess(entry, { id: 4, first_name: 'Ary' }), false);
});
