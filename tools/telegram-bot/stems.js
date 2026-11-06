import { database } from './database.js';
import { notifyAction } from './usage.js';
import { getFileUrl, sendDocument, sendMessage } from './telegram.js';
import { runExclusive, paidTier, scaled } from './paid-tier.js';

const OWNER = Number(process.env.TELEGRAM_OWNER_ID || 1661812916);
const MAX_BYTES = 20 * 1024 * 1024; // Telegram bots cannot download larger files.
const MAX_SECONDS = 360;
const REQUEST = /(?:^|\s)\/separar(?:@\w+)?(?:\s|$)|separa|stems?\b|acapella|a capella|(?:quita|saca|elimina)\w*\s+(?:la\s+)?voz/i;
export const stemsAllowance = isPaid => isPaid ? { count: 10, monthly: true } : { count: 1, monthly: false };

export function audioFile(msg) {
  const isAudio = item => item && (item.duration !== undefined || /^audio\//.test(item.mime_type || ''));
  if (msg.audio) return msg.audio;
  if (isAudio(msg.document)) return msg.document;
  return msg.reply_to_message?.audio || (isAudio(msg.reply_to_message?.document) ? msg.reply_to_message.document : null);
}
// The bot cannot listen to music, so a track only reaches the conversation as its details.
export function audioNote(file) {
  const name = [file.title || file.file_name, file.performer].filter(Boolean).join(' de ') || 'sin título';
  return `[Audio adjunto: «${name}», ${file.duration || '?'} s. No puedes escucharlo. Si es una referencia para una base, dilo con claridad y pide que describa qué le gusta de cómo suena. Nunca digas que no lo ves.]`;
}
export const wantsStems = text => REQUEST.test(String(text || ''));

async function denial(userId) {
  if (!process.env.ELEVENLABS_API_KEY) return 'La separación de pistas todavía no está activada.';
  if (Number(userId) === OWNER) return null;
  const plan = await paidTier(userId), paid = plan !== 'free';
  const allowance = stemsAllowance(paid);
  if (paid) allowance.count = scaled(allowance.count, plan);
  const period = allowance.monthly ? `&created_at=gte.${new Date().toISOString().slice(0, 7)}-01T00:00:00Z` : '';
  const used = await database(`sb_usage_events?telegram_id=eq.${Number(userId)}&action=eq.stems${period}&select=id`);
  if ((used?.length || 0) < allowance.count) return null;
  return paid ? `Ya has usado tus ${allowance.count} separaciones de este mes. El mes que viene tendrás más.` : 'Ya has usado tu separación gratuita. La suscripción incluye 10 al mes.';
}

export async function separateStems(file) {
  const url = await getFileUrl(file.file_id);
  if (!url) throw new Error('Telegram file unavailable');
  const source = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!source.ok) throw new Error(`Telegram download failed: ${source.status}`);
  const form = new FormData();
  form.set('file', new Blob([await source.arrayBuffer()], { type: file.mime_type || 'audio/mpeg' }), file.file_name || 'audio.mp3');
  const response = await fetch('https://api.elevenlabs.io/v1/music/stem-separation?output_format=mp3_44100_128', {
    method: 'POST', body: form, signal: AbortSignal.timeout(280_000), headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
  });
  if (!response.ok) throw new Error(`Stem separation failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function handleStems({ chatId, userId, isGroup, file }) {
  if (isGroup) return sendMessage(chatId, 'La separación de pistas se hace por privado: https://t.me/SocialBananaBot?start=welcome');
  if ((file.file_size || 0) > MAX_BYTES) return sendMessage(chatId, 'Ese archivo pasa de 20 MB, el máximo que puedo recibir. Mándamelo en MP3.');
  if ((file.duration || 0) > MAX_SECONDS) return sendMessage(chatId, 'Puedo separar audios de hasta 6 minutos. Mándame una versión más corta.');
  return runExclusive(userId, () => processStems(chatId, userId, file), () => sendMessage(chatId, 'Ya tengo un encargo de audio tuyo en marcha. Cuando termine, pídeme el siguiente.'));
}

async function processStems(chatId, userId, file) {
  const denied = await denial(userId);
  if (denied) return sendMessage(chatId, denied);
  await sendMessage(chatId, 'Me pongo a separar las pistas. Puede tardar unos minutos.');
  try {
    const zip = await separateStems(file);
    await sendDocument(chatId, zip, 'pistas-separadas.zip', '🎚️ Aquí tienes las pistas separadas, cada una en su archivo. Usa solo audio sobre el que tengas derechos.');
    notifyAction('stems');
  } catch (error) {
    console.error('[stems] failed', error.message);
    await sendMessage(chatId, 'No he podido separar las pistas y no te lo he descontado. Puedes mandarme el audio de nuevo en unos minutos; si vuelve a fallar, escribe a @PhaseREM.');
  }
}
