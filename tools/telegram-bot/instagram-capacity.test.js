import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY='test-key';
const {prepareInstagramCapacity}=await import('./instagram-capacity.js');
test('first paid slot keeps owner; second releases only authorized empty owner account; third waits',async()=>{
  const native=fetch; let slot=1, removed=false, pending=false, notices=0, writes=0;
  const owner={account_id:'j9728s2139w1qrqdte0fynrjf98hbg4j',profile_id:'owner_profile',status:'active'};
  globalThis.fetch=async(url,opts)=>{assert.match(url,/sb_claim_instagram_slot/);assert.equal(JSON.parse(opts.body).p_user,77);return Response.json(slot);};
  const api=async(path,opts)=>{
    if(path==='/accounts')return{accounts:removed?[]:[{_id:owner.account_id}]};
    if(path.startsWith('/posts?'))return{posts:pending?[{_id:'scheduled'}]:[]};
    if(path==='/accounts/'+owner.account_id&&opts.method==='DELETE'){removed=true;return{};}
    throw Error('Unexpected operation');
  };
  const connection=async(id,patch)=>{if(patch){writes++;assert.equal(patch.status,'disabled');}return owner;};
  const options={api,connection,notify:async()=>notices++};
  try{
    await prepareInstagramCapacity(77,options);assert.equal(removed,false);
    slot=2;pending=true;await assert.rejects(prepareInstagramCapacity(77,options),/pendientes/);assert.equal(removed,false);
    pending=false;await prepareInstagramCapacity(77,options);assert.equal(removed,true);assert.equal(writes,1);
    slot=null;await assert.rejects(prepareInstagramCapacity(77,options),/capacidad/);assert.equal(writes,1);assert.equal(notices,3);
  }finally{globalThis.fetch=native;}
});
