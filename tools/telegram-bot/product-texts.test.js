import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.BANANA_PROMO_OFF = '1';
const { accountSummary } = await import('./consumption-limit.js');
const { postzen, INSTAGRAM_FULL, INSTAGRAM_DOWN } = await import('./instagram.js');
const { helpMessage, helpTopic } = await import('./help.js');
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');

test('/miplan shows the plan name and a percentage, never money or old daily queries', () => {
  const free = accountSummary({ tier: 'free', percent: 40 });
  assert.match(free, /Tu plan: <b>gratuito<\/b>/);
  assert.match(free, /40% de tu límite gratuito/);
  assert.match(accountSummary({ tier: 'pro_plus', percent: 12 }), /<b>PRO\+<\/b>[\s\S]*12% de tu límite de este mes/);
  assert.match(accountSummary({ tier: 'ultimate', percent: 80 }), /<b>Ultimate<\/b>[\s\S]*Lite/);
  assert.match(accountSummary({ tier: 'pro', percent: 100 }), /Has llegado al límite/);
  for (const tier of ['free', 'pro', 'pro_plus', 'ultimate']) for (const percent of [0, 80, 100]) {
    assert.doesNotMatch(accountSummary({ tier, percent }), /€|EUR|\$|Consultas/);
  }
  assert.doesNotMatch(read('./bot.js'), /Consultas:/);
});

test('/plan adds the plan and consumption to the release plan', () => {
  assert.match(read('./bot.js'), /releasePlanSummary\(userId\)\}\\n\\n\$\{await accountText\(userId\)\}/);
});

test('Instagram service errors never send the person back to /instagram', async () => {
  const native = fetch;
  try {
    for (const status of [402, 500]) {
      globalThis.fetch = async () => new Response('{}', { status });
      const error = await postzen('/connect/instagram').catch(error => error);
      assert.equal(error.message, status === 402 ? INSTAGRAM_FULL : INSTAGRAM_DOWN);
      assert.doesNotMatch(error.message, /\/instagram|PostZen|administrador debe/);
      assert.match(error.message, /@PhaseREM/);
    }
  } finally { globalThis.fetch = native; }
});

test('help introduces Emil from Banana, explains plans and names the human contact', async () => {
  const help = await helpMessage();
  assert.match(help, /soy Emil, la IA manager de artistas de Banana/);
  assert.match(help, /\/miplan: tu plan y tu consumo/);
  assert.match(help, /@PhaseREM/);
  assert.match(helpTopic('música'), /Separar pistas/);
  assert.match(helpTopic('cuenta'), /PRO\+.*Ultimate/);
  assert.doesNotMatch(help, /consultas/i);
});

test('users never see model or provider names in common replies', () => {
  for (const file of ['./ai.js', './instagram-agent.js']) assert.doesNotMatch(read(file), /GPT Image 2\.6 Sunburst ·|API key de ChatGPT|con el cerebro|\(Claude \$\{/);
});
