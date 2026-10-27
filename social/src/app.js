// SPDX-License-Identifier: GPL-2.0-or-later
import { StoatClient } from './stoat-client.js';
import { normalizeConfig, safeHttpUrl, userName, initials, channelName, isTextChannel,
  messageTimestamp, fileSize, isAudioAttachment, validateAudioFile, deduplicateMessages } from './view-model.js';

const $ = (id) => document.getElementById(id);
const state = {
  client: null, config: null, status: 'offline', activeChannel: null, generation: 0,
  messages: new Map(), unread: new Map(), pendingFile: null, sending: false, loading: false,
  loginBusy: false, loginAttempt: 0, sessionGeneration: 0, toastTimer: null,
  historyComplete: false, historyFailed: false, reloadAfterSend: false,
  messageSignatures: new Map(), seenMessages: new Set(), deletedMessages: new Set(),
};
const statusNames = { offline: 'Sin conexión', authenticating: 'Iniciando sesión…', connecting: 'Conectando…',
  online: 'Conectado', reconnecting: 'Reconectando…', error: 'Sin conexión' };

function textNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function showError(id, message = '') {
  $(id).textContent = message;
  $(id).hidden = !message;
}

function errorText(error) {
  return typeof error?.message === 'string' && error.message.length < 700
    ? error.message : 'No se ha podido completar la operación. Comprueba la conexión.';
}

function toast(message) {
  clearTimeout(state.toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  state.toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500);
}

function setLoginBusy(busy) {
  state.loginBusy = busy;
  for (const id of ['server-url', 'email', 'password', 'login-submit']) $(id).disabled = busy;
  $('login-submit').textContent = busy ? 'Conectando…' : 'Conectar →';
  $('login-cancel').hidden = !busy;
}

function currentClient(client, generation) {
  return state.client === client && state.sessionGeneration === generation;
}

function messageNode(id) {
  return [...$('messages').children].find((node) => node.dataset.messageId === id);
}

function stopAudio(node) {
  for (const audio of node.querySelectorAll('audio')) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
}

function clearMessages() {
  stopAudio($('messages'));
  $('messages').replaceChildren();
  state.messages.clear();
  state.messageSignatures.clear();
}

function forgetMessage(id) {
  state.deletedMessages.add(id);
  while (state.deletedMessages.size > 2000) state.deletedMessages.delete(state.deletedMessages.values().next().value);
  state.messages.delete(id);
  state.messageSignatures.delete(id);
  const node = messageNode(id);
  if (node) { stopAudio(node); node.remove(); }
  $('conversation-empty').hidden = state.messages.size > 0;
}

function resetWorkspace() {
  ++state.generation;
  state.activeChannel = null;
  state.unread.clear();
  state.seenMessages.clear();
  state.deletedMessages.clear();
  state.pendingFile = null;
  state.sending = false;
  state.loading = false;
  state.historyComplete = false;
  state.historyFailed = false;
  state.reloadAfterSend = false;
  clearMessages();
  $('channel-list').replaceChildren();
  $('contact-list').replaceChildren();
  $('contact-count').textContent = '0';
  $('contact-submit').disabled = false;
  $('contact-username').value = '';
  $('self-name').textContent = '';
  $('self-avatar').textContent = '';
  $('message-input').value = '';
  $('message-input').style.height = '';
  $('audio-file').value = '';
  $('load-older').hidden = true;
  $('load-older').disabled = false;
  $('composer-status').textContent = 'Tu música encuentra compañía.';
  $('conversation-title').textContent = 'Bienvenido a Phaedra Social';
  $('conversation-kind').textContent = 'TU ESPACIO';
  for (const id of ['contact-dialog', 'settings-dialog']) if ($(id).open) $(id).close();
  showError('workspace-error');
  showError('contact-error');
}

function returnToLogin({ message = '', disconnect = true } = {}) {
  const client = state.client;
  ++state.sessionGeneration;
  ++state.loginAttempt;
  state.client = null;
  if (disconnect) client?.disconnect();
  resetWorkspace();
  $('workspace').hidden = true;
  $('login-view').hidden = false;
  $('password').value = '';
  $('logout').disabled = false;
  setLoginBusy(false);
  setConnection({ status: 'offline' });
  showError('login-error', message);
  $('password').focus();
}

