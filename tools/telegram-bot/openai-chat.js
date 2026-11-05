import { isOwnerRequest } from './usage.js';

export const CHAT_MODEL = 'gpt-6.1-terra';
export const LIGHT_MODEL = 'gpt-6-luna';
const FALLBACK_MODEL = 'gpt-4.1';

const post = (body, signal) => fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST', signal,
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Reasoning is on trial for the owner only. If the API refuses it with tools, the request is repeated without it.
const trialEffort = model => model === CHAT_MODEL && isOwnerRequest() ? (process.env.BANANA_REASONING_EFFORT || 'medium') : null;
export async function openAiChat(body, { model = CHAT_MODEL, signal } = {}) {
  const effort = trialEffort(model);
  let response;
  if (effort) {
    response = await post({ ...body, model, reasoning_effort: effort, max_completion_tokens: Math.max(body.max_completion_tokens || 0, 4000) }, signal);
    if (response.ok) { console.log('[ai] reasoning trial used', { effort }); return { response, model }; }
    console.error('[ai] reasoning trial rejected', { status: response.status, effort });
    if (![400, 403, 404].includes(response.status)) return { response, model };
  }
  response = await post({ ...body, model, reasoning_effort: 'none' }, signal);
  if (response.ok || ![400, 403, 404].includes(response.status)) return { response, model };
  console.error('[ai] primary model rejected, using fallback', { model, status: response.status });
  return { response: await post({ ...body, model: FALLBACK_MODEL }, signal), model: FALLBACK_MODEL };
}
