import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as model from '../src/view-model.js';

// Exercise the actual UI event handlers without browser or network dependencies.
// This small DOM model covers the standard methods used by the social panel.
class Element {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName; this.id = id; this.children = []; this.dataset = {};
    this.style = {}; this.attributes = {}; this.listeners = new Map(); this.className = '';
    this.hidden = false; this.disabled = false; this.value = ''; this.open = false;
    this.scrollTop = 0; this.scrollHeight = 100; this.clientHeight = 100; this.files = [];
    this.pauseCount = 0; this.loadCount = 0;
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return (this._text || '') + this.children.map((node) => node.textContent).join(''); }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  insertBefore(node, next) { node.parent = this; const index = this.children.indexOf(next); index < 0 ? this.children.push(node) : this.children.splice(index, 0, node); }
  replaceWith(node) { const index = this.parent.children.indexOf(this); node.parent = this.parent; this.parent.children[index] = node; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }
  addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(handler); }
  async fire(type, data = {}) { await Promise.all((this.listeners.get(type) || []).map((handler) => handler({ preventDefault() {}, ...data }))); }
  click() { return this.fire('click'); }
  requestSubmit() { return this.fire('submit'); }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  pause() { this.pauseCount++; }
  load() { this.loadCount++; }
  querySelectorAll(selector) {
    const matches = (node) => selector.startsWith('.') ? node.className.split(/\s+/).includes(selector.slice(1)) : node.tagName === selector.split(':')[0];
    const results = [];
    const walk = (node) => { for (const child of node.children) { if (matches(child)) results.push(child); walk(child); } };
    walk(this); return results;
  }
  querySelector(selector) { const all = this.querySelectorAll(selector); return selector.endsWith(':last-child') ? all.at(-1) : all[0]; }
}

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?;\n/gm, '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const SELF = { _id: 'SELF', username: 'Productor', relationship: 'User' };
const FRIEND = { _id: 'FRIEND', username: 'Amiga', discriminator: '0001', relationship: 'Friend' };
const CHANNEL = { _id: 'CHANNEL', channel_type: 'DirectMessage', recipients: ['SELF', 'FRIEND'] };
const AUDIO = { _id: 'AUDIO', tag: 'attachments', filename: 'demo.wav', size: 120, content_type: 'audio/wav' };
const FIRST = { _id: '01AAAAAAAAAAAAAAAAAAAAAAAA', channel: 'CHANNEL', author: 'FRIEND', content: 'Primera mezcla', attachments: [AUDIO] };
const SECOND = { _id: '01BBBBBBBBBBBBBBBBBBBBBBBB', channel: 'CHANNEL', author: 'SELF', content: 'Escuchando' };