function updateComposer() {
  const available = state.status === 'online' && Boolean(state.activeChannel) && !state.sending;
  $('message-input').disabled = !available;
  $('attach-audio').disabled = !available;
  $('send-message').disabled = !available || (!($('message-input').value.trim()) && !state.pendingFile);
  $('remove-file').disabled = state.sending;
  $('message-input').placeholder = !state.activeChannel ? 'Selecciona una conversación'
    : state.status !== 'online' ? 'Esperando conexión…' : 'Comparte lo que estás creando…';
  $('pending-file').hidden = !state.pendingFile;
  $('pending-file-name').textContent = state.pendingFile ? `${state.pendingFile.name} · ${fileSize(state.pendingFile.size)}` : '';
}

function setConnection(detail) {
  state.status = detail.status;
  const label = statusNames[detail.status] || 'Sin conexión';
  $('connection-label').textContent = label;
  $('login-status').textContent = label;
  $('self-status').textContent = label;
  $('connection-badge').className = `connection-badge ${Object.hasOwn(statusNames, detail.status) ? detail.status : 'offline'}`;
  if (detail.error && !$('workspace').hidden) showError('workspace-error', errorText(detail.error));
  if (detail.status === 'online') showError('workspace-error');
  updateComposer();
}

function renderChannels() {
  const client = state.client;
  if (!client) return;
  const list = $('channel-list');
  const search = $('channel-search').value.trim().toLocaleLowerCase('es');
  const groups = new Map();
  const channels = [...client.channels.values()].filter(isTextChannel);
  channels.sort((a, b) => channelName(a, client.users, client.currentUser?._id)
    .localeCompare(channelName(b, client.users, client.currentUser?._id), 'es'));
  for (const channel of channels) {
    const name = channelName(channel, client.users, client.currentUser?._id);
    if (search && !name.toLocaleLowerCase('es').includes(search)) continue;
    const groupName = channel.channel_type === 'TextChannel'
      ? String(client.servers?.get(channel.server)?.name || 'Canales') : 'Mensajes directos';
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName).push({ channel, name });
  }
  list.replaceChildren();
  if (!groups.size) {
    list.append(textNode('p', 'sidebar-empty', search ? 'No hay coincidencias.' : 'Todavía no tienes conversaciones. Añade un contacto o entra en un canal desde tu comunidad.'));
    return;
  }
  for (const [group, items] of groups) {
    list.append(textNode('h2', 'channel-section', group.toLocaleUpperCase('es')));
    for (const { channel, name } of items) {
      const button = textNode('button', `channel-button${channel._id === state.activeChannel ? ' active' : ''}`);
      button.type = 'button';
      button.setAttribute('aria-current', channel._id === state.activeChannel ? 'true' : 'false');
      button.append(textNode('span', 'channel-symbol', channel.channel_type === 'TextChannel' ? '#' : '↗'));
      button.append(textNode('span', 'channel-label', name));
      const unread = state.unread.get(channel._id) || 0;
      if (unread) button.append(textNode('span', 'unread-count', unread > 99 ? '99+' : unread));
      button.addEventListener('click', () => selectChannel(channel._id));
      list.append(button);
    }
  }
}

