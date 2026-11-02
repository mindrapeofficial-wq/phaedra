import test from 'node:test';
import assert from 'node:assert/strict';
import {processGenerate} from '../api/generate.js';
const origin='chrome-extension://'+'a'.repeat(32);
const token='a'.repeat(120);
const env={SUPABASE_PUBLISHABLE_KEY:'sb_public',OPENAI_API_KEY:'server-openai-token'};
const body={skill:'ig-reel',account:'ny0b3',prompt:'Escribe un Reel de prueba con una apertura interesante.'};
function request(method='POST',b=body,authorization='Bearer '+token,orig=origin){return {method,headers:{origin:orig,authorization},body:b};}
const calls=[];
const goodFetch=async (url,options)=>{calls.push({url,options});if(url.includes('/auth/v1/user'))return {ok:true,json:async()=>({id:'user-1',email_confirmed_at:'2026-10-01T00:00:00Z'})};if(url.includes('/banana-billing'))return {ok:true,json:async()=>({trialActive:true,trialEndsAt:'2030-01-01T00:00:00Z'})};if(url.includes('/sb_ai_take_quota'))return {ok:true,json:async()=>({allowed:true,used:1,remaining:19})};if(url.includes('api.openai.com'))return {ok:true,json:async()=>({choices:[{message:{content:'Reel preparado para revisar'}}]})};throw Error('unexpected');};
test('health and CORS',async()=>{const a=await processGenerate(request('GET'),{env,fetchImpl:goodFetch});assert.equal(a.status,200);assert.equal(a.body.providerReady,true);assert.equal(a.headers['Access-Control-Allow-Origin'],origin);assert.equal((await processGenerate(request('OPTIONS'),{env,fetchImpl:goodFetch})).status,204);});
test('rejects unauthorized origins before provider',async()=>{assert.equal((await processGenerate(request('GET',body,'','https://evil.test'),{env,fetchImpl:goodFetch})).status,403);});
test('rejects missing token',async()=>{assert.equal((await processGenerate(request('POST',body,''),{env,fetchImpl:goodFetch})).status,401);});
test('validates skill and prompt',async()=>{assert.equal((await processGenerate(request('POST',{...body,skill:'follow-all'}),{env,fetchImpl:goodFetch})).status,400);});
test('generates only after subscription and quota checks',async()=>{calls.length=0;const v=await processGenerate(request(),{env,fetchImpl:goodFetch});assert.equal(v.status,200);assert.equal(v.body.text,'Reel preparado para revisar');assert.equal(v.body.published,false);assert.deepEqual(calls.map(x=>new URL(x.url).pathname),['/auth/v1/user','/functions/v1/banana-billing','/rest/v1/rpc/sb_ai_take_quota','/v1/chat/completions']);assert(!JSON.stringify(calls.at(-1).options).includes(token));});
test('quota deny prevents model calls',async()=>{let gateway=false;const fetchImpl=async(url,options)=>{if(url.includes('api.openai.com'))gateway=true;const r=await goodFetch(url,options);return url.includes('sb_ai_take_quota')?{ok:true,json:async()=>({allowed:false,used:20,remaining:0})}:r;};const v=await processGenerate(request(),{env,fetchImpl});assert.equal(v.status,429);assert.equal(gateway,false);});
test('subscription deny prevents quota consumption',async()=>{let quota=false;const fetchImpl=async(url,options)=>{if(url.includes('sb_ai_take_quota'))quota=true;const r=await goodFetch(url,options);return url.includes('banana-billing')?{ok:true,json:async()=>({trialActive:false,active:false,trialEndsAt:'2025-01-01T00:00:00Z'})}:r;};const v=await processGenerate(request(),{env,fetchImpl});assert.equal(v.status,403);assert.equal(quota,false);});
test('provider key never sent in HTTP response',async()=>{const v=await processGenerate(request(),{env,fetchImpl:goodFetch});assert(!JSON.stringify(v).includes('server-oidc-token'));});
