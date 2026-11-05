import { database } from './database.js';
import { notifyAction } from './usage.js';
import { runExclusive, paidTier, scaled } from './paid-tier.js';

const OWNER = Number(process.env.TELEGRAM_OWNER_ID || 1661812916);
export const MUSIC_MODEL = 'music_v2_5';
const MIN_SECONDS = 15;
const MAX_SECONDS = { pro: 180, lite: 60 };
const DEFAULT_SECONDS = { pro: 90, lite: 45 };
const PRO_FIELDS = { use: 'para qué es la pista', references: 'sonido de referencia', avoid: 'qué quiere evitar', genre: 'género', mood: 'ambiente o emoción', bpm: 'BPM', key: 'tonalidad', instruments: 'instrumentos', structure: 'estructura', seconds: 'duración' };
const LITE_FIELDS = { genre: 'género', mood: 'ambiente o emoción' };

export const musicAllowance = isPaid => isPaid ? { pro: 5, lite: 25, monthly: true } : { pro: 1, lite: 5, monthly: false };
const clampSeconds = (seconds, quality) => Math.min(MAX_SECONDS[quality], Math.max(MIN_SECONDS, Math.round(Number(seconds) || DEFAULT_SECONDS[quality])));
const monthStart = (now = Date.now()) => new Date(new Date(now).toISOString().slice(0, 7) + '-01T00:00:00Z').toISOString();
const qualityLabel = quality => quality === 'pro' ? 'PRO' : 'Lite';

export async function musicDenial(userId, quality) {
  if (!process.env.ELEVENLABS_API_KEY) return 'La generación de bases todavía no está activada. Puedo ayudarte con la idea, la estructura y el brief mientras tanto.';
  if (Number(userId) === OWNER) return null;
  const plan = await paidTier(userId), paid = plan !== 'free';
  const base = musicAllowance(paid);
  const allowance = paid ? { ...base, pro: scaled(base.pro, plan), lite: scaled(base.lite, plan) } : base;
  const period = allowance.monthly ? `&created_at=gte.${monthStart()}` : '';
  // Beats made before the tiers existed were full tracks, so they count as PRO.
  const actions = quality === 'pro' ? 'in.(music,music_pro)' : 'eq.music_lite';
  const used = await database(`sb_usage_events?telegram_id=eq.${Number(userId)}&action=${actions}${period}&select=id`);
  if ((used?.length || 0) < allowance[quality]) return null;
  if (paid) return `Ya has usado tus ${allowance[quality]} bases ${qualityLabel(quality)} de este mes. El mes que viene tendrás más.`;
  return quality === 'pro' ? 'Ya has usado tu base PRO gratuita. Te quedan las Lite, o más PRO con la suscripción.' : 'Ya has usado tus 5 bases Lite gratuitas. La suscripción incluye más bases cada mes.';
}

export function missingBrief(brief = {}, quality = 'pro') {
  const fields = quality === 'pro' ? PRO_FIELDS : LITE_FIELDS;
  const missing = Object.entries(fields).filter(([field]) => !String(brief[field] ?? '').trim()).map(([, label]) => label);
  if (quality === 'pro' && typeof brief.vocals !== 'boolean') missing.push('si lleva voz o es instrumental');
  return missing;
}
export function musicPrompt(brief, quality = 'pro') {
  if (quality === 'lite') return [`${brief.genre} track`, `mood: ${brief.mood}`, brief.notes ? `notes: ${brief.notes}` : null].filter(Boolean).join('. ');
  return [`${brief.genre} track`, `intended use: ${brief.use}`, `sound reference: ${brief.references}`, `avoid: ${brief.avoid}`, `mood: ${brief.mood}`, `${brief.bpm} BPM`, `key: ${brief.key}`, `instruments: ${brief.instruments}`, `structure: ${brief.structure}`, brief.lyrics && brief.vocals ? `lyrics: ${brief.lyrics}` : null, brief.notes ? `notes: ${brief.notes}` : null].filter(Boolean).join('. ');
}

export async function generateMusic({ userId, quality, brief = {} }) {
  if (!userId) return { error: 'Music requires an identified user' };
  if (!['pro', 'lite'].includes(quality)) {
    if (!process.env.ELEVENLABS_API_KEY) return { denied: await musicDenial(userId, 'lite') };
    return { needsQuality: true };
  }
  const denied = await musicDenial(userId, quality);
  if (denied) return { denied };
  const missing = missingBrief(brief, quality);
  if (missing.length) return { needsBrief: missing };
  if (quality === 'pro' && brief.confirmed !== true) return { needsConfirmation: true, summary: musicPrompt(brief, quality) };
  return runExclusive(userId, () => renderMusic(quality, brief), () => ({ denied: 'Ya tengo un encargo de audio tuyo en marcha. Cuando termine, pídeme el siguiente.' }));
}

async function renderMusic(quality, brief) {
  const response = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
    method: 'POST', signal: AbortSignal.timeout(240_000),
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: MUSIC_MODEL, prompt: musicPrompt(brief, quality).slice(0, 2000), music_length_ms: clampSeconds(brief.seconds, quality) * 1000, force_instrumental: quality === 'lite' || !brief.vocals }),
  });
  if (!response.ok) {
    console.error('[music] request failed', { status: response.status });
    return { error: `Music request failed: ${response.status}` };
  }
  const audio = Buffer.from(await response.arrayBuffer());
  notifyAction(quality === 'pro' ? 'music_pro' : 'music_lite');
  return { audio };
}
