/**
 * Live integration, deliberately opt-in. Runs only against the loopback instance
 * produced by deploy/local-stoat.mjs and its matching disposable-state marker.
 * No credentials or user records are read from an existing service.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';

const stateDirectory = process.env.PHAEDRA_STOAT_STATE;
const timeout = 20000;

async function readJsonResponse(response, context) {
  if (!response.ok) throw new Error(`${context}: HTTP ${response.status}.`);
  try { return await response.json(); }
  catch { throw new Error(`${context}: expected a JSON response.`); }
}

async function request(apiUrl, path, { method = 'GET', data, token } = {}) {
  const response = await fetch(apiUrl + path, {
    method,
    headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Session-Token': token } : {}) },
    body: data ? JSON.stringify(data) : undefined,
    redirect: 'error', signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}.`);
  return response.status === 204 ? undefined : readJsonResponse(response, `${method} ${path}`);
}

async function verifiedInstance(directory) {
  const manifest = JSON.parse(await readFile(join(resolve(directory), 'phaedra-stoat-local.json'), 'utf8'));
  const here = dirname(fileURLToPath(import.meta.url));
  const lock = JSON.parse(await readFile(join(here, '../deploy/stoat.lock.json'), 'utf8'));
  assert.equal(manifest.kind, 'phaedra-stoat-ephemeral', 'An isolated Phaedra state directory is required.');
  assert.equal(manifest.revision, lock.revision, 'The local source revision must match the reviewed deployment.');
  assert.ok(Number.isInteger(manifest.port) && manifest.port >= 1024 && manifest.port <= 65535, 'Invalid local port.');
  const baseUrl = `http://127.0.0.1:${manifest.port}`;
  assert.equal(manifest.baseUrl, baseUrl, 'Tests can only target loopback.');
  assert.equal(manifest.apiUrl, `${baseUrl}/api`, 'Tests can only target the prepared local API.');
  const markerResponse = await fetch(`${baseUrl}/__phaedra_ephemeral_test`, {
    redirect: 'error', signal: AbortSignal.timeout(timeout),
  });
  const marker = await readJsonResponse(markerResponse, 'Disposable instance identity');
  assert.equal(marker.kind, manifest.kind, 'The server is not the prepared disposable instance.');
  assert.equal(marker.id, manifest.id, 'The server does not match the local state directory.');
  assert.equal(marker.revision, lock.revision, 'Unexpected server source revision.');
  const info = await request(manifest.apiUrl, '/');
  // Never follow instance discovery to a third-party backend from this test.
  for (const endpoint of [info.ws, info.features?.autumn?.url]) {
    assert.ok(typeof endpoint === 'string', 'Instance discovery lacks a required local service.');
    const url = new URL(endpoint);
    assert.equal(url.hostname, '127.0.0.1', 'All discovered services must be loopback.');
    assert.equal(url.port, String(manifest.port), 'All services must use the prepared local gateway.');
  }
  return manifest;
}

async function createTestUser(apiUrl, label) {
  const suffix = randomBytes(8).toString('hex');
  const email = `phaedra-${label.toLowerCase()}-${suffix}@example.com`;
  const password = randomBytes(24).toString('base64url') + 'aA1!';
  await request(apiUrl, '/auth/account/create', { method: 'POST', data: { email, password } });
  const session = await request(apiUrl, '/auth/session/login', {
    method: 'POST', data: { email, password, friendly_name: 'Phaedra isolated test setup' },
  });
  assert.equal(session?.result, 'Success', 'Local test login must succeed without email or MFA.');
  assert.ok(session.token, 'Local login must create a session.');
  let user;
  try {
    user = await request(apiUrl, '/onboard/complete', {
      method: 'POST', token: session.token, data: { username: `Phaedra_${label}_${suffix}` },
    });
  } finally {
    // Setup credentials stay only in memory; the client under test logs in anew.
    await request(apiUrl, '/auth/session/logout', { method: 'POST', token: session.token });
  }
  return { email, password, user };
}

function awaitEvent(client, eventName, predicate) {
  let timer;
  let receive;
  const promise = new Promise((resolveMessage, reject) => {
    receive = (event) => {
      if (predicate(event.detail)) {
        clearTimeout(timer);
        client.removeEventListener(eventName, receive);
        resolveMessage(event.detail);
      }
    };
    client.addEventListener(eventName, receive);
    timer = setTimeout(() => {
      client.removeEventListener(eventName, receive);
      reject(new Error(`A second real user did not receive the expected WebSocket ${eventName} event.`));
    }, timeout);
  });
  // A failed POST must not leave a second unhandled rejection after the test exits.
  promise.catch(() => {});
  return { promise, cancel() { clearTimeout(timer); client.removeEventListener(eventName, receive); } };
}

async function fetchLocalAudio(startUrl) {
  const origin = startUrl.origin;
  let url = startUrl;
  for (let redirects = 0; redirects <= 2; redirects++) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(timeout) });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    await response.body?.cancel();
    assert.ok(location, 'The local file redirect needs a destination.');
    url = new URL(location, url);
    assert.equal(url.origin, origin, 'Audio retrieval may only redirect within the local instance.');
  }
  throw new Error('The local file service returned too many redirects.');
}

function wavSample() {
  const sampleRate = 16000;
  const samples = 3200;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin(i * Math.PI * 880 / sampleRate) * 1000), 44 + i * 2);
  return buffer;
}

test('two real Stoat users exchange a private message and an intact audio attachment', {
  skip: stateDirectory ? false : 'Set PHAEDRA_STOAT_STATE to an isolated local deployment to run live integration.',
  timeout: 150000,
}, async (t) => {
  const manifest = await verifiedInstance(stateDirectory);
  const { StoatClient } = await import('../src/stoat-client.js');
  const alice = new StoatClient();
  const bob = new StoatClient();
  t.after(async () => {
    await Promise.allSettled([alice.logout(), bob.logout()]);
    alice.disconnect(); bob.disconnect();
  });
  const aliceAccount = await createTestUser(manifest.apiUrl, 'Alice');
  const bobAccount = await createTestUser(manifest.apiUrl, 'Bob');
  await alice.connect({ apiUrl: manifest.apiUrl, email: aliceAccount.email, password: aliceAccount.password });
  await bob.connect({ apiUrl: manifest.apiUrl, email: bobAccount.email, password: bobAccount.password });
  assert.equal(alice.currentUser?._id, aliceAccount.user._id, 'Alice must be the authenticated first user.');
  assert.equal(bob.currentUser?._id, bobAccount.user._id, 'Bob must be the authenticated second user.');
  assert.notEqual(alice.currentUser._id, bob.currentUser._id, 'The test requires two distinct real accounts.');
  t.diagnostic('Two isolated accounts registered, onboarded and connected through the real API and WebSocket.');

  await alice.addFriend(`${bob.currentUser.username}#${bob.currentUser.discriminator}`);
  await bob.addFriend(`${alice.currentUser.username}#${alice.currentUser.discriminator}`);
  // Wait for the server's ChannelCreate event before sending the first message.
  // This avoids mistaking a subscription race for a lost-message regression.
  const incomingChannel = awaitEvent(bob, 'channel', (value) => value.channel_type === 'DirectMessage' &&
    value.recipients?.includes(alice.currentUser._id));
  let channel;
  try {
    channel = await alice.openDirectMessage(bob.currentUser._id);
    const receivedChannel = await incomingChannel.promise;
    assert.equal(receivedChannel._id, channel._id, 'Both users must receive the same private conversation.');
  } finally { incomingChannel.cancel(); }
  await bob.openDirectMessage(alice.currentUser._id);
  assert.equal(channel.channel_type, 'DirectMessage', 'The server must create a real private conversation.');

  const content = `Phaedra integration ${randomBytes(8).toString('hex')}`;
  const incoming = awaitEvent(bob, 'message', (message) => message.channel === channel._id && message.content === content);
  let sent;
  try {
    sent = await alice.sendMessage(channel._id, { content });
    const received = await incoming.promise;
    assert.equal(received._id, sent._id, 'The receiving client must get the persisted message, not an echo.');
    assert.equal(received.author, alice.currentUser._id, 'The server must preserve the sender identity.');
  } finally { incoming.cancel(); }
  const history = await bob.getMessages(channel._id);
  assert.ok(history.some((message) => message._id === sent._id), 'The received message must also survive a history fetch.');
  t.diagnostic('Private message delivered to the second user over WebSocket and found in server history.');

  const bytes = wavSample();
  const attachmentId = await alice.uploadFile(new File([bytes], 'phaedra-live-check.wav', { type: 'audio/wav' }));
  assert.ok(typeof attachmentId === 'string' && attachmentId.length, 'The real file service must return an attachment id.');
  const incomingAudio = awaitEvent(bob, 'message', (message) => message.channel === channel._id &&
    message.attachments?.some((attachment) => attachment._id === attachmentId));
  let attached;
  try {
    await alice.sendMessage(channel._id, { content: 'Audio de prueba de Phaedra', attachments: [attachmentId] });
    attached = await incomingAudio.promise;
  } finally { incomingAudio.cancel(); }
  const audio = attached.attachments.find((attachment) => attachment._id === attachmentId);
  assert.equal(audio.filename, 'phaedra-live-check.wav');
  const downloadUrl = new URL(bob.fileUrl(audio));
  assert.equal(downloadUrl.hostname, '127.0.0.1', 'The test audio must remain on the isolated instance.');
  assert.equal(downloadUrl.port, String(manifest.port));
  const download = await fetchLocalAudio(downloadUrl);
  assert.equal(download.status, 200, 'The second user must be able to retrieve the uploaded audio.');
  const downloaded = Buffer.from(await download.arrayBuffer());
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  assert.equal(digest(downloaded), digest(bytes), 'Downloaded audio must be byte-for-byte identical.');
  t.diagnostic('Audio uploaded to Autumn/S3, attached to the conversation, received and downloaded intact.');
});
