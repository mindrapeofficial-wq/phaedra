import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAiServices } from './ai-health.js';
test('AI diagnostic tests text providers, only inspects image access and caches repeated probes',async()=>{
  const native=fetch;process.env.OPENAI_API_KEY='test';process.env.ANTHROPIC_API_KEY='test';let calls=0;
  globalThis.fetch=async(url)=>{calls++;if(url.endsWith('/chat/completions'))return Response.json({choices:[{message:{content:'OK'}}]});if(url.endsWith('/messages'))return new Response('sensitive-provider-error',{status:429});assert.match(url,/\/models\/gpt-image-2.5-sunburst$/);return Response.json({id:'gpt-image-2.5-sunburst'});};
  try{const result=await checkAiServices(1);assert.match(result,/Chat.*OK/);assert.match(result,/Claude.*429/);assert.doesNotMatch(result,/sensitive-provider-error/);assert.match(result,/solo acceso/);await checkAiServices(1);assert.equal(calls,3);}finally{globalThis.fetch=native;}
});