function renderContacts() {
  const client = state.client;
  if (!client) return;
  const sessionGeneration = state.sessionGeneration;
  const peers = new Set([...client.channels.values()].filter((channel) => channel.channel_type === 'DirectMessage')
    .flatMap((channel) => channel.recipients || []));
  const users = [...client.users.values()].filter((user) => user._id !== client.currentUser?._id
    && (['Friend', 'Incoming', 'Outgoing'].includes(user.relationship) || peers.has(user._id))
    && !['Blocked', 'BlockedOther'].includes(user.relationship));
  users.sort((a, b) => Number(b.relationship === 'Incoming') - Number(a.relationship === 'Incoming')
    || Number(Boolean(b.online)) - Number(Boolean(a.online)) || userName(a).localeCompare(userName(b), 'es'));
  $('contact-count').textContent = String(users.length);
  $('contact-list').replaceChildren();
  if (!users.length) $('contact-list').append(textNode('p', 'contacts-empty', 'Tus contactos aparecerán aquí. Puedes añadirlos por su nombre de usuario.'));
  for (const user of users) {
    const incoming = user.relationship === 'Incoming';
    const outgoing = user.relationship === 'Outgoing';
    const button = textNode('button', 'contact-button');
    button.type = 'button';
    button.disabled = outgoing && !peers.has(user._id);
    button.setAttribute('aria-label', incoming ? `Aceptar solicitud de ${userName(user)}` :
      outgoing ? `Solicitud enviada a ${userName(user)}` : `Abrir conversación con ${userName(user)}`);
    const avatar = textNode('span', 'avatar contact-avatar', initials(userName(user)));
    avatar.append(textNode('span', `contact-presence${user.online ? ' online' : ''}`));
    const info = textNode('span', 'contact-text');
    info.append(textNode('span', 'contact-name', userName(user)));
    info.append(textNode('span', 'contact-meta', incoming ? 'Aceptar solicitud →' :
      outgoing ? 'Solicitud enviada' : user.online ? 'En línea' : 'Desconectado'));
    button.append(avatar, info);
    button.addEventListener('click', async () => {
      if (state.status !== 'online') return toast('Espera a recuperar la conexión.');
      button.disabled = true;
      try {
        if (incoming) {
          if (!user.username || !user.discriminator) throw new Error('No se ha cargado el nombre completo de este contacto. Vuelve a conectar para actualizarlo.');
          await client.addFriend(`${user.username}#${user.discriminator}`);
          if (!currentClient(client, sessionGeneration)) return;
          toast('Contacto añadido. Ya podéis conversar.');
          renderContacts();
        }
        const channel = await client.openDirectMessage(user._id);
        if (!currentClient(client, sessionGeneration)) return;
        renderChannels();
        await selectChannel(channel._id);
      } catch (error) { if (currentClient(client, sessionGeneration)) showError('workspace-error', errorText(error)); }
      finally { if (currentClient(client, sessionGeneration)) button.disabled = outgoing && !peers.has(user._id); }
    });
    $('contact-list').append(button);
  }
}

function renderAttachment(attachment) {
  const wrapper = textNode('div', 'attachment');
  let url;
  try { url = state.client.fileUrl(attachment); } catch { /* An untrusted remote service is never loaded. */ }
  if (!url) {
    wrapper.append(textNode('p', 'attachment-unavailable', 'Este archivo no está disponible desde el servidor autorizado.'));
    return wrapper;
  }
  const top = textNode('div', 'attachment-top');
  const info = textNode('div', 'attachment-info');
  info.append(textNode('p', 'attachment-name', attachment.filename || 'Archivo compartido'));
  info.append(textNode('span', 'attachment-size', fileSize(attachment.size)));
  const download = textNode('a', 'attachment-download', '↓');
  download.href = url;
  download.target = '_blank';
  download.rel = 'noreferrer';
  download.setAttribute('aria-label', `Abrir ${attachment.filename || 'archivo compartido'}`);
  top.append(textNode('span', 'attachment-mark', isAudioAttachment(attachment) ? '♫' : '↗'), info, download);
  wrapper.append(top);
  if (isAudioAttachment(attachment)) {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = url;
    audio.setAttribute('aria-label', `Escuchar ${attachment.filename || 'audio compartido'}`);
    wrapper.append(audio);
  }
  return wrapper;
}

function renderMessage(message) {
  const author = state.client.users.get(message.author);
  const own = message.author === state.client.currentUser?._id;
  const name = userName(author);
  const article = textNode('article', `message${own ? ' mine' : ''}`);
  article.dataset.messageId = message._id;
  article.append(textNode('span', 'avatar', initials(name)));
  const body = textNode('div', 'message-body');
  const header = textNode('div', 'message-header');
  header.append(textNode('span', 'message-name', name));
  const date = messageTimestamp(message);
  if (date) {
    const time = textNode('time', 'message-time', new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(date));
    time.dateTime = date.toISOString();
    time.title = date.toLocaleString('es');
    header.append(time);
  }
  body.append(header);
  if (message.content) body.append(textNode('p', 'message-text', message.content));
  else if (message.system) body.append(textNode('p', 'message-text message-system', 'Actividad del canal'));
  for (const attachment of (message.attachments || []).slice(0, 10)) body.append(renderAttachment(attachment));
  article.append(body);
  return article;
}

