import { database } from './database.js';

const OWNER = Number(process.env.TELEGRAM_OWNER_ID || 1661812916);
export const voiceAllowance = tier => tier === 'pro' ? 10 : 1;

export async function voiceDenial(userId, tier, now = Date.now()) {
  if (Number(userId) === OWNER || tier === 'owner') return null;
  const from = new Date(now - 24 * 3600_000).toISOString();
  const used = await database(`sb_usage_events?telegram_id=eq.${Number(userId)}&action=eq.voice&created_at=gte.${from}&select=id`);
  if ((used?.length || 0) < voiceAllowance(tier)) return null;
  return tier === 'pro'
    ? 'Has llegado a tu límite de 10 notas de voz en 24 horas. Escríbeme por texto y seguimos.'
    : 'La versión gratuita incluye 1 nota de voz cada 24 horas y ya la has usado. Escríbeme por texto y seguimos.';
}
