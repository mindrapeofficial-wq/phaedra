import { memoryRequest } from './memory.js';
import { database } from './database.js';

const MAX_FILES = 300;
const LABELS = { photo: 'Fotos', cover: 'Portadas', beat: 'Bases' };
const normalize = text => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// Chat 0 holds per-artist data outside any conversation, so /olvidame removes it with the rest of the user's memory.
export async function archiveFiles(userId, kind, fileIds, title = null) {
  if (!userId || !fileIds?.length) return;
  const state = await memoryRequest(0, userId);
  const files = state.artistFiles || [];
  const known = new Set(files.map(file => file.id));
  for (const id of fileIds) if (id && !known.has(id)) files.push({ id, kind, title, at: new Date().toISOString() });
  await memoryRequest(0, userId, 'POST', { ...state, artistFiles: files.slice(-MAX_FILES) });
}
export async function artistFiles(userId) {
  return (await memoryRequest(0, userId)).artistFiles || [];
}
export function fileCounts(files) {
  return Object.fromEntries(Object.keys(LABELS).map(kind => [kind, files.filter(file => file.kind === kind).length]));
}
export function artistSummary(name, profile, labels, files) {
  const counts = fileCounts(files);
  const context = Object.entries(profile || {}).filter(([key, value]) => value && !['welcomedAt', 'sellos', 'savedPhotos', 'archivos'].includes(key)).map(([key, value]) => `• ${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`).join('\n') || '• Aún no hay datos anotados';
  const sellos = labels.length ? labels.map(label => label.sello).join(', ') : 'Sin sello';
  return `Ficha de ${name}\n\nSello: ${sellos}\n\nContexto:\n${context}\n\nArchivos:\n${Object.entries(LABELS).map(([kind, label]) => `• ${label}: ${counts[kind]}`).join('\n')}`;
}

// Access is granted by Telegram ID; a display name is only used once to find that ID.
export async function resolveArtists(names) {
  const rows = await database("sb_bot_memory?telegram_id=gt.0&select=telegram_id,name:state->profile->>telegramName") || [];
  const users = await database('sb_telegram_users?select=telegram_id,username') || [];
  const ids = [], unresolved = [];
  for (const name of names) {
    const wanted = normalize(name);
    const match = rows.find(row => normalize(row.name) === wanted) || users.find(user => normalize(user.username) === wanted);
    if (match) ids.push(Number(match.telegram_id)); else unresolved.push(name);
  }
  return { ids: [...new Set(ids)], unresolved };
}
