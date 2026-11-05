import { database } from './database.js';
import { memoryRequest } from './memory.js';
import { sendMessage } from './telegram.js';
import { getUser } from './tiers.js';
import { requestCost } from './consumption-report.js';

const OWNER = Number(process.env.TELEGRAM_OWNER_ID || 1661812916);
// Spending before this moment does not count, so nobody starts the limit already used up.
const COUNTING_FROM = '2026-11-05T10:40:00Z';
const LEVELS = [100, 75, 50, 25];
export const consumptionLimit = tier => tier === 'pro' ? 8 : 1;
const period = (tier, now) => {
  if (tier !== 'pro') return { key: 'total', from: COUNTING_FROM };
  const month = new Date(now).toISOString().slice(0, 7), from = `${month}-01T00:00:00Z`;
  return { key: month, from: from > COUNTING_FROM ? from : COUNTING_FROM };
};
export const percentUsed = (rows, tier) => Math.floor(rows.reduce((total, row) => total + requestCost(row.action), 0) / consumptionLimit(tier) * 100 + 1e-9);
export const levelFor = percent => LEVELS.find(level => percent >= level) || 0;
export const noticeFor = level => level >= 100
  ? 'Has gastado el 100% de tu límite de consumo. Por ahora no puedo atender más peticiones de IA.'
  : `Has gastado el ${level}% de tu límite de consumo.`;

async function usage(userId, tier, now) {
  const { key, from } = period(tier, now);
  const rows = await database(`sb_usage_events?telegram_id=eq.${Number(userId)}&created_at=gte.${from}&action=neq.ai_tokens&select=action&limit=10000`);
  return { key, percent: percentUsed(rows || [], tier) };
}

export async function notifyConsumption(userId, tier, now = Date.now()) {
  if (Number(userId) === OWNER || tier === 'owner') return 0;
  const { key, percent } = await usage(userId, tier, now);
  const level = levelFor(percent);
  const state = await memoryRequest(userId, userId);
  const last = state.consumptionNotice?.period === key ? state.consumptionNotice.level : 0;
  if (level > last) {
    await sendMessage(userId, noticeFor(level));
    state.consumptionNotice = { period: key, level };
    await memoryRequest(userId, userId, 'POST', state);
  }
  return percent;
}

// Fails open like the daily spending limit: a data or delivery failure should not silence the bot.
export async function consumptionBlocked(userId, tier, now = Date.now()) {
  try { return await notifyConsumption(userId, tier, now) >= 100; }
  catch { console.error('[consumption] check failed'); return false; }
}

export async function runConsumptionNotices(now = Date.now()) {
  const from = new Date(now - 30 * 60_000).toISOString();
  const rows = await database(`sb_usage_events?created_at=gte.${from}&action=neq.ai_tokens&select=telegram_id&limit=5000`) || [];
  for (const id of new Set(rows.map(row => row.telegram_id).filter(Boolean))) {
    try { await notifyConsumption(id, (await getUser(id)).tier, now); }
    catch { console.error('[consumption] notice not delivered'); }
  }
}
