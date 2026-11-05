import { database } from './database.js';
import { paidTier, scaled } from './paid-tier.js';

const OWNER = Number(process.env.TELEGRAM_OWNER_ID || 1661812916);
export const voiceAllowance = tier => tier === 'pro' ? 10 : 1;

export async function voiceDenial(userId, tier, now = Date.now()) {
  if (Number(userId) === OWNER || tier === 'owner') return null;
  const from = new Date(now - 24 * 3600_000).toISOString();
  const used = await database(`sb_usage_events?telegram_id=eq.${Number(userId)}&action=eq.voice_reply&created_at=gte.${from}&select=id`);
  const plan = await paidTier(userId);
  const allowance = plan === 'free' ? voiceAllowance(tier) : scaled(10, plan);
  if ((used?.length || 0) < allowance) return null;
  return allowance > 1
    ? `Ya te he enviado tus ${allowance} notas de voz de hoy, así que te respondo por texto.`
    : 'La versión gratuita incluye 1 nota de voz mía al día y ya la has usado, así que te respondo por texto.';
}
