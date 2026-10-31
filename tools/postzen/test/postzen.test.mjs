import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDraft, createInstagramDraft } from '../src/postzen.mjs';

const accountId = 'j9728s2139w1qrqdte0fynrjf98hbg4j';
const content = 'Hello from PostZen 👋';
const imageUrl = 'https://media.postzen.dev/marketing/template-media-image.png';

test('builds a draft only, with the requested account and media', () => {
  const draft = buildDraft({accountId,content,imageUrl});
  assert.equal(draft.isDraft, true);
  assert.equal(draft.publishNow, undefined);
  assert.equal(draft.scheduledFor, undefined);
  assert.deepEqual(draft.platforms, [{platform:'instagram',accountId,settings:{postType:'feed'}}]);
  assert.deepEqual(draft.mediaItems, [{url:imageUrl}]);
});

test('writes the API call, idempotency header and parses draft status', async () => {
  let called = false;
  const out = await createInstagramDraft({accountId,content,imageUrl,apiKey:'unit-test-key',requestId:'demo-1',fetchFn:async (url,options)=>{
    called=true;
    assert.equal(url, 'https://api.postzen.dev/v1/posts');
    assert.equal(options.headers['Authorization'], 'Bearer unit-test-key');
    assert.equal(options.headers['x-request-id'],'demo-1');
    assert.equal(JSON.parse(options.body).isDraft, true);
    return {ok:true,status:201,text:async()=>JSON.stringify({post:{_id:'post-id-1',status:'draft'},message:'Draft created successfully'})};
  }});
  assert.equal(called,true);
  assert.equal(out.id,'post-id-1');
});

test('refuses missing key and unsupported URL', async () => {
  await assert.rejects(createInstagramDraft({accountId,content,imageUrl,apiKey:''}), /POSTZEN_API_KEY/);
  assert.throws(()=>buildDraft({accountId,content,imageUrl:'http://example.com/img.png'}),/HTTPS/);
});