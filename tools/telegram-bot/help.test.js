import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.BANANA_PROMO_OFF = '1';
const { helpMessage, helpTopic, MENU_COMMANDS } = await import('./help.js');
const native = fetch;
globalThis.fetch = async () => Response.json([{ telegram_id: 1 }]);

test('owner commands stay out of everyone else\'s help', async () => {
  assert.doesNotMatch(await helpMessage(), /\/gasto|\/estadoia/);
  assert.match(await helpMessage({ isOwner: true }), /\/gasto/);
});
test('topics accept accents and aliases, and unknown ones list the options', async () => {
  assert.equal(helpTopic('Imágenes'), helpTopic('portadas'));
  assert.match(await helpMessage({ argument: 'xyz' }), /portadas/);
});
test('the group gets a short answer that points to private chat', async () => {
  assert.match(await helpMessage({ isGroup: true }), /start=help/);
});
test('every advertised menu command is handled by the bot', () => {
  const bot = readFileSync(new URL('./bot.js', import.meta.url), 'utf8');
  for (const { command } of MENU_COMMANDS) assert.ok(bot.includes(command), command);
  globalThis.fetch = native;
});
