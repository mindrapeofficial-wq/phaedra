import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOMS, normalizeMessage, normalizeNickname, validAfter, validRoom, validToken } from '../lib/validation.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('four first-party rooms', () => {
  assert.deepEqual(ROOMS.map(r => r.id), ['general', 'produccion', 'ayuda', 'desarrollo']);
  assert.equal(validRoom('general'), true);
  assert.equal(validRoom('private'), false);
  assert.equal(validRoom('../general'), false);
});
test('guest names are normalized but impersonating staff is blocked', () => {
  assert.equal(normalizeNickname('  La Productora  '), 'La Productora');
  assert.equal(normalizeNickname('Ángel_99'), 'Ángel_99');
  assert.equal(normalizeNickname('Administrador'), ''); // reserved staff-like nickname
  assert.equal(normalizeNickname('admin'), '');
  assert.equal(normalizeNickname('<script>'), '');
  assert.equal(normalizeNickname('x'), '');
  assert.equal(normalizeNickname('x'.repeat(25)), '');
});
test('messages have bounded length and cannot contain controls', () => {
  assert.equal(normalizeMessage('  Hola\\nPhaedra  '), 'Hola\\nPhaedra');
  assert.equal(normalizeMessage('abc'.repeat(170)), '');
  assert.equal(normalizeMessage(''), '');
  assert.equal(normalizeMessage(123), '');
});
test('message cursors and auth tokens are strictly checked', () => {
  assert.equal(validAfter('12'), 12);
  assert.equal(validAfter('0'), 0);
  assert.equal(validAfter('-1'), null);
  assert.equal(validAfter('2 OR 1=1'), null);
  assert.equal(validToken('0'.repeat(64)), true);
  assert.equal(validToken('not-a-token'), false);
});
test('all content belongs to Phaedra, not IRC', () => {
  const files = ['index.html', 'app.js', 'api/chat.mjs'];
  for (const name of files) {
    const s = readFileSync(path.join(ROOT, name), 'utf8');
    assert.equal(/libera\.chat|ardour\.org\/chat|IRC|Discord/i.test(s), false, name);
  }
  assert.ok(readFileSync(path.join(ROOT, 'app.js'), 'utf8').includes('text.textContent = message.body'));
});
