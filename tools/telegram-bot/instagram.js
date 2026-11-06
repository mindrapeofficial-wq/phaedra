import { createHash } from 'node:crypto';
import { getFileUrl } from './telegram.js';
import { requireInstagramAccess } from './entitlements.js';
import { prepareInstagramCapacity } from './instagram-capacity.js';
import { hasActiveInstagramTrial } from './instagram-trial.js';

const BASE = 'https://api.postzen.dev/v1';
const DB = process.env.SUPABASE_URL || 'https://mfylkalarzuhivhmvzbm.supabase.co';
const id = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw new Error('Identificador no válido');
  return value;
};
// Neither message sends the person back to /instagram, because that is often the step that has just failed.
export const INSTAGRAM_FULL = 'Ahora mismo no quedan plazas para conectar Instagram. No es un problema de tu cuenta ni tienes que repetir nada: escribe a @PhaseREM y te avisamos cuando haya hueco. Mientras, sigo ayudándote con portadas, bases y tu lanzamiento.';
export const INSTAGRAM_DOWN = 'El servicio de Instagram no responde ahora mismo. No es un problema de tu cuenta: espera un rato antes de volver a intentarlo y, si sigue igual, escribe a @PhaseREM. Mientras, sigo ayudándote con portadas, bases y tu lanzamiento.';
export async function postzen(path, { method = 'GET', body, requestId } = {}) {
  const res = await fetch(BASE + path, { method, signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${process.env.POSTZEN_API_KEY}`, 'Content-Type': 'application/json', ...(requestId ? { 'x-request-id': requestId } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!res.ok) {
    const error = new Error(res.status === 402 ? INSTAGRAM_FULL : INSTAGRAM_DOWN);
    error.status = res.status; throw error;
  }
  return res.json();
}
export async function connection(userId, patch) {
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) throw new Error('Usuario no válido');
  const key = process.env.SUPABASE_SERVICE_KEY;
  const res = await fetch(`${DB}/rest/v1/sb_instagram_connections?${patch ? 'on_conflict=telegram_id' : `telegram_id=eq.${userId}`}`, {
    method: patch ? 'POST' : 'GET', signal: AbortSignal.timeout(10_000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
    ...(patch ? { body: JSON.stringify({ ...patch, telegram_id: Number(userId), updated_at: new Date().toISOString() }) } : {}),
  });
  if (!res.ok) throw new Error('No pude guardar o recuperar la conexión privada de Instagram.');
  return (await res.json())[0] || null;
}
const profileOf = account => typeof account.profileId === 'string' ? account.profileId : account.profileId?._id;
async function accountsFor(row) {
  const result = await postzen(`/accounts?profileId=${id(row.profile_id)}&platform=instagram`);
  return (result.accounts || []).filter(a => profileOf(a) === row.profile_id && a.platform === 'instagram');
}
export async function beginConnection(userId) {
  await requireInstagramAccess(userId);
  // The free trial must never take the paid-slot path, which can release the Phaedra account.
  if (!(await hasActiveInstagramTrial(userId))) await prepareInstagramCapacity(userId, { api: postzen, connection });
  let row = await connection(userId);
  if (!row) {
    // Reuse a provisioned profile after an interrupted connection attempt.
    const name = `Social Banana ${Number(userId)}`;
    const listed = await postzen('/profiles');
    let profile = listed.profiles?.find(p => p.name === name);
    if (!profile) profile = (await postzen('/profiles', { method: 'POST', body: { name, description: 'Private Social Banana client workspace' } })).profile;
    row = await connection(userId, { profile_id: id(profile?._id), status: 'pending' });
  }
  const result = await postzen(`/connect/instagram?${new URLSearchParams({ profileId: row.profile_id, redirectUrl: 'https://t.me/SocialBananaBot?start=instagram_check' })}`);
  const url = new URL(result.authUrl);
  if (url.protocol !== 'https:') throw new Error('Enlace de conexión no válido');
  // Verification only works after the user explicitly starts a connection.
  await connection(userId, { ...row, status: 'pending' });
  return url.toString();
}
export async function verifyConnection(userId) {
  await requireInstagramAccess(userId);
  const row = await connection(userId);
  if (!row || row.status === 'disabled') throw new Error('Primero abre /instagram para autorizar tu cuenta.');
  const accounts = await accountsFor(row);
  const healthy = accounts.filter(a => a.status === 'connected' && a.isActive !== false);
  if (healthy.length > 1) throw new Error('Veo más de una cuenta de Instagram autorizada y no sé cuál usar. Escribe a @PhaseREM para dejar solo la tuya.');
  if (!healthy.length) throw new Error('Todavía no veo tu cuenta autorizada. Si no llegaste a terminar los pasos en Instagram, pide un enlace nuevo con /instagram reconectar. Si los terminaste y sigue sin aparecer, escribe a @PhaseREM.');
  const account = healthy[0];
  return connection(userId, { ...row, account_id: id(account._id), username: account.username || '', status: 'active' });
}
export async function disableConnection(userId) {
  const row = await connection(userId);
  if (row) await connection(userId, { ...row, status: 'disabled' });
}
export async function verifiedAccount(userId) {
  await requireInstagramAccess(userId);
  const row = await connection(userId);
  if (!row || row.status !== 'active' || !row.account_id) throw new Error('Conecta tu Instagram por privado con /instagram antes de consultar tu cuenta.');
  const accounts = await accountsFor(row);
  if (!accounts.some(a => a._id === row.account_id && a.status === 'connected' && a.isActive !== false)) throw new Error('La autorización de Instagram ya no es válida. Vuelve a conectar con /instagram.');
  return row;
}
async function uploadTelegramImage(fileId, profileId) {
  if (!fileId) throw new Error('No tengo esa imagen en este chat privado. Envíamela aquí primero.');
  const url = await getFileUrl(fileId);
  if (!url) throw new Error('No pude recuperar la imagen de Telegram.');
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error('No pude descargar la imagen.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 8 * 1024 * 1024) throw new Error('La imagen supera 8 MB. Necesito una versión más ligera para Instagram.');
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (!jpeg && !png) throw new Error('Necesito una imagen JPEG o PNG.');
  const contentType = jpeg ? 'image/jpeg' : 'image/png';
  const signed = await postzen('/media/presign', { method: 'POST', body: { filename: `cover.${jpeg ? 'jpg' : 'png'}`, contentType, size: bytes.length, profileId } });
  if (!signed.uploadUrl || new URL(signed.uploadUrl).protocol !== 'https:' || !signed.publicUrl) throw new Error('No pude preparar el archivo para el borrador.');
  const uploaded = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: bytes, signal: AbortSignal.timeout(30_000) });
  if (!uploaded.ok) throw new Error('No pude subir la imagen del borrador.');
  return signed.publicUrl;
}
export async function runInstagramTool(userId, name, args = {}, requestId = '', mediaFiles = {}) {
  const row = await verifiedAccount(userId); // Never accept an account/profile ID from the model.
  const scope = { accountId: row.account_id, profileId: row.profile_id, platform: 'instagram' };
  if (name === 'instagram_account') return { username: row.username, connected: true };
  if (name === 'instagram_posts') {
    const status = ['published', 'scheduled', 'draft'].includes(args.status) ? args.status : 'published';
    return postzen(`/posts?${new URLSearchParams({ ...scope, status, limit: '30', page: '1' })}`);
  }
  if (name === 'instagram_analytics') {
    const days = Math.max(1, Math.min(90, Number(args.days) || 30));
    return postzen(`/analytics?${new URLSearchParams({ ...scope, source: 'all', fromDate: new Date(Date.now() - days * 86400000).toISOString().slice(0, 10), toDate: new Date().toISOString().slice(0, 10), limit: '30', page: '1', sortBy: 'engagement' })}`);
  }
  if (name === 'instagram_best_times') return postzen(`/best-time-to-post?${new URLSearchParams(scope)}`);
  if (name === 'instagram_save_draft') {
    if (typeof args.caption !== 'string' || args.caption.length > 2200) throw new Error('El texto debe tener como máximo 2200 caracteres.');
    const mediaUrl = args.image_source === 'generated' ? await uploadTelegramImage(mediaFiles.generated, row.profile_id)
      : args.image_source === 'reference' ? await uploadTelegramImage(mediaFiles.reference, row.profile_id) : args.image_url;
    let media;
    try { media = new URL(mediaUrl); } catch { throw new Error('Necesito la imagen para guardar el borrador: envíala aquí o utiliza una portada generada en este chat.'); }
    if (media.protocol !== 'https:' || media.username || media.password || media.hostname === 'api.telegram.org' || /(?:^|\.)localhost$/.test(media.hostname)) throw new Error('Usa una URL HTTPS pública de la imagen, sin credenciales.');
    const fingerprint = createHash('sha256').update(JSON.stringify([row.account_id, args.caption, args.image_source === 'generated' ? mediaFiles.generated : args.image_source === 'reference' ? mediaFiles.reference : media.href, requestId])).digest('hex');
    const result = await postzen('/posts', { method: 'POST', requestId: `banana-${fingerprint}`, body: { content: args.caption, isDraft: true, mediaItems: [{ url: media.href }], platforms: [{ platform: 'instagram', accountId: row.account_id, settings: { postType: 'feed' } }] } });
    const saved = result.post || result.existingPost;
    if (!saved?._id) throw new Error('No se pudo confirmar el borrador. No lo vuelvas a enviar automáticamente.');
    return { saved: true, draftId: saved._id, username: row.username, published: false };
  }
  throw new Error('Herramienta de Instagram no disponible');
}

export const INSTAGRAM_TOOLS = [
  { name: 'instagram_account', description: 'Verify the current client Instagram connection.', input_schema: { type: 'object', properties: {} } },
  { name: 'instagram_posts', description: 'Read up to 30 posts belonging ONLY to this client. Do not claim the list is exhaustive.', input_schema: { type: 'object', properties: { status: { type: 'string', enum: ['published', 'scheduled', 'draft'] } } } },
  { name: 'instagram_analytics', description: 'Read this client real post analytics over 1–90 days; first 30 results. State the sample size and missing data.', input_schema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 90 } } } },
  { name: 'instagram_best_times', description: 'Read this client historical best posting times. They are estimates, not guarantees.', input_schema: { type: 'object', properties: {} } },
  { name: 'instagram_save_draft', description: 'Save a feed draft only when the client requests it. Use generated for the latest generated cover in THIS private chat, reference for the client original photo, or url for a supplied public direct HTTPS URL. Never invent a URL or publish. Ask for missing media.', input_schema: { type: 'object', properties: { caption: { type: 'string' }, image_source: { type: 'string', enum: ['generated', 'reference', 'url'] }, image_url: { type: 'string' } }, required: ['caption', 'image_source'] } },
];
