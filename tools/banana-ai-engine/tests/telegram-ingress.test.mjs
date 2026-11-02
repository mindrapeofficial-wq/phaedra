import test from 'node:test';
import assert from 'node:assert/strict';
import {receiveTelegram,wakeTelegramWorker} from '../lib/telegram-ingress.js';
const env={TELEGRAM_BOT_TOKEN:'synthetic-token',SUPABASE_SERVICE_KEY:'synthetic-key',TELEGRAM_WEBHOOK_SECRET:'synthetic-secret'};
const request={method:'POST',headers:{'x-telegram-bot-api-secret-token':env.TELEGRAM_WEBHOOK_SECRET},body:{update_id:10,message:{message_id:8,chat:{id:123},from:{id:456},text:'hola'}}};
test('ingress authenticates before storage; never acknowledges a failed insert',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;return new Response('{}',{status:503});};
 assert.equal((await receiveTelegram({...request,headers:{}},{env,fetchImpl})).status,401);assert.equal(calls,0);
 assert.equal((await receiveTelegram(request,{env,fetchImpl})).status,503);
 assert.equal((await receiveTelegram({...request,body:'{'},{env,fetchImpl})).status,400);
});
test('durable receipt follows successful insert; duplicate keeps only a wake',async()=>{
 let saved;
 const fetchImpl=async(url,options)=>{saved=JSON.parse(options.body);assert.match(options.headers.Prefer,/ignore-duplicates/);return new Response('[{"update_id":10}]');};
 const result=await receiveTelegram(request,{env,fetchImpl});assert.equal(result.status,200);assert.equal(result.receipt.message_id,8);assert.deepEqual(saved.payload,request.body);
 const duplicate=await receiveTelegram(request,{env,fetchImpl:async()=>new Response('[]')});assert.equal(duplicate.wake,true);assert.equal(duplicate.receipt,null);
 const ignored=await receiveTelegram({...request,body:{update_id:11,message:{...request.body.message,from:{is_bot:true}}}},{env,fetchImpl:()=>{throw Error('must not call');}});assert.equal(ignored.status,200);assert.equal(ignored.wake,undefined);
});
test('cold or rate-limited worker gets one threaded receipt and retry; warm worker stays quiet',async()=>{
 let attempts=0,receipts=0;
 const fetchImpl=async(url,options)=>{
   if(url.includes('/sendMessage')){receipts++;const data=JSON.parse(options.body);assert.equal(data.reply_parameters.message_id,8);return new Response('{}');}
   attempts++;await new Promise(r=>setTimeout(r,20));return attempts===1?new Response('{}',{status:429}):new Response('{"status":"ok"}');
 };
 assert.equal(await wakeTelegramWorker(request.body.message,{env,fetchImpl,noticeDelay:5,retryDelay:1}),true);assert.equal(attempts,2);assert.equal(receipts,1);
 receipts=0;assert.equal(await wakeTelegramWorker(request.body.message,{env,noticeDelay:50,fetchImpl:async url=>{if(url.includes('/sendMessage'))receipts++;return new Response('{"status":"ok"}');}}),true);assert.equal(receipts,0);
});
