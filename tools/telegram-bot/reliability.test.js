process.env.BANANA_PROMO_OFF = '1';
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
const { activeSubscription, requireInstagramAccess } = await import('./entitlements.js');
const { reserveImage, finishImage } = await import('./image-credits.js');
const { enqueueUpdate, processJob } = await import('./jobs.js');
const { pcmWav, transcribeVoice } = await import('./voice.js');
const { communityTiming } = await import('./proactive.js');

test('live paid access excludes trials, expired, disputed and sandbox subscriptions', async () => {
  const valid = { livemode: true, status: 'active', risk_hold: false, paid_until: '2030-01-01' };
  assert.ok(activeSubscription([valid]));
  for (const override of [{livemode:false},{status:'trialing'},{risk_hold:true},{paid_until:'2020-01-01'}]) assert.equal(activeSubscription([{...valid,...override}]), null);
  const native = fetch;
  globalThis.fetch = async url => {
    if (url.includes('sb_telegram_users')) return Response.json([{user_id:'linked-user'}]);
    if (url.includes('sb_subscriptions')) return Response.json([{...valid,livemode:false}]);
    throw Error('Unpaid user reached Instagram');
  };
  try { await assert.rejects(requireInstagramAccess(999), /No consta/); }
  finally { globalThis.fetch = native; }
});
test('one free PRO image cannot be reserved twice; failures release it and delivery spends it', async () => {
  const native = fetch;
  let token = null, used = false;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('sb_telegram_users')) return Response.json([{tier:'free'}]);
    if (url.endsWith('sb_reserve_free_image')) {
      if (used || token) return Response.json(null);
      token = 'reservation'; return Response.json(token);
    }
    if (url.endsWith('sb_finish_free_image')) {
      const body = JSON.parse(opts.body);
      if (body.p_token === token) { used ||= body.p_success; token = null; }
      return Response.json(null);
    }
    throw Error('Unexpected request');
  };
  try {
    const results = await Promise.allSettled([reserveImage(99),reserveImage(99)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    await finishImage(99,'reservation',false);
    assert.equal(await reserveImage(99),'reservation');
    await finishImage(99,'reservation',true);
    await assert.rejects(reserveImage(99),/una imagen PRO/);
  } finally { globalThis.fetch = native; }
});
test('Telegram inbox persists before acknowledgement; interrupted work is never replayed', async () => {
  const native = fetch, writes = [], rows = new Map();
  globalThis.fetch = async (url,opts) => {
    const body=JSON.parse(opts.body); writes.push({url,opts,body});
    if (opts.method==='POST') {
      assert.match(opts.headers.Prefer,/ignore-duplicates/);
      if (!rows.has(body.update_id)) rows.set(body.update_id,body);
    }
    return Response.json([]);
  };
  try {
    const update={update_id:77,message:{chat:{id:1},from:{id:2},text:'hola'}};
    await enqueueUpdate(update); await enqueueUpdate(update); assert.equal(rows.size,1);
    let executed=0, notices=0;
    await processJob({...rows.get(77),recovered:true},'lease',async()=>executed++,async()=>notices++);
    assert.equal(executed,0); assert.equal(notices,1);
    assert.equal(writes.at(-1).body.status,'interrupted'); assert.equal(writes.at(-1).body.payload,null);
    await processJob({...rows.get(77),recovered:false},'lease',async()=>executed++);
    assert.equal(executed,1); assert.equal(writes.at(-1).body.status,'done');
  } finally {globalThis.fetch=native;}
});
test('community follows fresh conversations without interrupting, overnight messages or repeated pitches', () => {
  const now=Date.parse('2026-11-02T15:00:00Z');
  const context=[{updated_at:new Date(now-3*60000).toISOString()}];
  assert.equal(communityTiming({},context,now).allowed,true);
  assert.equal(communityTiming({},[{updated_at:new Date(now-1000).toISOString()}],now).allowed,false);
  assert.equal(communityTiming({lastSent:now-60000},context,now).allowed,false);
  assert.equal(communityTiming({day:'2026-11-02',sentToday:12},context,now).allowed,false);
  assert.equal(communityTiming({lastAttempt:now-60000},context,now).allowed,false);
  assert.equal(communityTiming({day:'2026-11-02',sentToday:3,lastContextAt:now,lastSent:now-4*3600000},context,now).allowed,true);
  assert.equal(communityTiming({},context,Date.parse('2026-11-02T23:00:00Z')).allowed,false);
  assert.equal(communityTiming({day:'2026-11-02',sentToday:4,lastContextAt:now,lastSent:now-4*3600000},context,now).allowed,false);
});
test('a queued message gets one receipt, while a duplicate update gets none',async()=>{
  const native=fetch;let exists=false,receipts=0;
  globalThis.fetch=async(url,opts={})=>{
    if(url.includes('on_conflict=update_id')){if(exists)return Response.json([]);exists=true;return Response.json([{update_id:88}]);}
    if(url.includes('sb_bot_jobs?update_id=lt.'))return Response.json([{telegram_id:7}]);
    if(url.endsWith('/sendMessage')){receipts++;return Response.json({ok:true});}
    throw Error('Unexpected request');
  };
  try{
    const update={update_id:88,message:{chat:{id:7},from:{id:7},text:'Otra idea'}};
    await enqueueUpdate(update);await enqueueUpdate(update);assert.equal(receipts,1);
  }finally{globalThis.fetch=native;}
});
test('voice produces valid mono PCM and rejects excessive audio before any download', async () => {
  const wav=pcmWav([Float32Array.from([-1,0,1]),Float32Array.from([-1,0,1])],48000);
  assert.equal(wav.toString('ascii',0,4),'RIFF'); assert.equal(wav.readUInt32LE(24),48000);
  assert.equal(wav.readUInt16LE(22),1); assert.equal(wav.readInt16LE(44),-32768); assert.equal(wav.readInt16LE(48),32767);
  assert.throws(()=>pcmWav([],48000));
  await assert.rejects(transcribeVoice({duration:181,file_id:'unread'}),/3 minutos/);
});