function messageSignature(message) {
  return JSON.stringify([message.author, userName(state.client?.users.get(message.author)), message.content || '',
    message.system || null, (message.attachments || []).map((attachment) => [attachment._id, attachment.tag,
      attachment.filename, attachment.size, attachment.content_type, attachment.metadata?.type])]);
}

function refreshAuthor(userId) {
  for (const message of state.messages.values()) {
    if (message.author !== userId) continue;
    const node = messageNode(message._id);
    if (!node) continue;
    const name = userName(state.client.users.get(userId));
    node.querySelector('.message-name').textContent = name;
    node.querySelector('.avatar').textContent = initials(name);
    state.messageSignatures.set(message._id, messageSignature(message));
  }
}

function addMessages(messages, { scroll = false } = {}) {
  const timeline = $('timeline');
  const nearBottom = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 140;
  for (const message of deduplicateMessages(messages)) {
    if (message.channel !== state.activeChannel || state.deletedMessages.has(message._id)) continue;
    state.seenMessages.add(message._id);
    while (state.seenMessages.size > 2000) state.seenMessages.delete(state.seenMessages.values().next().value);
    const signature = messageSignature(message);
    const previous = messageNode(message._id);
    state.messages.set(message._id, message);
    if (previous && state.messageSignatures.get(message._id) === signature) continue;
    state.messageSignatures.set(message._id, signature);
    const node = renderMessage(message);
    if (previous) { stopAudio(previous); previous.replaceWith(node); continue; }
    const next = [...$('messages').children].find((child) => child.dataset.messageId > message._id);
    $('messages').insertBefore(node, next || null);
  }
  // Keep existing audio elements alive when other messages arrive.
  $('conversation-empty').hidden = state.messages.size > 0;
  if (scroll || nearBottom) timeline.scrollTop = timeline.scrollHeight;
}

function showConversationEmpty(title, explanation) {
  $('conversation-empty').querySelector('h2').textContent = title;
  $('conversation-empty').querySelector('p:last-child').textContent = explanation;
  $('conversation-empty').hidden = false;
}

async function selectChannel(channelId, { reload = false } = {}) {
  if (state.sending) {
    if (reload && channelId === state.activeChannel) state.reloadAfterSend = true;
    else toast('Espera a que termine el envío.');
    return;
  }
  if (state.status !== 'online') return toast('Espera a recuperar la conexión.');
  if (channelId === state.activeChannel && !reload && !state.historyFailed) return;
  const client = state.client;
  const sessionGeneration = state.sessionGeneration;
  const channel = client?.channels.get(channelId);
  if (!channel || !isTextChannel(channel)) return;
  const preserveTimeline = channelId === state.activeChannel;
  const knownAtStart = new Set(state.messages.keys());
  const generation = ++state.generation;
  state.activeChannel = channelId;
  if (!preserveTimeline) { clearMessages(); state.historyComplete = false; }
  state.historyFailed = false;
  state.loading = true;
  state.unread.delete(channelId);
  $('load-older').disabled = true;
  if (!preserveTimeline) $('load-older').hidden = true;
  if (!preserveTimeline) {
    state.pendingFile = null;
    $('message-input').value = '';
    $('audio-file').value = '';
    $('message-input').style.height = '';
  }
  $('conversation-title').textContent = channelName(channel, client.users, client.currentUser?._id);
  $('conversation-kind').textContent = channel.channel_type === 'TextChannel' ? 'CANAL DE LA COMUNIDAD' : 'CONVERSACIÓN PRIVADA';
  showError('workspace-error');
  if (!state.messages.size) showConversationEmpty('Cargando conversación…', 'Recuperando los mensajes de tu comunidad.');
  renderChannels();
  updateComposer();
  try {
    const messages = await client.getMessages(channelId, { limit: 50 });
    if (!currentClient(client, sessionGeneration) || generation !== state.generation) return;
    if (preserveTimeline) {
      // Reconcile only the fetched window, preserving older history and playing audio.
      // Messages arriving after this request began must not be removed by its snapshot.
      const fetched = new Set(messages.map((message) => message._id));
      const oldestFetched = messages[0]?._id;
      for (const id of knownAtStart) {
        if (!fetched.has(id) && (messages.length < 50 || (oldestFetched && id >= oldestFetched))) forgetMessage(id);
      }
    }
    addMessages(messages, { scroll: !preserveTimeline });
    renderContacts();
    renderChannels();
    $('conversation-title').textContent = channelName(channel, client.users, client.currentUser?._id);
    state.historyComplete = messages.length < 50;
    $('load-older').hidden = state.historyComplete;
    $('load-older').textContent = 'Ver mensajes anteriores';
    if (!state.messages.size) showConversationEmpty('La primera idea es tuya.', 'Envía un mensaje o comparte un archivo de audio para empezar.');
  } catch (error) {
    if (!currentClient(client, sessionGeneration) || generation !== state.generation) return;
    state.historyFailed = true;
    $('load-older').textContent = 'Reintentar historial';
    $('load-older').hidden = false;
    showError('workspace-error', errorText(error));
    if (!state.messages.size) showConversationEmpty('No se ha cargado el historial.', 'Puedes volver a seleccionar esta conversación cuando se recupere la conexión.');
  } finally {
    if (currentClient(client, sessionGeneration) && generation === state.generation) {
      state.loading = false;
      $('load-older').disabled = false;
    }
  }
}

