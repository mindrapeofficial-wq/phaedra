import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
const { archiveFiles, artistFiles, fileCounts, artistSummary, resolveArtists } = await import('./artist-files.js');

function mock(rows = [], users = []) {
  const native = fetch, states = new Map();
  globalThis.fetch = async (url, options = {}) => {
    url = String(url);
    if (url.includes('select=telegram_id,name')) return Response.json(rows);
    if (url.includes('sb_telegram_users')) return Response.json(users);
    if (options.method === 'POST') { const row = JSON.parse(options.body); states.set(row.telegram_id, row.state); return new Response(null, { status: 204 }); }
    const id = Number(new URL(url).searchParams.get('telegram_id').slice(3));
    return Response.json(states.has(id) ? [{ state: states.get(id) }] : []);
  };
  return () => { globalThis.fetch = native; };
}

test('files are archived per artist without duplicates', async () => {
  const restore = mock();
  try {
    await archiveFiles(7, 'cover', ['a']);
    await archiveFiles(7, 'cover', ['a', 'b']);
    await archiveFiles(7, 'beat', ['c']);
    await archiveFiles(8, 'photo', ['z']);
    const files = await artistFiles(7);
    assert.deepEqual(fileCounts(files), { photo: 0, cover: 2, beat: 1 });
    assert.equal((await artistFiles(8)).length, 1);
  } finally { restore(); }
});

test('names resolve to Telegram IDs and unknown names get no access', async () => {
  const restore = mock([{ telegram_id: 5, name: 'Loyal-T' }], [{ telegram_id: 6, username: 'lunatico_music' }, { telegram_id: 9, username: null }]);
  try {
    assert.deepEqual(await resolveArtists(['Loyal T', 'lunatico music', 'Cachacero']), { ids: [5, 6], unresolved: ['Cachacero'] });
  } finally { restore(); }
});

test('the summary shows context, label and counts without internal fields', () => {
  const text = artistSummary('Ana', { name: 'Ana', goal: 'EP', welcomedAt: 'x' }, [{ sello: '2CB Records' }], [{ kind: 'beat' }]);
  assert.match(text, /2CB Records/);
  assert.match(text, /goal: EP/);
  assert.match(text, /Bases: 1/);
  assert.doesNotMatch(text, /welcomedAt/);
});
