import test from 'node:test';
import assert from 'node:assert/strict';
import { openAiChat, CHAT_MODEL } from './openai-chat.js';

function mock(statuses) {
  const native = fetch, bodies = [];
  globalThis.fetch = async (_, options) => { bodies.push(JSON.parse(options.body)); return new Response('{}', { status: statuses[bodies.length - 1] }); };
  return { bodies, restore: () => { globalThis.fetch = native; } };
}

test('the new model is sent with reasoning off so tools keep working', async () => {
  const { bodies, restore } = mock([200]);
  try {
    const { model } = await openAiChat({ messages: [] });
    assert.equal(model, CHAT_MODEL);
    assert.equal(bodies[0].reasoning_effort, 'none');
  } finally { restore(); }
});

test('a rejected model falls back without the unsupported parameter', async () => {
  const { bodies, restore } = mock([404, 200]);
  const error = console.error; console.error = () => {};
  try {
    const { model, response } = await openAiChat({ messages: [] });
    assert.equal(model, 'gpt-4.1');
    assert.equal(response.status, 200);
    assert.equal('reasoning_effort' in bodies[1], false);
  } finally { globalThis.console.error = error; restore(); }
});

test('rate limits and outages are not retried on another model', async () => {
  const { bodies, restore } = mock([429]);
  try {
    assert.equal((await openAiChat({ messages: [] })).response.status, 429);
    assert.equal(bodies.length, 1);
  } finally { restore(); }
});
