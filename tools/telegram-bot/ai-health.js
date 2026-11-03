const cached = new Map();
async function probe(name, url, options, missing, validates) {
  if (missing) return `${name}: sin configurar.`;
  const start = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return `${name}: fallo HTTP ${response.status}${response.status === 401 || response.status === 403 ? ' (revisar autorización)' : response.status === 429 ? ' (límite o cuota del proveedor)' : ''}.`;
    if (!validates(await response.json())) return `${name}: respondió, pero no devolvió el resultado esperado.`;
    return `${name}: OK (${((Date.now() - start) / 1000).toFixed(1)} s).`;
  } catch (error) { return `${name}: ${['TimeoutError','AbortError'].includes(error.name) ? 'no respondió en 15 segundos' : 'fallo de conexión'}.`; }
}
export async function checkAiServices(userId) {
  const previous = cached.get(userId);
  if (previous && Date.now() - previous.time < 60_000) return 'Última comprobación (menos de un minuto):\n' + await previous.result;
  const openai = process.env.OPENAI_API_KEY, claude = process.env.ANTHROPIC_API_KEY;
  const result = Promise.all([
    probe('Chat · GPT-6.1 Terra', 'https://api.openai.com/v1/chat/completions', { method:'POST',headers:{Authorization:`Bearer ${openai}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-6.1-terra',messages:[{role:'user',content:'Reply OK.'}],max_completion_tokens:8}) }, !openai, data=>Boolean(data.choices?.[0]?.message?.content?.trim())),
    probe('Estrategia · Claude Opus 5.5', 'https://api.anthropic.com/v1/messages', { method:'POST',headers:{'x-api-key':claude,'anthropic-version':'2023-06-01','Content-Type':'application/json'},body:JSON.stringify({model:'claude-opus-5-5',messages:[{role:'user',content:'Reply OK.'}],max_tokens:16}) }, !claude, data=>data.content?.some(block=>block.type==='text'&&block.text?.trim())),
    probe('Acceso a imágenes · GPT Image 2.5 Sunburst', 'https://api.openai.com/v1/models/gpt-image-2.5-sunburst', { headers:{Authorization:`Bearer ${openai}`} }, !openai, data=>data.id==='gpt-image-2.5-sunburst'),
  ]).then(lines=>lines.join('\n')+'\n\nChat y estrategia: respuestas reales de prueba. Imágenes: solo acceso al modelo; no se ha generado ninguna imagen ni gastado tu crédito PRO. Esto no comprueba que una generación completa vaya a terminar correctamente.');
  cached.set(userId,{time:Date.now(),result});
  return result;
}