async function enterWorkspace(client, sessionGeneration) {
  if (!currentClient(client, sessionGeneration) || !client.currentUser) return;
  const wasVisible = !$('workspace').hidden;
  $('login-view').hidden = true;
  $('workspace').hidden = false;
  $('password').value = '';
  $('self-name').textContent = userName(client.currentUser);
  $('self-avatar').textContent = initials(userName(client.currentUser));
  $('instance-name').textContent = new URL($('server-url').value).hostname;
  $('settings-api').textContent = $('server-url').value;
  renderChannels();
  renderContacts();
  if (wasVisible && state.activeChannel && client.channels.has(state.activeChannel)) {
    await selectChannel(state.activeChannel, { reload: true });
  } else {
    if (state.activeChannel && !client.channels.has(state.activeChannel)) {
      ++state.generation;
      state.activeChannel = null;
      state.pendingFile = null;
      state.sending = false;
      clearMessages();
      $('message-input').value = '';
      updateComposer();
    }
    const first = [...client.channels.values()].find(isTextChannel);
    if (first) await selectChannel(first._id);
    else showConversationEmpty('Abre una conversación.', 'Añade un contacto o entra en un canal desde tu comunidad para empezar.');
  }
}

function bindClient(client, sessionGeneration) {
  client.addEventListener('state', (event) => {
    if (!currentClient(client, sessionGeneration)) return;
    if (event.detail.status === 'error' && !client.currentUser && !$('workspace').hidden) {
      return returnToLogin({ message: errorText(event.detail.error) });
    }
    setConnection(event.detail);
  });
  client.addEventListener('ready', () => {
    if (!currentClient(client, sessionGeneration)) return;
    void enterWorkspace(client, sessionGeneration).catch((error) => {
      if (currentClient(client, sessionGeneration)) showError('workspace-error', errorText(error));
    });
  });
  client.addEventListener('message', (event) => {
    if (!currentClient(client, sessionGeneration)) return;
    const message = event.detail;
    if (state.deletedMessages.has(message._id)) return;
    const alreadySeen = state.seenMessages.has(message._id);
    state.seenMessages.add(message._id);
    while (state.seenMessages.size > 2000) state.seenMessages.delete(state.seenMessages.values().next().value);
    if (message.channel === state.activeChannel) addMessages([message]);
    else {
      if (!alreadySeen && message.author !== client.currentUser?._id) state.unread.set(message.channel, (state.unread.get(message.channel) || 0) + 1);
      renderChannels();
    }
  });
  client.addEventListener('messageDelete', ({ detail }) => {
    if (!currentClient(client, sessionGeneration)) return;
    forgetMessage(detail.id);
    if (detail.channel === state.activeChannel && !state.messages.size) showConversationEmpty('Todavía no hay mensajes.', 'Comparte una idea para continuar.');
  });
  client.addEventListener('channelDelete', ({ detail }) => {
    if (!currentClient(client, sessionGeneration)) return;
    state.unread.delete(detail.id);
    if (detail.id === state.activeChannel) {
      ++state.generation;
      state.activeChannel = null;
      state.pendingFile = null;
      state.sending = false;
      state.loading = false;
      state.reloadAfterSend = false;
      clearMessages();
      $('message-input').value = '';
      $('load-older').hidden = true;
      $('conversation-title').textContent = 'Conversación no disponible';
      showConversationEmpty('Esta conversación ya no está disponible.', 'Elige otra conversación o abre un contacto.');
      updateComposer();
    }
    renderChannels(); renderContacts();
  });
  client.addEventListener('channel', () => {
    if (currentClient(client, sessionGeneration)) { renderChannels(); renderContacts(); }
  });
  client.addEventListener('user', ({ detail }) => {
    if (!currentClient(client, sessionGeneration)) return;
    renderContacts(); renderChannels(); refreshAuthor(detail._id);
    if (detail._id === client.currentUser?._id) {
      $('self-name').textContent = userName(client.currentUser);
      $('self-avatar').textContent = initials(userName(client.currentUser));
    }
  });
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.loginBusy || !state.config) return;
  showError('login-error');
  let apiUrl;
  try { apiUrl = safeHttpUrl($('server-url').value); }
  catch (error) { return showError('login-error', errorText(error)); }
  setLoginBusy(true);
  $('server-url').value = apiUrl;
  const attempt = ++state.loginAttempt;
  const sessionGeneration = ++state.sessionGeneration;
  const previous = state.client;
  state.client = null;
  previous?.disconnect();
  const client = new StoatClient({ allowedServiceOrigins: state.config.allowedServiceOrigins });
  state.client = client;
  bindClient(client, sessionGeneration);
  try {
    await client.connect({ apiUrl, email: $('email').value.trim(), password: $('password').value });
    if (!currentClient(client, sessionGeneration) || attempt !== state.loginAttempt) return;
    // Ready normally enters the workspace; this also handles a client implementation
    // that resolves after an already delivered Ready event.
    if ($('workspace').hidden && client.currentUser) await enterWorkspace(client, sessionGeneration);
  } catch (error) {
    if (!currentClient(client, sessionGeneration) || attempt !== state.loginAttempt) return;
    returnToLogin({ message: errorText(error) });
  } finally {
    if (currentClient(client, sessionGeneration) && attempt === state.loginAttempt) {
      $('password').value = '';
      setLoginBusy(false);
    }
  }
});

