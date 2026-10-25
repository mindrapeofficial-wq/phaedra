export const ROOMS = Object.freeze([
  { id: 'general', name: 'General', description: 'La sala principal de Phaedra' },
  { id: 'produccion', name: 'Producción', description: 'Audio, mezcla, plugins y MIDI' },
  { id: 'ayuda', name: 'Ayuda', description: 'Dudas y soporte entre usuarios' },
  { id: 'desarrollo', name: 'Desarrollo', description: 'Funciones, errores y sugerencias' },
]);

export function validRoom(v) {
  return typeof v === 'string' && ROOMS.some(x => x.id === v);
}

export function normalizeNickname(v) {
  if (typeof v !== 'string') return '';
  const nick = v.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (nick.length < 2 || nick.length > 24 || !/^[\p{L}\p{N}_ -]+$/u.test(nick)) return '';
  if (/^(?:admin|administrator|moderador|moderator|system|sistema|staff|soporte|support|phaedra)(?:\s|$)/i.test(nick)) return '';
  return nick;
}

export function normalizeMessage(v) {
  if (typeof v !== 'string') return '';
  const text = v.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!text || [...text].length > 500) return '';
  return text;
}

export function validAfter(v) {
  const s = String(v ?? '0');
  if (!/^\d{1,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export function validToken(v) {
  return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
}
