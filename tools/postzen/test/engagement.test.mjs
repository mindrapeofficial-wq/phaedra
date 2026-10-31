import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  listConnectedAccounts,listPosts,listCommentAutomations,listConversations,
  getPost,postzenRequest,buildOptInRule,createOptInRule,replyToComment,replyToConversation
} from '../src/postzen.mjs';
const aid='j9728s2139w1qrqdte0fynrjf98hbg4j';
const mock=(expectedPath,response)=>async (url,options)=>{
  assert.equal(url,'https://api.postzen.dev'+expectedPath);
  assert.match(options.headers.Authorization,/^Bearer /);
  return {status:200,ok:true,text:async()=>JSON.stringify(response)};
};

test('list connected accounts safely',async()=>{
  const a=await listConnectedAccounts({apiKey:'test-key',fetchFn:mock('/v1/accounts?platform=instagram',{accounts:[{_id:aid,platform:'instagram',username:'@phaedrasound',status:'connected',secret:'should be omitted'}]})});
  assert.deepEqual(a,[{id:aid,platform:'instagram',username:'@phaedrasound',status:'connected'}]);
});
test('list posts uses explicit account and limit',async()=>{
  const p=await listPosts({accountId:aid,limit:2,apiKey:'test-key',fetchFn:mock('/v1/posts?accountId='+aid+'&limit=2',{posts:[{_id:'abc'}]})});
  assert.equal(p.length,1);
});
test('get post',async()=>{
  const p=await getPost({postId:'m1767zvcde9ked9gpx7stxbchd8hbjy9',apiKey:'test-key',fetchFn:mock('/v1/posts/m1767zvcde9ked9gpx7stxbchd8hbjy9',{post:{status:'draft'}})});
  assert.equal(p.status,'draft');
});
test('list inbox conversations without requesting messages',async()=>{
  const c=await listConversations({accountId:aid,apiKey:'test-key',fetchFn:mock('/v1/inbox/conversations?accountId='+aid+'&limit=10',{conversations:[]})});
  assert.equal(c.length,0);
});
test('list automations',async()=>{
  const r=await listCommentAutomations({accountId:aid,apiKey:'test-key',fetchFn:mock('/v1/comment-automations?accountId='+aid,{automations:[{id:'test123'}]})});
  assert.equal(r[0].id,'test123');
});
test('keyword automation requires exact keyword and explicit activation consent',async()=>{
  const body=buildOptInRule({name:'Phaedra: INFO en comentarios',keyword:'INFO',dmMessage:'Gracias por tu interés'});
  assert.deepEqual(body.keywords,['INFO']);assert.equal(body.matchMode,'exact');
  assert.equal(body.isActive,true);
  await assert.rejects(createOptInRule({body,apiKey:'test-key'}),/approval/);
});
test('comment reply refuses without per-send approval',async()=>{
  await assert.rejects(replyToComment({accountId:aid,postId:'1234567890',commentId:'2345678901',message:'Thanks',apiKey:'test-key'}),/approval/);
});
test('approved comment reply sends only correct target',async()=>{
  const p='/v1/inbox/comments/1234567890';
  const j=await replyToComment({accountId:aid,postId:'1234567890',commentId:'2345678901',message:'Gracias',approved:true,apiKey:'test-key',fetchFn:async (url,o)=>{
    assert.equal(url,'https://api.postzen.dev'+p);
    assert.deepEqual(JSON.parse(o.body),{accountId:aid,commentId:'2345678901',message:'Gracias'});
    return {ok:true,status:200,text:async()=>JSON.stringify({success:true})};
  }});
  assert.equal(j.success,true);
});
test('DM reply refuses without approval/idempotency',async()=>{
  await assert.rejects(replyToConversation({conversationId:'thread_123456',message:'Hola',apiKey:'test-key'}),/approval/);
  await assert.rejects(replyToConversation({conversationId:'thread_123456',message:'Hola',approved:true,apiKey:'test-key'}),/Idempotency/);
});
test('approved DM uses idempotency header',async()=>{
  const j=await replyToConversation({conversationId:'thread_123456',message:'Hola',requestId:'unique-dm-1',approved:true,apiKey:'test-key',fetchFn:async (url,o)=>{
    assert.equal(o.headers['Idempotency-Key'],'unique-dm-1');
    assert.deepEqual(JSON.parse(o.body),{accountId:aid,message:'Hola'});
    return {ok:true,status:200,text:async()=>JSON.stringify({success:true})};
  }});assert.equal(j.success,true);
});
test('API errors do not leak credentials',async()=>{
  const apiKey='pzn_live_'+'a'.repeat(64);
  await assert.rejects(postzenRequest('/v1/accounts',{apiKey,fetchFn:async()=>({status:401,ok:false,text:async()=>JSON.stringify({error:'Invalid '+apiKey})})}),e=>!e.message.includes(apiKey)&&e.message.includes('[REDACTED]'));
});
test('rejects unsupported arbitrary API path and bad ids',async()=>{
  await assert.rejects(postzenRequest('https://evil.example.com',{apiKey:'x'}),/Invalid API path/);
  await assert.rejects(listPosts({accountId:'invalid',apiKey:'x'}),/Invalid PostZen account ID/);
});