async function ui(options = {}) {
  const ids = new Map();
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const node = new Element(match[1], match[3]);
    node.hidden = /\bhidden\b/.test(match[2]); node.disabled = /\bdisabled\b/.test(match[2]);
    ids.set(match[3], node);
  }
  const empty = ids.get('conversation-empty');
  empty.append(new Element('h2'), new Element('p'));
  const $ = (id) => { assert.ok(ids.has(id), `known DOM id: ${id}`); return ids.get(id); };
  const clients = [];
  class Client extends EventTarget {
    constructor() {
      super(); clients.push(this); this.index = clients.length;
      this.channels = new Map([['CHANNEL', CHANNEL]]);
      this.users = new Map([['SELF', SELF], ['FRIEND', FRIEND], ...(options.users || []).map((user) => [user._id, user])]);
      this.servers = new Map(); this.currentUser = null; this.historyCalls = 0;
      this.friendCalls = []; this.sent = [];
    }
    emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
    connect() { this.emit('state', { status: 'authenticating' }); return new Promise((resolve, reject) => { this.resolveConnect = resolve; this.rejectConnect = reject; }); }
    succeed() { this.currentUser = { ...SELF, username: `Productor ${this.index}` }; this.ready(); this.resolveConnect?.(); }
    ready() { this.emit('state', { status: 'online' }); this.emit('ready', {}); }
    disconnect() { this.currentUser = null; this.emit('state', { status: 'offline' }); this.rejectConnect?.(Object.assign(new Error('Cancelado'), { code: 'CANCELLED' })); }
    async logout() { this.disconnect(); }
    async getMessages(channel, params) { this.historyCalls++; return options.history ? options.history(this, channel, params) : [FIRST, SECOND]; }
    async sendMessage(channel, data) { this.sent.push(data); return options.send ? options.send(this, channel, data) : { ...SECOND, ...data, _id: '01CCCCCCCCCCCCCCCCCCCCCCCC', channel }; }
    async uploadFile() { return 'AUDIO'; }
    async addFriend(username) {
      this.friendCalls.push(username);
      const found = [...this.users.values()].find((user) => `${user.username}#${user.discriminator}` === username);
      const user = { ...found, relationship: 'Friend' }; this.users.set(user._id, user); this.emit('user', user); return user;
    }
    async openDirectMessage() { return CHANNEL; }
    fileUrl(file) { return `https://chat.example.test/autumn/attachments/${file._id}/original`; }
  }
  const document = { getElementById: $, createElement: (tag) => new Element(tag), querySelectorAll: () => [] };
  const window = new EventTarget();
  const timers = new Set();
  const fakeTimer = (callback, delay) => { const handle = setTimeout(callback, delay); handle.unref?.(); timers.add(handle); return handle; };
  const configFetch = async () => new Response(JSON.stringify({ schemaVersion: 1, apiUrl: 'https://chat.example.test/api', registrationUrl: '', allowedServiceOrigins: [] }), { status: 200 });
  const names = ['StoatClient', ...Object.keys(model), 'document', 'window', 'fetch', 'setTimeout', 'clearTimeout'];
  await new AsyncFunction(...names, source)(Client, ...Object.values(model), document, window, configFetch, fakeTimer, clearTimeout);
  function startLogin() { $('email').value = 'producer@example.test'; $('password').value = 'password'; return $('login-form').fire('submit'); }
  async function login() { const promise = startLogin(); const client = clients.at(-1); client.succeed(); await promise; await flush(); return client; }
  return { $, clients, startLogin, login, cleanup: () => timers.forEach(clearTimeout) };
}

test('cancelled login cannot replace a later successful session', async (t) => {
  const h = await ui(); t.after(h.cleanup);
  const firstLogin = h.startLogin(); const old = h.clients[0];
  assert.equal(h.$('login-cancel').hidden, false);
  await h.$('login-cancel').click(); await firstLogin;
  assert.equal(h.$('login-submit').disabled, false);
  const secondLogin = h.startLogin(); const current = h.clients[1];
  old.succeed(); await flush();
  assert.equal(h.$('workspace').hidden, true);
  assert.equal(h.$('login-submit').disabled, true);
  current.succeed(); await secondLogin; await flush();
  assert.equal(h.$('workspace').hidden, false);
  assert.equal(h.$('self-name').textContent, 'Productor 2');
});

test('message edits and deletion affect only their node; channel deletion clears playback', async (t) => {
  const h = await ui(); t.after(h.cleanup); const client = await h.login();
  const audioNode = h.$('messages').querySelector('audio');
  const unchangedMessage = h.$('messages').children[0];
  client.emit('message', { ...SECOND, content: 'Ya la escuché' });
  assert.equal(h.$('messages').children[0], unchangedMessage);
  assert.equal(h.$('messages').querySelector('audio'), audioNode);
  assert.equal(audioNode.pauseCount, 0);
  assert.ok(h.$('messages').textContent.includes('Ya la escuché'));
  client.emit('messageDelete', { id: FIRST._id, channel: 'CHANNEL' });
  assert.equal(audioNode.pauseCount, 1);
  assert.equal(h.$('messages').children.length, 1);
  client.channels.delete('CHANNEL'); client.emit('channelDelete', { id: 'CHANNEL' });
  assert.equal(h.$('messages').children.length, 0);
  assert.equal(h.$('message-input').disabled, true);
});

