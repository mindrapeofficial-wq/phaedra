import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_OWNER_ID = '1';
const { openAiChat, responsesBody, chatShaped } = await import('./openai-chat.js');
const { withUsageContext, chargeUsageTo } = await import('./usage.js');

function mock(status = 200, output = []) {
  const native = fetch, calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), body: JSON.parse(options.body) }); return String(url).includes('/responses') ? Response.json(status === 200 ? { output, usage: { input_tokens: 5, output_tokens: 7 } } : { error: { code: 'x' } }, { status }) : Response.json({ choices: [{ message: { content: 'plain' } }] }); };
  return { calls, restore: () => { globalThis.fetch = native; } };
}
const quiet = async task => { const log = console.log, error = console.error; console.log = console.error = () => {}; try { return await task(); } finally { console.log = log; console.error = error; } };
const tools = [{ type: 'function', function: { name: 'ping', description: 'd', parameters: { type: 'object' } } }];

test('only the owner uses reasoning, also while helping an artist', async () => {
  const { calls, restore } = mock();
  try {
    await quiet(() => withUsageContext({ userId: 1 }, () => openAiChat({ messages: [], tools, tool_choice: 'auto' })));
    await quiet(() => withUsageContext({ userId: 1 }, () => { chargeUsageTo(7); return openAiChat({ messages: [] }); }));
    await quiet(() => withUsageContext({ userId: 7 }, () => openAiChat({ messages: [] })));
    assert.ok(calls[0].url.endsWith('/responses'));
    assert.equal(calls[0].body.reasoning.effort, 'medium');
    assert.equal(calls[0].body.tools[0].name, 'ping');
    assert.equal(calls[0].body.store, false);
    assert.ok(calls[1].url.endsWith('/responses'));
    assert.ok(calls[2].url.endsWith('/chat/completions'));
    assert.equal(calls[2].body.reasoning_effort, 'none');
  } finally { restore(); }
});

test('a refusal falls back to the normal request without trial data', async () => {
  const { calls, restore } = mock(400);
  try {
    const { response } = await quiet(() => withUsageContext({ userId: 1 }, () => openAiChat({ messages: [{ role: 'assistant', tool_calls: [], _items: [{}] }] })));
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.messages[0]._items, undefined);
    assert.equal((await response.json()).choices[0].message.content, 'plain');
  } finally { restore(); }
});

test('messages, images and tool rounds convert both ways', async () => {
  const body = responsesBody({ tool_choice: { type: 'function', function: { name: 'ping' } }, tools, messages: [
    { role: 'user', content: [{ type: 'text', text: 'hola' }, { type: 'image_url', image_url: { url: 'u' } }] },
    { role: 'assistant', tool_calls: [{ id: 'c', function: { name: 'ping', arguments: '{}' } }], _items: [{ type: 'reasoning', id: 'r' }, { type: 'function_call', call_id: 'c' }] },
    { role: 'tool', tool_call_id: 'c', content: 'ok' },
  ] }, 'm', 'medium');
  assert.equal(body.input[0].content[1].type, 'input_image');
  assert.equal(body.input[1].type, 'reasoning');
  assert.equal(body.input[3].type, 'function_call_output');
  assert.deepEqual(body.tool_choice, { type: 'function', name: 'ping' });
  const { choices } = await chatShaped({ output: [{ type: 'reasoning', id: 'r' }, { type: 'function_call', call_id: 'c', name: 'ping', arguments: '{}' }] }).json();
  assert.equal(choices[0].message.tool_calls[0].id, 'c');
  assert.equal(choices[0].message._items.length, 2);
  const text = await chatShaped({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'hola' }] }] }).json();
  assert.equal(text.choices[0].message.content, 'hola');
});
