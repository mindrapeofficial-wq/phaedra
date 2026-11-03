import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
const { claimInstagramTrial, expireInstagramTrial } = await import('./instagram-trial.js');
const PHAEDRA = 'j9728s2139w1qrqdte0fynrjf98hbg4j';

function mock(handler) {
  const native = fetch;
  globalThis.fetch = async (url, options = {}) => String(url).endsWith('/sendMessage') ? Response.json({ ok: true }) : handler(String(url), options);
  return () => { globalThis.fetch = native; };
}

test('claim replies distinguish winner, loser and unlinked users', async () => {
  for (const [result, expected] of [['claimed', /Es tuyo/], ['taken', /otra persona/], ['not_linked', /\/cuenta/], ['yours', /ya es tuyo/]]) {
    const restore = mock(() => Response.json(result));
    try { assert.match(await claimInstagramTrial(7), expected); } finally { restore(); }
  }
});

function expiryDb(subscriptions, patches) {
  return (url, options) => {
    if (options.method === 'PATCH') { patches.push(url); return new Response(''); }
    if (url.includes('sb_instagram_trial')) return Response.json([{ telegram_id: 7 }]);
    if (url.includes('sb_telegram_users')) return Response.json([{ user_id: 'u1' }]);
    return Response.json(subscriptions);
  };
}

test('expiry removes only the trial profile account and never Phaedra', async () => {
  const deleted = [], saved = [], patches = [];
  const restore = mock(expiryDb([], patches));
  const api = async (path, opts) => {
    if (opts?.method === 'DELETE') { deleted.push(path); return {}; }
    return { accounts: [{ _id: 'trial-acct', profileId: 'p7' }, { _id: 'other', profileId: 'p9' }, { _id: PHAEDRA, profileId: 'p7' }] };
  };
  const connection = async (_, patch) => { if (patch) saved.push(patch.status); return { profile_id: 'p7' }; };
  try {
    assert.equal(await expireInstagramTrial({ api, connection }), true);
    assert.deepEqual(deleted, ['/accounts/trial-acct']);
    assert.deepEqual(saved, ['disabled']);
    assert.equal(patches.length, 1);
  } finally { restore(); }
});

test('a failed removal keeps the trial open for a retry', async () => {
  const patches = [];
  const restore = mock(expiryDb([], patches));
  const api = async (path, opts) => { if (opts?.method === 'DELETE') throw Error('PostZen down'); return { accounts: [{ _id: 'trial-acct', profileId: 'p7' }] }; };
  try {
    await assert.rejects(expireInstagramTrial({ api, connection: async () => ({ profile_id: 'p7' }) }));
    assert.equal(patches.length, 0);
  } finally { restore(); }
});

test('a paying customer keeps the connection when the trial ends', async () => {
  const patches = [];
  const restore = mock(expiryDb([{ user_id: 'u1' }], patches));
  const api = async () => { throw Error('Must not touch PostZen'); };
  try {
    assert.equal(await expireInstagramTrial({ api, connection: api }), true);
    assert.equal(patches.length, 1);
  } finally { restore(); }
});

test('an active trial grants access without any subscription lookup', async () => {
  const { requireInstagramAccess } = await import('./entitlements.js');
  const restore = mock(url => {
    if (url.includes('sb_telegram_users')) return Response.json([{ user_id: 'u1' }]);
    if (url.includes('sb_instagram_trial')) return Response.json([{ telegram_id: 7 }]);
    throw Error('Unexpected lookup');
  });
  try { assert.equal((await requireInstagramAccess(7)).trial, true); } finally { restore(); }
});