test('late send completion after logout cannot erase a new session draft or insert old messages', async (t) => {
  let finishSend;
  const h = await ui({ send: () => new Promise((resolve) => { finishSend = resolve; }) }); t.after(h.cleanup);
  await h.login(); h.$('message-input').value = 'Envío anterior';
  const oldSend = h.$('composer').fire('submit');
  await h.$('logout').click();
  await h.login(); h.$('message-input').value = 'Borrador de la nueva sesión';
  finishSend({ ...SECOND, _id: '01DDDDDDDDDDDDDDDDDDDDDDDD', content: 'Envío anterior' });
  await oldSend;
  assert.equal(h.$('message-input').value, 'Borrador de la nueva sesión');
  assert.ok(!h.$('messages').textContent.includes('Envío anterior'));
});

test('Ready during send defers history refresh and preserves an unchanged playing attachment', async (t) => {
  let finishSend; let sent = false;
  const next = { ...SECOND, _id: '01CCCCCCCCCCCCCCCCCCCCCCCC', content: 'Nuevo mensaje' };
  const h = await ui({ history: () => sent ? [FIRST, SECOND, next] : [FIRST, SECOND],
    send: () => new Promise((resolve) => { finishSend = resolve; }) }); t.after(h.cleanup);
  const client = await h.login(); const audio = h.$('messages').querySelector('audio');
  h.$('message-input').value = 'Nuevo mensaje'; const sending = h.$('composer').fire('submit');
  client.emit('state', { status: 'reconnecting' }); client.ready(); await flush();
  assert.equal(client.historyCalls, 1);
  sent = true; finishSend(next); await sending; await flush();
  assert.equal(client.historyCalls, 2);
  assert.equal(h.$('messages').querySelector('audio'), audio);
  assert.equal(audio.pauseCount, 0);
  assert.equal(h.$('messages').children.length, 3);
});

test('pending friend requests are visible and incoming requests can be accepted', async (t) => {
  const incoming = { _id: 'INCOMING', username: 'Nueva', discriminator: '0002', relationship: 'Incoming' };
  const outgoing = { _id: 'OUTGOING', username: 'Otro', discriminator: '0003', relationship: 'Outgoing' };
  const h = await ui({ users: [incoming, outgoing] }); t.after(h.cleanup); const client = await h.login();
  assert.ok(h.$('contact-list').textContent.includes('Aceptar solicitud'));
  assert.ok(h.$('contact-list').textContent.includes('Solicitud enviada'));
  const accept = h.$('contact-list').children.find((node) => node.textContent.includes('Aceptar solicitud'));
  await accept.click(); await flush();
  assert.deepEqual(client.friendCalls, ['Nueva#0002']);
  assert.ok(!h.$('contact-list').textContent.includes('Aceptar solicitud'));
});

test('failed history can be retried in the same channel and newly fetched author names render', async (t) => {
  const h = await ui({ history: (client) => {
    if (client.historyCalls === 1) throw new Error('Servidor temporalmente no disponible');
    client.users.set('FRIEND', { ...FRIEND, display_name: 'Nombre actualizado' });
    return [FIRST];
  } }); t.after(h.cleanup); const client = await h.login();
  assert.equal(h.$('load-older').textContent, 'Reintentar historial');
  const channel = h.$('channel-list').children.find((node) => node.tagName === 'button');
  await channel.click(); await flush();
  assert.equal(client.historyCalls, 2);
  assert.ok(h.$('messages').textContent.includes('Nombre actualizado'));
  assert.ok(h.$('contact-list').textContent.includes('Nombre actualizado'));
});

test('session revocation removes private timeline and stops audio before returning to login', async (t) => {
  const h = await ui(); t.after(h.cleanup); const client = await h.login();
  const audio = h.$('messages').querySelector('audio');
  client.currentUser = null;
  client.emit('state', { status: 'error', error: Object.assign(new Error('La sesión se ha revocado.'), { code: 'AUTHENTICATION_FAILED' }) });
  assert.equal(h.$('workspace').hidden, true);
  assert.equal(h.$('login-view').hidden, false);
  assert.equal(h.$('messages').children.length, 0);
  assert.equal(h.$('contact-list').children.length, 0);
  assert.equal(audio.pauseCount, 1);
  assert.equal(h.$('password').disabled, false);
  assert.ok(h.$('login-error').textContent.includes('revocado'));
  client.succeed(); await flush();
  assert.equal(h.$('workspace').hidden, true);
});