$('login-cancel').addEventListener('click', () => {
  if (!state.loginBusy) return;
  returnToLogin();
  $('login-status').textContent = 'Conexión cancelada';
});

$('logout').addEventListener('click', async () => {
  const client = state.client;
  if (!client) return;
  // Detach the UI immediately; allow this client's bounded revocation request to finish.
  // A new login may start meanwhile, but old events and continuations cannot touch it.
  const logout = client.logout();
  returnToLogin({ disconnect: false });
  try { await logout; }
  catch { toast('La sesión local se ha cerrado. Revisa tus sesiones desde la comunidad si no había conexión.'); }
  finally { client.disconnect(); }
});

$('channel-search').addEventListener('input', renderChannels);
$('connection-settings').addEventListener('click', () => $('settings-dialog').showModal());
$('new-contact').addEventListener('click', () => {
  showError('contact-error');
  $('contact-dialog').showModal();
  $('contact-username').focus();
});
for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => $(button.dataset.close).close());
}
$('contact-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.status !== 'online') return showError('contact-error', 'Espera a recuperar la conexión.');
  const client = state.client;
  const sessionGeneration = state.sessionGeneration;
  $('contact-submit').disabled = true;
  showError('contact-error');
  try {
    const user = await client.addFriend($('contact-username').value.trim());
    if (!currentClient(client, sessionGeneration)) return;
    $('contact-dialog').close();
    $('contact-username').value = '';
    renderContacts();
    toast(user.relationship === 'Friend' ? 'Contacto añadido. Ya podéis conversar.' : 'Solicitud de contacto enviada.');
  } catch (error) { if (currentClient(client, sessionGeneration)) showError('contact-error', errorText(error)); }
  finally { if (currentClient(client, sessionGeneration)) $('contact-submit').disabled = false; }
});

