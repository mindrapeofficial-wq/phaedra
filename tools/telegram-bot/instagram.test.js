import test from 'node:test';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
import assert from 'node:assert/strict';
import { beginConnection, verifyConnection, runInstagramTool } from './instagram.js';
import { runInstagramAgent, loadInstagramSkill } from './instagram-agent.js';

test('client accounts are isolated; revoked connections and arbitrary tool paths fail closed', async () => {
  const original = globalThis.fetch;
  const rows = new Map([[11, { telegram_id: 11, profile_id: 'profile_one', account_id: 'account_one', status: 'active' }], [22, { telegram_id: 22, profile_id: 'profile_two', account_id: 'account_two', status: 'active' }]]);
  const requests = [];
  let moved = false;
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes('sb_telegram_users')) return Response.json([{ user_id: 'client-uuid' }]);
    if (url.includes('sb_subscriptions')) return Response.json([{ livemode: true, status: 'active', risk_hold: false, paid_until: new Date(Date.now()+86400000).toISOString() }]);
    requests.push({ url, options });
    const u = new URL(url);
    if (u.pathname.includes('sb_instagram_connections')) return Response.json([rows.get(Number(u.searchParams.get('telegram_id').slice(3)))].filter(Boolean));
    if (u.pathname.endsWith('/accounts')) {
      const one = u.searchParams.get('profileId') === 'profile_one';
      return Response.json({ accounts: [{ _id: one ? 'account_one' : 'account_two', platform: 'instagram', profileId: moved ? 'profile_two' : one ? 'profile_one' : 'profile_two', status: 'connected' }] });
    }
    if (u.pathname.endsWith('/analytics')) return Response.json({ data: [{ accountId: u.searchParams.get('accountId') }] });
    if (u.pathname.endsWith('/posts') && options.method === 'POST') return Response.json({ post: { _id: 'draft1234' } });
    throw new Error('Unexpected endpoint');
  };
  try {
    const a = await runInstagramTool(11, 'instagram_analytics', { accountId: 'account_two', profileId: 'profile_two', days: 900 });
    assert.equal(a.data[0].accountId, 'account_one');
    const b = await runInstagramTool(22, 'instagram_analytics', {});
    assert.equal(b.data[0].accountId, 'account_two');
    await runInstagramTool(11, 'instagram_save_draft', { caption: 'Mi single', image_source: 'url', image_url: 'https://example.com/cover.png', publishNow: true }, 'request1');
    const writes = requests.filter(r => r.options.method === 'POST');
    const body = JSON.parse(writes[0].options.body);
    assert.equal(body.isDraft, true);
    assert.equal(body.publishNow, undefined);
    assert.equal(body.platforms[0].accountId, 'account_one');
    assert.ok(writes[0].options.headers['x-request-id']);
    await assert.rejects(runInstagramTool(11, 'instagram_save_draft', { caption: 'x', image_url: 'https://api.telegram.org/file/botsecret/p.jpg' }), /credenciales/);
    moved = true;
    await assert.rejects(runInstagramTool(11, 'instagram_analytics'), /autorización/);
    rows.get(22).status = 'disabled';
    await assert.rejects(runInstagramTool(22, 'instagram_analytics'), /Conecta/);
    await assert.rejects(runInstagramTool(33, 'instagram_analytics'), /Conecta/);
  } finally { globalThis.fetch = original; }
});

test('private OAuth link binds to provisioned profile; verification requires exactly one authorized account', async () => {
  const original = globalThis.fetch;
  let row = null, accountProfile = 'profile_new';
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes('sb_telegram_users')) return Response.json([{ user_id: 'client-uuid' }]);
    if (url.includes('sb_subscriptions')) return Response.json([{ livemode: true, status: 'active', risk_hold: false, paid_until: new Date(Date.now()+86400000).toISOString() }]);
    const u = new URL(url);
    if (u.pathname.includes('sb_instagram_connections')) {
      if (options.method === 'POST') row = JSON.parse(options.body);
      return Response.json(row ? [row] : []);
    }
    if (u.pathname.endsWith('/profiles')) return Response.json(options.method === 'POST' ? { profile: { _id: 'profile_new' } } : { profiles: [] });
    if (u.pathname.endsWith('/connect/instagram')) {
      assert.equal(u.searchParams.get('profileId'), 'profile_new');
      assert.match(u.searchParams.get('redirectUrl'), /instagram_check/);
      return Response.json({ authUrl: 'https://www.instagram.com/oauth/authorize?state=test' });
    }
    if (u.pathname.endsWith('/accounts')) return Response.json({ accounts: [{ _id: 'account_new', profileId: accountProfile, platform: 'instagram', username: 'client', status: 'connected' }] });
    throw new Error('Unexpected endpoint');
  };
  try {
    assert.match(await beginConnection(33), /^https:\/\/www.instagram.com/);
    assert.equal(row.telegram_id, 33);
    assert.equal(row.status, 'pending');
    accountProfile = 'foreign_profile';
    await assert.rejects(verifyConnection(33), /autorizada/);
    accountProfile = 'profile_new';
    assert.equal((await verifyConnection(33)).account_id, 'account_new');
    assert.equal(row.status, 'active');
  } finally { globalThis.fetch = original; }
});

test('Claude loads installed skills and executes a scoped tool roundtrip', async () => {
  assert.match(await loadInstagramSkill('ig-audit'), /ig-audit/);
  await assert.rejects(loadInstagramSkill('../../secret'), /no disponible/);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes('sb_telegram_users')) return Response.json([{ user_id: 'client-uuid' }]);
    if (url.includes('sb_subscriptions')) return Response.json([{ livemode: true, status: 'active', risk_hold: false, paid_until: new Date(Date.now()+86400000).toISOString() }]);
    if (url.includes('sb_instagram_connections')) return Response.json([{ profile_id: 'profile_one', account_id: 'account_one', status: 'active' }]);
    if (url.includes('/accounts?')) return Response.json({ accounts: [{ _id: 'account_one', profileId: 'profile_one', platform: 'instagram', status: 'connected' }] });
    if (url.includes('/analytics?')) return Response.json({ data: [{ analytics: { views: 123 } }] });
    if (url === 'https://api.anthropic.com/v1/messages') {
      const body = JSON.parse(options.body);
      assert.match(body.system, /ig-audit/);
      assert.ok(body.tools.some(t => t.name === 'instagram_analytics'));
      if (++calls === 1) return Response.json({ content: [{ type: 'tool_use', id: 'tool1', name: 'instagram_analytics', input: { days: 30 } }] });
      assert.match(body.messages.at(-1).content[0].content, /123/);
      return Response.json({ content: [{ type: 'text', text: 'He consultado tus datos: 123 visualizaciones en la muestra.' }] });
    }
    throw new Error('Unexpected endpoint');
  };
  try { assert.match((await runInstagramAgent('Analiza mi Instagram', '', { userId: 11 })).response, /123/); assert.equal(calls, 2); }
  finally { globalThis.fetch = original; }
});
