import { database } from './database.js';
import { activeSubscription } from './entitlements.js';

const subscribed = async accountId => {
  if (!accountId) return false;
  const rows = await database(`sb_subscriptions?user_id=eq.${encodeURIComponent(accountId)}&livemode=eq.true&select=livemode,status,risk_hold,paid_until`);
  return Array.isArray(rows) && Boolean(activeSubscription(rows));
};

// Only a verified live payment counts here. Promotions and referral days never raise the consumption limit.
export async function paidTier(telegramId) {
  const [user] = await database(`sb_telegram_users?telegram_id=eq.${Number(telegramId)}&select=user_id`) || [];
  return await subscribed(user?.user_id) ? 'pro' : 'free';
}

export async function withSubscriptionTier(user) {
  if (user?.tier !== 'free') return user;
  try { return await subscribed(user.user_id) ? { ...user, tier: 'pro' } : user; }
  catch { console.error('[tier] subscription check failed'); return user; }
}

// One expensive job per person at a time, because quotas only count a job once it has finished.
const running = new Set();
export async function runExclusive(userId, job, whenBusy) {
  const key = Number(userId);
  if (running.has(key)) return whenBusy();
  running.add(key);
  try { return await job(); } finally { running.delete(key); }
}
