import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMentions, mentionPeople } from './mentions.js';

test('a username becomes a real @ mention', () => {
  assert.deepEqual(applyMentions('Lucas, perdona.', [{ id: 5, name: 'Lucas', username: 'lucas_beats' }]), { text: '@lucas_beats, perdona.' });
});

test('without a username the name is linked to the person', () => {
  const result = applyMentions('🍌 L, perdona.', [{ id: 5, name: 'L' }]);
  assert.equal(result.text, '🍌 @L, perdona.');
  assert.deepEqual(result.entities, [{ type: 'text_mention', offset: 3, length: 2, user: { id: 5 } }]);
});

test('parts of words, other cases, links and existing mentions are not changed twice', () => {
  const people = [{ id: 5, name: 'L', username: 'ele' }];
  assert.equal(applyMentions('La base y l. Lite', people).text, 'La base y l. Lite');
  assert.equal(applyMentions('https://x.com/L ok', people).text, 'https://x.com/L ok');
  assert.equal(applyMentions('@L ok', people).text, '@ele ok');
});

test('the owner, the bot name and ambiguous names are never mentioned', () => {
  const people = mentionPeople([
    { userId: 1, name: 'Owner', username: 'private' }, { userId: 2, name: 'Emil' },
    { userId: 3, name: 'Ana' }, { userId: 4, name: 'Ana' }, { userId: 5, name: 'L', username: 'ele' },
  ], 1, { id: 1, first_name: 'Owner', username: 'private' });
  assert.deepEqual(people.map(person => person.name), ['L']);
});

test('the sender wins over a member with the same name', () => {
  const people = mentionPeople([{ userId: 3, name: 'Ana' }], 1, { id: 9, first_name: 'Ana', username: 'ana9' });
  assert.equal(people[0].id, 9);
});