$('message-input').addEventListener('input', () => {
  $('message-input').style.height = 'auto';
  $('message-input').style.height = `${Math.min($('message-input').scrollHeight, 130)}px`;
  updateComposer();
});
$('message-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!$('send-message').disabled) $('composer').requestSubmit();
  }
});
$('attach-audio').addEventListener('click', () => $('audio-file').click());
$('audio-file').addEventListener('change', () => {
  const file = $('audio-file').files[0];
  if (!file) return;
  try { state.pendingFile = validateAudioFile(file, state.config.maxUploadBytes); showError('workspace-error'); }
  catch (error) { showError('workspace-error', errorText(error)); state.pendingFile = null; }
  $('audio-file').value = '';
  updateComposer();
});
$('remove-file').addEventListener('click', () => { state.pendingFile = null; updateComposer(); });

$('composer').addEventListener('submit', async (event) => {
  event.preventDefault();
  const content = $('message-input').value.trim();
  const channelId = state.activeChannel;
  if (state.status !== 'online' || !channelId || state.sending || (!content && !state.pendingFile)) return;
  const client = state.client;
  const sessionGeneration = state.sessionGeneration;
  const generation = state.generation;
  const file = state.pendingFile;
  const current = () => currentClient(client, sessionGeneration) && generation === state.generation;
  state.sending = true;
  showError('workspace-error');
  updateComposer();
  try {
    const attachments = [];
    if (file) {
      $('composer-status').textContent = 'Subiendo audio…';
      attachments.push(await client.uploadFile(file));
      if (!current()) return;
    }
    $('composer-status').textContent = 'Enviando…';
    const message = await client.sendMessage(channelId, { content, attachments });
    if (!current()) return;
    if (channelId === state.activeChannel) addMessages([message], { scroll: true });
    $('message-input').value = '';
    $('message-input').style.height = '';
    state.pendingFile = null;
    $('composer-status').textContent = 'Enviado';
  } catch (error) {
    if (!current()) return;
    showError('workspace-error', `${errorText(error)} El borrador se conserva. Comprueba la conversación antes de volver a enviar.`);
    $('composer-status').textContent = 'Envío sin confirmar';
  } finally {
    if (current()) {
      state.sending = false;
      updateComposer();
      if (!$('message-input').disabled) $('message-input').focus();
      if (state.reloadAfterSend && state.status === 'online' && state.activeChannel) {
        state.reloadAfterSend = false;
        void selectChannel(state.activeChannel, { reload: true });
      }
    }
  }
});

$('load-older').addEventListener('click', async () => {
  if (state.loading || !state.activeChannel || state.status !== 'online') return;
  if (state.historyFailed) return void selectChannel(state.activeChannel, { reload: true });
  if (state.historyComplete) return;
  const client = state.client;
  const sessionGeneration = state.sessionGeneration;
  const channelId = state.activeChannel;
  const generation = state.generation;
  const oldest = [...state.messages.keys()].sort()[0];
  if (!oldest) return;
  state.loading = true;
  $('load-older').disabled = true;
  const previousHeight = $('timeline').scrollHeight;
  const previousTop = $('timeline').scrollTop;
  try {
    const messages = await client.getMessages(channelId, { before: oldest, limit: 50 });
    if (!currentClient(client, sessionGeneration) || generation !== state.generation) return;
    addMessages(messages);
    renderContacts(); renderChannels();
    $('timeline').scrollTop = previousTop + $('timeline').scrollHeight - previousHeight;
    state.historyComplete = messages.length < 50;
    $('load-older').hidden = state.historyComplete;
  } catch (error) { if (currentClient(client, sessionGeneration) && generation === state.generation) showError('workspace-error', errorText(error)); }
  finally {
    if (currentClient(client, sessionGeneration) && generation === state.generation) {
      state.loading = false;
      $('load-older').disabled = false;
    }
  }
});

window.addEventListener('pagehide', () => state.client?.disconnect());

try {
  const response = await fetch('./config.json', { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error('No se ha podido cargar la configuración de esta instalación.');
  state.config = normalizeConfig(await response.json());
  $('server-url').value = state.config.apiUrl;
  $('upload-limit').textContent = `Audio de hasta ${fileSize(state.config.maxUploadBytes)}. El servidor puede aplicar un límite menor.`;
  if (state.config.registrationUrl) {
    $('registration-link').href = state.config.registrationUrl;
    $('registration-link').hidden = false;
  }
  if (state.config.apiUrl) $('server-note').textContent = 'Comunidad configurada para esta instalación de Phaedra.';
} catch (error) {
  showError('login-error', errorText(error));
  $('login-submit').disabled = true;
}
