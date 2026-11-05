import { database } from './database.js';
import { memoryRequest } from './memory.js';
import { sendMessage } from './telegram.js';
import { paidTier, PLANS } from './paid-tier.js';
import { requestCost } from './consumption-report.js';

const OWNER = Number(process.env.TELEGRAM_OWNER_ID || 1661812916);
// Spending before this moment does not count, so nobody starts the limit already used up.
const COUNTING_FROM = '2026-11-05T10:40:00Z';
const GROUP_CHAT = process.env.TELEGRAM_GROUP_CHAT_ID || '-1004319265595';
const LEVELS = [100, 75, 50, 25];
export const consumptionLimit = tier => PLANS[tier]?.limit || 1;
const period = (tier, now) => {
  if (!PLANS[tier]?.scale) return { key: 'total', from: COUNTING_FROM };
  const month = new Date(now).toISOString().slice(0, 7), from = `${month}-01T00:00:00Z`;
  return { key: month, from: from > COUNTING_FROM ? from : COUNTING_FROM };
};
export const percentUsed = (rows, tier) => Math.floor(rows.reduce((total, row) => total + requestCost(row.action), 0) / consumptionLimit(tier) * 100 + 1e-9);
export const levelFor = percent => LEVELS.find(level => percent >= level) || 0;
export const noticeFor = level => level >= 100
  ? 'Has gastado el 100% de tu límite de consumo. Por ahora no puedo atender más peticiones de IA.'
  : `Has gastado el ${level}% de tu límite de consumo.`;

// Recharges never expire: the plan pays first each period and only the excess uses them.
export function usageWithCredit(rows, tier, credit, now = Date.now()) {
  const limit = consumptionLimit(tier), paid = Boolean(PLANS[tier]?.scale);
  const current = new Date(now).toISOString().slice(0, 7), months = new Map();
  for (const row of rows) {
    const bucket = paid ? String(row.created_at || current).slice(0, 7) : 'total';
    months.set(bucket, (months.get(bucket) || 0) + requestCost(row.action));
  }
  let excess = 0;
  for (const spent of months.values()) excess += Math.max(0, spent - limit);
  const planUsed = Math.min(months.get(paid ? current : 'total') || 0, limit);
  return Math.floor((planUsed + excess) / (limit + credit) * 100 + 1e-9);
}

async function creditOf(userId) {
  const [user] = await database(`sb_telegram_users?telegram_id=eq.${Number(userId)}&select=user_id`) || [];
  if (!user?.user_id) return 0;
  // Unreadable recharges count as none: the customer gets less limit, never more spend.
  const rows = await database(`sb_topups?user_id=eq.${encodeURIComponent(user.user_id)}&livemode=eq.true&status=eq.paid&select=credit_cents`).catch(() => { console.error('[consumption] recharges unavailable'); return []; });
  return Array.isArray(rows) ? rows.reduce((total, row) => total + (row.credit_cents || 0), 0) / 100 : 0;
}

async function usage(userId, tier, now) {
  const { key, from } = period(tier, now);
  const credit = await creditOf(userId);
  const query = start => database(`sb_usage_events?telegram_id=eq.${Number(userId)}&created_at=gte.${start}&action=neq.ai_tokens&select=action,created_at&limit=10000`);
  if (!credit) return { key, percent: percentUsed(await query(from) || [], tier), today: 0 };
  const rows = await query(COUNTING_FROM) || [];
  const day = new Date(now).toISOString().slice(0, 10);
  const today = rows.filter(row => String(row.created_at).startsWith(day)).reduce((total, row) => total + requestCost(row.action), 0);
  // A new recharge changes the key, so the 25, 50, 75 and 100% notices start again.
  return { key: `${key}:${credit}`, percent: usageWithCredit(rows, tier, credit, now), today };
}

export async function accountStatus(userId, now = Date.now()) {
  const tier = await paidTier(userId);
  const { percent } = await usage(userId, tier, now);
  return { tier, percent };
}

export async function notifyConsumption(userId, tier, now = Date.now()) {
  if (Number(userId) === OWNER || tier === 'owner') return 0;
  const { key, percent } = await usage(userId, tier, now);
  const level = levelFor(percent);
  const state = await memoryRequest(userId, userId);
  const last = state.consumptionNotice?.period === key ? state.consumptionNotice.level : 0;
  if (level > last) {
    // People who never opened a private chat cannot receive one, so they are told in the group.
    await sendMessage(userId, noticeFor(level)).catch(async () => {
      const [user] = await database(`sb_telegram_users?telegram_id=eq.${Number(userId)}&select=username`) || [];
      if (!user?.username) throw new Error('No way to reach this user');
      await sendMessage(GROUP_CHAT, `@${user.username} ${noticeFor(level)}`);
    });
    state.consumptionNotice = { period: key, level };
    await memoryRequest(userId, userId, 'POST', state);
  }
  return percent;
}

const LIMIT_REACHED = 'Has llegado al 100% de tu límite de consumo, así que no puedo atender esta petición. Siguen disponibles /plan, /hecho y /referir.';
const DAILY_RECHARGE_CAP = 10;
const DAILY_REACHED = 'Has llegado al límite de uso de hoy. Mañana podrás seguir usando tu recarga.';
const LIMIT_UNKNOWN = 'Ahora mismo no puedo comprobar tu límite de consumo, así que no he hecho el encargo. Inténtalo en un momento.';
// Returns the message to show when the request must stop. If spending cannot be checked, nothing is spent.
export async function consumptionGate(userId, now = Date.now()) {
  if (Number(userId) === OWNER) return null;
  let tier;
  try {
    tier = await paidTier(userId);
    const { percent, today } = await usage(userId, tier, now);
    await notifyConsumption(userId, tier, now).catch(() => console.error('[consumption] notice not delivered'));
    return percent >= 100 ? LIMIT_REACHED : today >= DAILY_RECHARGE_CAP ? DAILY_REACHED : null;
  } catch { console.error('[consumption] check failed'); return LIMIT_UNKNOWN; }
}

export async function runConsumptionNotices(now = Date.now()) {
  const from = new Date(now - 30 * 60_000).toISOString();
  const rows = await database(`sb_usage_events?created_at=gte.${from}&action=neq.ai_tokens&select=telegram_id&limit=5000`) || [];
  for (const id of new Set(rows.map(row => row.telegram_id).filter(Boolean))) {
    try { await notifyConsumption(id, await paidTier(id), now); }
    catch { console.error('[consumption] notice not delivered'); }
  }
}
