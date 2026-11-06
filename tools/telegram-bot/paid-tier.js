import { database } from './database.js';
import { activeSubscription } from './entitlements.js';

// Stripe price ids decide the plan, and any other paid price is PRO.
export const PLANS = { free: { scale: 0, limit: 1 }, pro: { scale: 1, limit: 8 }, pro_plus: { scale: 2.5, limit: 20 }, ultimate: { scale: 5, limit: 40 } };
export const planOf = priceId => priceId && priceId === process.env.BANANA_PRICE_ULTIMATE ? 'ultimate' : priceId && priceId === process.env.BANANA_PRICE_PRO_PLUS ? 'pro_plus' : 'pro';
export const scaled = (count, plan) => Math.floor(count * (PLANS[plan]?.scale || 1));
const subscribed = async accountId => {
  if (!accountId) return false;
  const rows = await database(`sb_subscriptions?user_id=eq.${encodeURIComponent(accountId)}&livemode=eq.true&select=livemode,status,risk_hold,paid_until,price_id`);
  if (!Array.isArray(rows)) return false;
  const active = activeSubscription(rows);
  return active ? planOf(active.price_id) : false;
};

// Only a verified live payment counts here. Promotions and referral days never raise the consumption limit.
export async function paidTier(telegramId) {
  const [user] = await database(`sb_telegram_users?telegram_id=eq.${Number(telegramId)}&select=user_id`) || [];
  return await subscribed(user?.user_id) || 'free';
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

// Names customers see. Unknown tiers, such as the owner's, are shown as they are.
export const PLAN_NAMES = { free: 'gratuito', pro: 'PRO', pro_plus: 'PRO+', ultimate: 'Ultimate' };
export const planName = tier => PLAN_NAMES[tier] || String(tier || 'gratuito');
