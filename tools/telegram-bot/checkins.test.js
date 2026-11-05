import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_OWNER_ID = '1';
const { shouldCheckIn } = await import('./checkins.js');
const { chooseRoute } = await import('./openai-chat.js');

const now = Date.parse('2026-11-20T12:00:00Z'), profile = { goals: 'sacar un single' };

test('a check-in needs something real to follow and respects opting out', () => {
  assert.equal(shouldCheckIn({ telegram_id: 7, state: { profile } }, now), true);
  assert.equal(shouldCheckIn({ telegram_id: 7, state: { profile: {} } }, now), false);
  assert.equal(shouldCheckIn({ telegram_id: 7, state: { profile, checkinsOff: true } }, now), false);
  assert.equal(shouldCheckIn({ telegram_id: 1, state: { profile } }, now), false);
});

test('at most one a week, and silence stops them', () => {
  const lastWeek = now - 8 * 24 * 3600_000;
  assert.equal(shouldCheckIn({ telegram_id: 7, state: { profile, checkinAt: now - 3600_000, history: [{ role: 'user' }] } }, now), false);
  assert.equal(shouldCheckIn({ telegram_id: 7, state: { profile, checkinAt: lastWeek, history: [{ role: 'assistant' }] } }, now), false);
  assert.equal(shouldCheckIn({ telegram_id: 7, state: { profile, checkinAt: lastWeek, history: [{ role: 'user' }] } }, now), true);
});

test('the route follows the task', () => {
  assert.equal(chooseRoute('hola qué tal'), 'simple');
  assert.equal(chooseRoute('gracias'), 'simple');
  assert.equal(chooseRoute('hazme una base'), 'normal');
  assert.equal(chooseRoute('hola', true), 'normal');
  assert.equal(chooseRoute('que puedo hacer con 50€ de presupuesto', true), 'complex');
  assert.equal(chooseRoute('¿Qué harías con 50 € de presupuesto para mi lanzamiento?'), 'complex');
  assert.equal(chooseRoute('x'.repeat(300)), 'complex');
});
