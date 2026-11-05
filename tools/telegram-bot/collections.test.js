import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.OPENAI_API_KEY = 'test-key';
const { interpretUploadRequest, saveToCollection, canAccess, collectionsFor, savedReply } = await import('./collections.js');

const resolver = async names => ({ ids: names.filter(n => n === 'Loyal T').map(() => 5).concat(names.filter(n => n === 'Lunatico').map(() => 6)), unresolved: names.filter(n => !['Loyal T', 'Lunatico'].includes(n)) });

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
    await saveToCollection({ name: '2CB Records', files: ['a'], artists: ['Loyal T'], ownerId: 1, resolver });
    const { entry } = await saveToCollection({ name: '2cb records', files: ['a', 'b'], artists: ['Lunatico'], ownerId: 1, resolver });
    assert.deepEqual(entry.files, ['a', 'b']);
    assert.deepEqual(entry.artists, ['Loyal T', 'Lunatico']);
    assert.equal((await saveToCollection({ name: '2CB Records', files: ['c'], artists: [], ownerId: 9, resolver })).denied, true);
    assert.match(savedReply(entry, 2), /«2CB Records».*Loyal T, Lunatico/);
    assert.equal((await collectionsFor({ id: 5, first_name: 'Loyal-T' })).length, 1);
    assert.equal((await collectionsFor({ id: 16, first_name: 'Emil' })).length, 0);
    assert.equal((await collectionsFor({ id: 16, first_name: 'Emil' }, true)).length, 1);
  } finally { restore(); }
});

test('access follows Telegram IDs, so a changed name grants nothing', () => {
  const entry = { ownerId: 1, artists: ['Loyal T'], artistIds: [5] };
  assert.equal(canAccess(entry, { id: 5, first_name: 'Otro' }), true);
  assert.equal(canAccess(entry, { id: 9, first_name: 'Loyal T' }), false);
  assert.equal(canAccess(entry, { id: 9 }, true), true);
});

test('confirming membership records artists and exposes the label to them', async () => {
  const { confirmMembers, labelsFor, confirmsMembership, deniesMembership, membershipQuestion } = await import('./collections.js');
  const restore = mock();
  try {
    const { entry } = await saveToCollection({ name: '2CB Records', files: ['logo'], artists: ['Loyal T', 'Lunatico'], ownerId: 1, resolver });
    assert.match(membershipQuestion(entry), /Loyal T, Lunatico son miembros de 2CB Records/);
    assert.deepEqual(await labelsFor({ id: 5, first_name: 'Loyal-T' }), []);
    await confirmMembers('2cb records');
    assert.equal((await labelsFor({ id: 5, first_name: 'Loyal-T' }))[0].sello, '2CB Records');
    assert.deepEqual(await labelsFor({ id: 16, first_name: 'Emil' }), []);
    assert.equal(confirmsMembership('sí, son del sello'), true);
    assert.equal(deniesMembership('no'), true);
    assert.equal(confirmsMembership('haz una portada'), false);
  } finally { restore(); }
});

test('a later request uses just uploaded photos first, then saved ones', async () => {
  const { filesForCollection } = await import('./collections.js');
  assert.deepEqual(filesForCollection({ pendingUploads: ['new'], library: ['old'] }), ['new']);
  assert.deepEqual(filesForCollection({ pendingUploads: [], library: ['a', 'b'] }), ['a', 'b']);
  assert.deepEqual(filesForCollection({ reference: { fileId: 'r' } }), ['r']);
  assert.deepEqual(filesForCollection({}), []);
});
