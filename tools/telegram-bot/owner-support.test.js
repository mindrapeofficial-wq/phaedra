import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOwnerMessage, activeMembers, repliedMember, supportQuestion, isRetouch } from './owner-support.js';

test('retouches are told apart from new requests', () => {
  for (const text of ['retócala', 'ponle fondo morado', 'quítale el texto', 'más luz']) assert.equal(isRetouch(text), true, text);
  for (const text of ['haz una portada nueva', 'genera otra imagen']) assert.equal(isRetouch(text), false, text);
});

const now = Date.parse('2026-11-04T12:00:00Z');
const ary = { id: 2, name: 'Ary' };
const pending = () => ({ pendingOwnerAsk: { candidates: [ary, { id: 3, name: 'Emil' }], message: { text: 'ponle fondo morado' } } });

test('asks when another artist is active, and stays normal when nobody is', () => {
  assert.equal(resolveOwnerMessage({}, 'hola', [ary], now).action, 'ask');
  assert.equal(resolveOwnerMessage({}, 'hola', [], now).action, 'own');
  assert.match(supportQuestion([ary]), /ayudando a Ary.*encargo tuyo/);
});

test('answering that you help enters that artist and restores your message', () => {
  const state = pending();
  const result = resolveOwnerMessage(state, 'ayudando', [], now);
  assert.equal(result.action, 'support');
  assert.equal(result.target.id, 2);
  assert.equal(result.restore.text, 'ponle fondo morado');
  assert.equal(resolveOwnerMessage(state, 'más luz', [ary], now + 1000).target.id, 2);
});

test('naming an artist selects that artist', () => {
  assert.equal(resolveOwnerMessage(pending(), 'ayudo a Emil', [], now).target.id, 3);
  assert.equal(resolveOwnerMessage(pending(), 'emil', [], now).target.id, 3);
});

test('your own work does not touch the artist and is not asked again for a while', () => {
  const state = pending();
  const result = resolveOwnerMessage(state, 'es mío', [], now);
  assert.equal(result.action, 'own');
  assert.equal(result.restore.text, 'ponle fondo morado');
  assert.equal(resolveOwnerMessage(state, 'otra cosa', [ary], now + 60_000).action, 'own');
  assert.equal(resolveOwnerMessage(state, 'otra cosa', [ary], now + 31 * 60_000).action, 'ask');
});

test('support expires and can be ended by hand', () => {
  const state = {}; Object.assign(state, pending());
  resolveOwnerMessage(state, 'ayudando', [], now);
  assert.equal(resolveOwnerMessage(state, '/soporte off', [], now).action, 'ended');
  assert.equal(state.ownerMode, null);
  const old = { ownerMode: { type: 'support', target: ary, until: now - 1 } };
  assert.equal(resolveOwnerMessage(old, 'hola', [], now).action, 'own');
});

test('member detection ignores the owner, bots and stale activity', () => {
  const fresh = new Date(now - 60_000).toISOString(), stale = new Date(now - 3 * 3600_000).toISOString();
  assert.deepEqual(activeMembers([{ userId: 1, name: 'Yo', updated_at: fresh }, { userId: 2, name: 'Ary', updated_at: fresh }, { userId: 3, name: 'Old', updated_at: stale }], 1, now), [ary]);
  assert.equal(repliedMember({ reply_to_message: { from: { id: 9, is_bot: true } } }, 1), null);
  assert.equal(repliedMember({ reply_to_message: { from: { id: 2, first_name: 'Ary' } } }, 1).id, 2);
});
