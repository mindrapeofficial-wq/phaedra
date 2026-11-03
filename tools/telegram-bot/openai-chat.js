export const CHAT_MODEL = 'gpt-6.1-terra';
export const LIGHT_MODEL = 'gpt-6-luna';
const FALLBACK_MODEL = 'gpt-4.1';

const post = (body, signal) => fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST', signal,
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Chat Completions needs reasoning_effort none for function calling on these models.
export async function openAiChat(body, { model = CHAT_MODEL, signal } = {}) {
  const response = await post({ ...body, model, reasoning_effort: 'none' }, signal);
  if (response.ok || ![400, 403, 404].includes(response.status)) return { response, model };
  console.error('[ai] primary model rejected, using fallback', { model, status: response.status });
  return { response: await post({ ...body, model: FALLBACK_MODEL }, signal), model: FALLBACK_MODEL };
}
