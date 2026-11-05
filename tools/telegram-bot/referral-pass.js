import { database } from './database.js';

const DAY_MS = 24 * 3600_000;
const NEW_USER_WINDOW_MS = 3600_000;

// Only people who joined through the link earn a day. Consecutive invitations add up instead of overlapping.
export function passUntil(rows = []) {
  let until = 0;
  const valid = rows.filter(row => {
    const joined = Date.parse(row.referred?.created_at), claimed = Date.parse(row.created_at);
    return row.status !== 'void' && claimed - joined <= NEW_USER_WINDOW_MS;
  }).map(row => Date.parse(row.created_at)).sort((a, b) => a - b);
  for (const claimed of valid) until = Math.max(until, claimed) + DAY_MS;
  return until;
}

export async function referralPassUntil(telegramId) {
  try {
    const rows = await database(`sb_referrals?referrer_telegram=eq.${Number(telegramId)}&select=created_at,status,referred:sb_telegram_users!sb_referrals_referred_telegram_fkey(created_at)`);
    return Array.isArray(rows) ? passUntil(rows) : 0;
  } catch { console.error('[referral] pass check failed'); return 0; }
}

export const withReferralPass = async (user, now = Date.now()) => user?.tier === 'free' && await referralPassUntil(user.telegram_id) > now ? { ...user, tier: 'pro' } : user;
