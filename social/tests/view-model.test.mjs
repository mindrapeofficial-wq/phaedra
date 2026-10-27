import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, safeHttpUrl, messageTimestamp, channelName, validateAudioFile,
  deduplicateMessages } from '../src/view-model.js';

test('community addresses reject embedded credentials, non-local plaintext and token-bearing URLs', () => {
  for (const url of ['https://me:secret@example.org/api', 'http://example.org', 'javascript:alert(1)',
    'https://example.org/api?token=secret', 'https://example.org/#secret', 'file:///tmp/chat']) {
    assert.throws(() => safeHttpUrl(url));
  }
  assert.equal(safeHttpUrl('https://chat.example.org/api/'), 'https://chat.example.org/api');
  assert.equal(safeHttpUrl('http://127.0.0.1:18080/api'), 'http://127.0.0.1:18080/api');
});

test('distribution config excludes credentials and limits service origins to explicit origins', () => {
  const config = normalizeConfig({ schemaVersion: 1, apiUrl: 'https://chat.example.org/api',
    token: 'should-not-be-distributed', password: 'secret', allowedServiceOrigins: ['wss://events.example.org'] });
  assert.equal(config.token, undefined);
  assert.equal(config.password, undefined);
  assert.deepEqual(config.allowedServiceOrigins, ['https://events.example.org']);
  assert.throws(() => normalizeConfig({ schemaVersion: 1, allowedServiceOrigins: ['https://a.example.org/path'] }));
  assert.throws(() => normalizeConfig({ schemaVersion: 2 }));
});

test('audio selection rejects empty and oversized files without uploading them', () => {
  assert.throws(() => validateAudioFile({ name: 'demo.wav', type: 'audio/wav', size: 0 }, 1024));
  assert.throws(() => validateAudioFile({ name: 'demo.wav', type: 'audio/wav', size: 1025 }, 1024));
  assert.throws(() => validateAudioFile({ name: 'script.html', type: 'text/html', size: 12 }, 1024));
  assert.equal(validateAudioFile({ name: 'take.FLAC', type: '', size: 12 }, 1024).name, 'take.FLAC');
});

test('history overlap with a live event yields one message in chronological order', () => {
  assert.deepEqual(deduplicateMessages([{ _id: 'b', content: 'new' }, { _id: 'a' }, { _id: 'b', content: 'edited' }]),
    [{ _id: 'a' }, { _id: 'b', content: 'edited' }]);
});

test('direct message label uses the other account and timestamps come from actual message ids', () => {
  const users = new Map([['other', { username: 'Galante' }]]);
  assert.equal(channelName({ channel_type: 'DirectMessage', recipients: ['self', 'other'] }, users, 'self'), 'Galante');
  assert.equal(messageTimestamp({ _id: 'not-an-id' }), null);
  assert.equal(messageTimestamp({ _id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }).getTime(), 1469922850259);
});
