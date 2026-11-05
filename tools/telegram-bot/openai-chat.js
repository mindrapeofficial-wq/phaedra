import { isOwnerRequest, currentRoute } from './usage.js';

export const CHAT_MODEL = 'gpt-6.1-terra';
export const LIGHT_MODEL = 'gpt-6-luna';
const FALLBACK_MODEL = 'gpt-4.1';

const post = (body, signal) => fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST', signal,
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Reasoning is on trial for the owner only. If the API refuses it with tools, the request is repeated without it.
const trialEffort = model => { const effort = process.env.BANANA_REASONING_EFFORT || 'medium'; return effort !== 'none' && model === CHAT_MODEL && isOwnerRequest() && currentRoute() === 'complex' ? effort : null; };
const TASK_WORDS = /base|beat|m[uú]sica|imagen|foto|portada|logo|pista|instagram|plan|ficha|guard|recarga|pago|cuenta|gener|crea|haz/i;
const COMPLEX_WORDS = /estrategia|presupuesto|analiza|compara|qu[eé] (?:har[ií]as|me recomiendas|opinas)|por qu[eé]|c[oó]mo (?:puedo|deber[ií]a)|lanzamiento/i;
export function chooseRoute(text = '', hasImage = false) {
  const clean = String(text).trim();
  if (hasImage) return 'normal';
  if (clean.length > 250 || COMPLEX_WORDS.test(clean)) return 'complex';
  return clean.split(/\s+/).length <= 6 && !TASK_WORDS.test(clean) ? 'simple' : 'normal';
}
const routedModel = model => process.env.BANANA_REASONING_EFFORT !== 'none' && model === CHAT_MODEL && isOwnerRequest() && currentRoute() === 'simple' ? LIGHT_MODEL : model;
const withoutTrialItems = messages => messages?.map(({ _items, ...message }) => message);
const responsesContent = content => Array.isArray(content) ? content.map(part => part.type === 'image_url' ? { type: 'input_image', image_url: part.image_url?.url } : { type: 'input_text', text: part.text }) : content;
function responsesInput(messages = []) {
  const input = [];
  for (const message of messages) {
    if (message.role === 'tool') input.push({ type: 'function_call_output', call_id: message.tool_call_id, output: String(message.content) });
    else if (message._items) input.push(...message._items);
    else if (message.tool_calls) for (const call of message.tool_calls) input.push({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments });
    else input.push({ role: message.role, content: responsesContent(message.content) });
  }
  return input;
}
export function responsesBody(body, model, effort) {
  const choice = body.tool_choice?.function ? { type: 'function', name: body.tool_choice.function.name } : body.tool_choice;
  return { model, input: responsesInput(body.messages), reasoning: { effort }, store: false, include: ['reasoning.encrypted_content'], max_output_tokens: Math.max(body.max_completion_tokens || 0, 4000),
    ...(body.response_format ? { text: { format: body.response_format } } : {}),
    ...(body.tools ? { tools: body.tools.map(({ function: f }) => ({ type: 'function', name: f.name, description: f.description, parameters: f.parameters, strict: false })), tool_choice: choice } : {}) };
}
// Reasoning items travel back with the tool results, as the API requires.
export function chatShaped(data) {
  const output = data.output || [];
  const calls = output.filter(item => item.type === 'function_call');
  const content = output.filter(item => item.type === 'message').flatMap(item => item.content || []).filter(part => part.type === 'output_text').map(part => part.text).join('');
  const message = { content, ...(calls.length ? { tool_calls: calls.map(call => ({ id: call.call_id, type: 'function', function: { name: call.name, arguments: call.arguments } })), _items: output.filter(item => item.type !== 'message') } : {}) };
  return Response.json({ usage: data.usage, choices: [{ message }] });
}
export async function openAiChat(body, { model: requested = CHAT_MODEL, signal } = {}) {
  const model = routedModel(requested);
  const effort = trialEffort(model);
  if (effort) {
    const trial = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(responsesBody(body, model, effort)),
    });
    if (trial.ok) { console.log('[ai] reasoning trial used', { effort }); return { response: chatShaped(await trial.json()), model }; }
    const failure = await trial.json().catch(() => ({}));
    console.error('[ai] reasoning trial rejected', { status: trial.status, code: failure.error?.code, param: failure.error?.param });
    if (![400, 403, 404].includes(trial.status)) return { response: new Response('{}', { status: trial.status }), model };
  }
  const response = await post({ ...body, messages: withoutTrialItems(body.messages), model, reasoning_effort: 'none' }, signal);
  if (response.ok || ![400, 403, 404].includes(response.status)) return { response, model };
  console.error('[ai] primary model rejected, using fallback', { model, status: response.status });
  return { response: await post({ ...body, messages: withoutTrialItems(body.messages), model: FALLBACK_MODEL }, signal), model: FALLBACK_MODEL };
}
