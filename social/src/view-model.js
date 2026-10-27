// SPDX-License-Identifier: GPL-2.0-or-later
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const AUDIO_EXTENSIONS = new Set(['wav', 'mp3', 'flac', 'ogg', 'oga', 'opus', 'aif', 'aiff', 'm4a', 'aac']);

export function safeHttpUrl(value, { allowEmpty = false } = {}) {
  if (allowEmpty && !String(value || '').trim()) return '';
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('Introduce una dirección completa: https://…'); }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('La dirección no puede contener credenciales, parámetros ni fragmentos.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.has(url.hostname))) {
    throw new Error('Usa HTTPS. HTTP solo se admite en una instancia local.');
  }
  return url.href.replace(/\/$/, '');
}

export function normalizeConfig(input = {}) {
  if (!input || Array.isArray(input) || typeof input !== 'object' || input.schemaVersion !== 1) {
    throw new Error('La configuración de Phaedra Social no es compatible.');
  }
  const allowed = input.allowedServiceOrigins ?? [];
  if (!Array.isArray(allowed) || allowed.length > 12) throw new Error('Revisa los servicios autorizados de la comunidad.');
  const allowedServiceOrigins = [...new Set(allowed.map((value) => {
    // WebSocket origins may be configured with their HTTP equivalent.
    const text = String(value).replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
    const url = new URL(safeHttpUrl(text));
    if (url.pathname !== '/') throw new Error('Los servicios autorizados deben indicar solo su origen.');
    return url.origin;
  }))];
  const max = Number(input.maxUploadBytes ?? 20 * 1024 * 1024);
  if (!Number.isSafeInteger(max) || max < 1 || max > 50 * 1024 * 1024) {
    throw new Error('El límite de archivos debe estar entre 1 byte y 50 MB.');
  }
  return Object.freeze({
    schemaVersion: 1,
    appName: 'Phaedra Social',
    apiUrl: safeHttpUrl(input.apiUrl, { allowEmpty: true }),
    registrationUrl: safeHttpUrl(input.registrationUrl, { allowEmpty: true }),
    allowedServiceOrigins,
    maxUploadBytes: max,
  });
}

export function userName(user) {
  return String(user?.display_name || user?.username || 'Usuario');
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts.at(-1)[0] : (parts[0] || '?').slice(0, 2)).toLocaleUpperCase('es');
}

export function channelName(channel, users, currentUserId) {
  if (channel.channel_type === 'SavedMessages') return 'Mis notas';
  if (channel.channel_type === 'DirectMessage') {
    const peer = channel.recipients?.find((id) => id !== currentUserId);
    return userName(users.get(peer));
  }
  return String(channel.name || 'Conversación');
}

export function isTextChannel(channel) {
  return ['TextChannel', 'DirectMessage', 'Group', 'SavedMessages'].includes(channel?.channel_type);
}

export function messageTimestamp(message) {
  const id = String(message?._id || '');
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) return null;
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let milliseconds = 0;
  for (const character of id.slice(0, 10)) milliseconds = milliseconds * 32 + alphabet.indexOf(character);
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function fileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return '';
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(size / 1024))} KB`;
}

export function isAudioAttachment(attachment) {
  return /^audio\//i.test(attachment?.content_type || '') || attachment?.metadata?.type === 'Audio';
}

export function validateAudioFile(file, maxBytes) {
  if (!file || !Number.isFinite(file.size) || file.size < 1) throw new Error('Elige un archivo de audio que no esté vacío.');
  if (file.size > maxBytes) throw new Error(`El archivo supera el límite de ${fileSize(maxBytes)}.`);
  const extension = String(file.name || '').split('.').at(-1).toLowerCase();
  if (!/^audio\//i.test(file.type || '') && !AUDIO_EXTENSIONS.has(extension)) {
    throw new Error('Puedes compartir WAV, MP3, FLAC, OGG, AIFF, M4A o AAC.');
  }
  return file;
}

export function deduplicateMessages(messages) {
  const unique = new Map();
  for (const message of messages) if (message && typeof message._id === 'string') unique.set(message._id, message);
  return [...unique.values()].sort((a, b) => a._id.localeCompare(b._id));
}
