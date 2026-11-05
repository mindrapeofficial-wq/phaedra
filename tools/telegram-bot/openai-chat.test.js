import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_OWNER_ID = '1';
const { openAiChat } = await import('./openai-chat.js');
const { withUsageContext, chargeUsageTo } = await import('./usage.js');

function mock(statuses = []) {
  const native = fetch, bodies = [];
  globalThis.fetch = async (url, options) => { bodies.push(JSON.parse(options.body)); return new Response('{}', { status: statuses.shift() || 200 }); };
  return { bodies, restore: () => { globalThis.fetch = native; } };
}
const quiet = async task => { const log = console.log, error = console.error; console.log = console.error = () => {}; try { return await task(); } finally { console.log = log; console.error = error; } };

test('only the owner gets reasoning, also while helping an artist', async () => {
  const { bodies, restore } = mock();
  try {
    await quiet(() => withUsageContext({ userId: 1 }, () => openAiChat({ messages: [], max_completion_tokens: 800 })));
    await quiet(() => withUsageContext({ userId: 1 }, () => { chargeUsageTo(7); return openAiChat({ messages: [] }); }));
    await quiet(() => withUsageContext({ userId: 7 }, () => openAiChat({ messages: [], max_completion_tokens: 800 })));
    assert.equal(bodies[0].reasoning_effort, 'medium');
    assert.equal(bodies[0].max_completion_tokens, 4000);
    assert.equal(bodies[1].reasoning_effort, 'medium');
    assert.equal(bodies[2].reasoning_effort, 'none');
    assert.equal(bodies[2].max_completion_tokens, 800);
  } finally { restore(); }
});

test('if the API refuses reasoning, the request repeats without it', async () => {
  const { bodies, restore } = mock([400]);
  try {
    const { model } = await quiet(() => withUsageContext({ userId: 1 }, () => openAiChat({ messages: [] })));
    assert.equal(bodies.length, 2);
    assert.equal(bodies[1].reasoning_effort, 'none');
    assert.equal(model, 'gpt-6.1-terra');
  } finally { restore(); }
});
