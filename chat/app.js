const API = '/api/chat';
const ROOMS = [
  { id: 'general', name: 'General', intro: 'Conecta con otros productores, comparte ideas y pregunta sobre Phaedra.' },
  { id: 'produccion', name: 'Producción', intro: 'Hablemos de pistas, plugins, mezcla, mastering y MIDI.' },
  { id: 'ayuda', name: 'Ayuda', intro: 'Preguntas y respuestas entre usuarios. Para errores reproducibles usa GitHub Issues.' },
  { id: 'desarrollo', name: 'Desarrollo', intro: 'Comparte ideas sobre el futuro del DAW y sus nuevas funciones.' },
];
const el = id => document.getElementById(id);
let token = sessionStorage.getItem('phaedra_chat_token') || '';
let nick = '';
let room = 'general';
let lastId = 0;
let busy = false;
let sending = false;
const seen = new Set();

async function api(action, { method = 'GET', data, auth = false, query = {} } = {}) {
  const u = new URL(API, location.origin);
  u.searchParams.set('action', action);
  for (const [key, value] of Object.entries(query)) u.searchParams.set(key, String(value));
  const headers = { Accept: 'application/json' };
  if (data) headers['Content-Type'] = 'application/json';
  if (auth && token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(u, { method, headers, body: data ? JSON.stringify(data) : undefined, cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'NETWORK_ERROR');
    error.status = response.status;
    throw error;
  }
  return result;
}

function setConnection(online, label) {
  el('status-dot').classList.toggle('connected', online);
  el('connection-label').textContent = label;
}

function setHint(text) { el('hint').textContent = text; }

function formatTime(date) {
  const t = new Date(date);
  if (Number.isNaN(t.getTime())) return '';
  return t.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function makeMessage(message) {
  const wrapper = document.createElement('article');
  wrapper.className = 'message';
  wrapper.dataset.messageId = message.id;
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = (message.nick || '?').slice(0, 1).toUpperCase();
  const body = document.createElement('div');
  const header = document.createElement('div');
  header.className = 'message-header';
  const name = document.createElement('span');
  name.className = 'message-name';
  name.textContent = message.nick;
  const when = document.createElement('time');
  when.className = 'message-time';
  when.dateTime = message.at;
  when.textContent = formatTime(message.at);
  header.append(name, when);
  const text = document.createElement('p');
  text.className = 'message-text';
  text.textContent = message.body; // Text only. Never render user HTML.
  body.append(header, text);
  wrapper.append(avatar, body);
  return wrapper;
}

function renderMessages(messages) {
  const timeline = el('timeline');
  const stayAtBottom = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 140 || lastId === 0;
  const list = el('message-list');
  for (const m of messages) {
    const id = Number(m.id);
    if (!Number.isSafeInteger(id) || seen.has(m.id)) continue;
    seen.add(m.id);
    list.append(makeMessage(m));
    if (id > lastId) lastId = id;
  }
  while (list.children.length > 240) {
    const oldest = list.firstElementChild;
    if (oldest) {
      seen.delete(oldest.dataset.messageId);
      oldest.remove();
    }
  }
  if (stayAtBottom) timeline.scrollTop = timeline.scrollHeight;
}

async function refreshMessages() {
  if (busy || !nick) return;
  busy = true;
  const targetRoom = room;
  try {
    let after = lastId;
    // Keep fetching when more than 75 messages arrive between polls.
    for (let page = 0; page < 4; page++) {
      const payload = await api('messages', { query: { room: targetRoom, after } });
      if (room !== targetRoom) return;
      renderMessages(payload.messages || []);
      if (!payload.messages || payload.messages.length < 75) break;
      after = lastId;
    }
    setConnection(true, 'CONECTADO');
  } catch {
    setConnection(false, 'SIN CONEXIÓN');
  } finally {
    busy = false;
  }
}

async function refreshPresence() {
  if (!nick) return;
  const current = room;
  try {
    const result = await api('presence', { query: { room: current } });
    if (room !== current) return;
    el('online-count').textContent = result.online + (result.online === 1 ? ' conectado' : ' conectados');
    el('presence-number').textContent = String(result.online).padStart(2, '0');
    const container = el('people');
    container.replaceChildren();
    for (const nickname of result.nicknames) {
      const item = document.createElement('div');
      item.className = 'person';
      const dot = document.createElement('span');
      dot.className = 'person-dot';
      const label = document.createElement('span');
      label.textContent = nickname;
      item.append(dot, label);
      container.append(item);
    }
    if (!result.nicknames.length) {
      const none = document.createElement('p');
      none.className = 'no-people';
      none.textContent = 'Todavía no hay nadie conectado en esta sala.';
      container.append(none);
    }
  } catch {
    // Presence is secondary to messages; do not block the chat.
  }
}

async function heartbeat() {
  if (!nick) return;
  try { await api('heartbeat', { method: 'POST', auth: true, data: { room } }); } catch (e) {
    if (e.status === 401) signOut(false);
  }
}

function roomButton(item) {
  const btn = document.createElement('button');
  btn.className = 'room-button' + (room === item.id ? ' active' : '');
  btn.type = 'button';
  btn.setAttribute('aria-current', room === item.id ? 'page' : 'false');
  const hash = document.createElement('span');
  hash.className = 'hash';
  hash.textContent = '#';
  const name = document.createElement('span');
  name.textContent = item.name;
  btn.append(hash, name);
  btn.addEventListener('click', () => chooseRoom(item.id));
  return btn;
}

function chooseRoom(id) {
  if (!ROOMS.some(x => x.id === id) || room === id) return;
  room = id;
  lastId = 0;
  seen.clear();
  el('message-list').replaceChildren();
  updateRoomUI();
  refreshMessages();
  heartbeat();
  refreshPresence();
}

function updateRoomUI() {
  const current = ROOMS.find(x => x.id === room);
  el('rooms').replaceChildren(...ROOMS.map(roomButton));
  el('room-title').textContent = current.name;
  el('room-slug').textContent = room.toUpperCase();
  el('welcome-title').textContent = '#'+current.name;
  el('welcome-description').textContent = current.intro;
  el('message-input').placeholder = 'Escribe algo en #' + room + '...';
  document.title = 'PHAEDRA / #' + room;
}

function signOut(revoke = true) {
  if (revoke && token) api('logout', { method: 'POST', auth: true, data: {} }).catch(() => {});
  token = '';
  nick = '';
  lastId = 0;
  seen.clear();
  sessionStorage.removeItem('phaedra_chat_token');
  el('identity-nick').textContent = 'Invitado';
  el('identity-subtitle').textContent = 'Sin conectar';
  el('identity-avatar').textContent = '?';
  el('message-list').replaceChildren();
  el('message-input').disabled = true;
  el('send').disabled = true;
  el('logout').hidden = true;
  el('join-overlay').hidden = false;
  setConnection(false, 'SIN IDENTIFICAR');
  setHint('Elige un apodo para participar.');
  el('nickname').focus();
}

async function activate(nickname, secret) {
  nick = nickname;
  token = secret;
  sessionStorage.setItem('phaedra_chat_token', token);
  el('identity-nick').textContent = nick;
  el('identity-avatar').textContent = nick.slice(0, 1).toUpperCase();
  el('identity-subtitle').textContent = 'Invitado conectado';
  el('join-overlay').hidden = true;
  el('message-input').disabled = false;
  el('send').disabled = false;
  el('logout').hidden = false;
  setHint('Pulsa Enter para enviar · máximo 500 caracteres');
  el('message-input').focus();
  updateRoomUI();
  await heartbeat();
  await refreshMessages();
  await refreshPresence();
}

el('join-form').addEventListener('submit', async event => {
  event.preventDefault();
  el('join-error').textContent = '';
  el('join-button').disabled = true;
  try {
    const result = await api('join', { method: 'POST', data: { nickname: el('nickname').value } });
    await activate(result.nickname, result.token);
  } catch (error) {
    el('join-error').textContent =
      error.status === 429 ? 'Demasiados accesos desde esta conexión. Inténtalo más tarde.' :
      error.status === 400 ? 'Usa entre 2 y 24 letras o números.' :
      'El servidor de Phaedra Chat no está disponible. Vuelve a intentarlo.';
  } finally {
    el('join-button').disabled = false;
  }
});

el('message-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (sending || !nick) return;
  const input = el('message-input');
  const text = input.value.trim();
  if (!text) return;
  sending = true;
  el('send').disabled = true;
  try {
    await api('send', { method: 'POST', auth: true, data: { room, body: text } });
    input.value = '';
    setHint('Mensaje enviado');
    await refreshMessages();
  } catch (error) {
    if (error.status === 401) return signOut(false);
    setHint(error.status === 429 ? 'Espera unos segundos antes de escribir de nuevo.' :
      'No se ha podido enviar. Tu mensaje sigue en el cuadro de texto.');
  } finally {
    sending = false;
    el('send').disabled = false;
    input.focus();
  }
});

el('logout').addEventListener('click', () => signOut(true));
updateRoomUI();
(async () => {
  if (!token) return signOut(false);
  try {
    const result = await api('me', { auth: true });
    await activate(result.nickname, token);
  } catch {
    signOut(false);
  }
})();
setInterval(() => { if (document.visibilityState === 'visible') refreshMessages(); }, 2800);
setInterval(() => { if (document.visibilityState === 'visible') refreshPresence(); }, 12000);
setInterval(heartbeat, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { heartbeat(); refreshMessages(); refreshPresence(); }
});
