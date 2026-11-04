import { AsyncLocalStorage } from 'node:async_hooks';
import { database } from './database.js';
import { sendMessage } from './telegram.js';

const OWNER = Number(process.env.TELEGRAM_OWNER_ID || 1661812916);
const GROUP_CHAT = process.env.TELEGRAM_GROUP_CHAT_ID || '-1004319265595';
const BUDGET_USD = Number(process.env.BANANA_DAILY_BUDGET_USD || 5);
const IMAGE_ALERT = Number(process.env.BANANA_DAILY_IMAGE_ALERT || 20);
const CHAT_WINDOW_MS = 10 * 60_000;
const GROUP_GAP_MS = 60 * 60_000;
// USD per million tokens from the providers' public pricing pages. Image models are counted, not priced.
// The speech rate is per character, estimated from OpenAI's published per-minute speech cost.
const PRICES = { 'gpt-4o-mini-tts': [17, 0], 'gpt-6.1-terra': [1, 5], 'gpt-6-luna': [0.1, 0.5], 'gpt-4.1': [2, 8], 'claude-opus-5-5': [4, 20] };
export const ACTIONS = {
  chat: 'escribió al bot', image: 'generó una imagen PRO', voice: 'envió una nota de voz', release_plan: 'creó un plan de lanzamiento',
  instagram: 'usó las herramientas de Instagram', instagram_analysis: 'pidió un análisis de Instagram', claim: 'usó /reclamar', referral: 'usó /referir',
  account: 'usó /cuenta', plan_view: 'consultó su plan', task_done: 'marcó una tarea', reminders: 'cambió sus recordatorios',
};
const GROUP_ACTIONS = { image: 'crear una imagen PRO', release_plan: 'preparar un plan de lanzamiento', instagram_analysis: 'analizar su Instagram' };
export const PRIVACY_NOTICE = 'El administrador recibe avisos de las acciones que realizas aquí, sin su contenido, para operar el servicio y controlar costes. En el grupo pueden aparecer avisos anónimos del tipo «alguien usó…».';

const storage = new AsyncLocalStorage();
const chatBursts = new Map();
let lastGroupNotice = 0, timer;

export function withUsageContext(context, task) { return storage.run(context, task); }
export function chargeUsageTo(userId) { const context = storage.getStore(); if (context) context.userId = userId; }
const save = row => database('sb_usage_events', 'POST', row, 'return=minimal').catch(() => console.error('[usage] event not saved'));
export const costOf = (model, input, output) => {
  const price = PRICES[model];
  return price ? (input * price[0] + output * price[1]) / 1_000_000 : 0;
};

export function meterTokens(model, usage = {}) {
  const context = storage.getStore();
  const input = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const output = usage.completion_tokens ?? usage.output_tokens ?? 0;
  if (input || output) void save({ telegram_id: context?.userId ?? null, action: 'ai_tokens', model, input_tokens: input, output_tokens: output });
}

export function notifyAction(action) {
  const context = storage.getStore();
  if (!context?.userId || Number(context.userId) === OWNER || !ACTIONS[action]) return;
  void save({ telegram_id: context.userId, action, images: action === 'image' ? 1 : 0 });
  if (!context.isPrivate) return;
  const who = context.username ? `@${context.username}` : `Usuario ${context.userId}`;
  if (action === 'chat') {
    const burst = chatBursts.get(context.userId) || { who, count: 0, since: Date.now() };
    burst.count++;
    chatBursts.set(context.userId, burst);
  } else sendMessage(OWNER, `🔔 ${who} ${ACTIONS[action]}`).catch(() => console.error('[usage] owner notice failed'));
  if (GROUP_ACTIONS[action] && Date.now() - lastGroupNotice > GROUP_GAP_MS) {
    lastGroupNotice = Date.now();
    sendMessage(GROUP_CHAT, `🍌 Alguien acaba de usar Banana para ${GROUP_ACTIONS[action]}.`).catch(() => console.error('[usage] group notice failed'));
  }
}

export async function flushChatNotices(now = Date.now()) {
  for (const [userId, burst] of chatBursts) {
    if (now - burst.since < CHAT_WINDOW_MS) continue;
    chatBursts.delete(userId);
    await sendMessage(OWNER, `🔔 ${burst.who}: ${burst.count} ${burst.count === 1 ? 'mensaje' : 'mensajes'} al bot en 10 minutos`).catch(() => console.error('[usage] owner notice failed'));
  }
}

export function summarize(rows) {
  const users = new Map(), actions = new Map();
  let cost = 0, images = 0, input = 0, output = 0;
  for (const row of rows) {
    cost += costOf(row.model, row.input_tokens || 0, row.output_tokens || 0);
    images += row.images || 0; input += row.input_tokens || 0; output += row.output_tokens || 0;
    if (row.action !== 'ai_tokens') {
      actions.set(row.action, (actions.get(row.action) || 0) + 1);
      users.set(row.telegram_id, (users.get(row.telegram_id) || 0) + 1);
    }
  }
  return { cost, images, input, output, actions, users };
}
const since = hours => new Date(Date.now() - hours * 3600_000).toISOString();
const fetchRows = hours => database(`sb_usage_events?created_at=gte.${since(hours)}&select=telegram_id,action,model,input_tokens,output_tokens,images&limit=10000`);
const actionLines = map => [...map].sort((a, b) => b[1] - a[1]).map(([action, count]) => `• ${ACTIONS[action] || action}: ${count}`).join('\n') || '• Sin actividad';

export async function activityReport() {
  const [day, week] = await Promise.all([fetchRows(24), fetchRows(168)]);
  const a = summarize(day), b = summarize(week);
  return `Actividad de usuarios\n\nÚltimas 24 horas (${a.users.size} usuarios):\n${actionLines(a.actions)}\n\nÚltimos 7 días (${b.users.size} usuarios):\n${actionLines(b.actions)}`;
}
export async function spendReport() {
  const [day, week] = await Promise.all([fetchRows(24), fetchRows(168)]);
  const a = summarize(day), b = summarize(week);
  const line = s => `Texto estimado: ${s.cost.toFixed(2)} $ (${s.input + s.output} tokens)\nImágenes PRO: ${s.images}, sin precio incluido`;
  return `Gasto estimado\n\n24 horas:\n${line(a)}\n\n7 días:\n${line(b)}\n\nAviso a partir de ${BUDGET_USD} $ de texto o ${IMAGE_ALERT} imágenes al día. No bloquea a nadie. Las notas de voz recibidas no están incluidas. La factura real está en los paneles de OpenAI y Anthropic.`;
}

export async function runUsageTick(state, now = Date.now()) {
  await flushChatNotices(now);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(now));
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: 'numeric', hourCycle: 'h23' }).format(new Date(now)));
  let changed = false;
  if (state.usageCheckedAt && now - state.usageCheckedAt < 10 * 60_000 && !(hour >= 21 && state.usageReportDay !== date)) return false;
  state.usageCheckedAt = now; changed = true;
  const today = summarize(await fetchRows(24));
  if ((today.cost >= BUDGET_USD || today.images >= IMAGE_ALERT) && state.usageAlertDay !== date) {
    state.usageAlertDay = date;
    await sendMessage(OWNER, `⚠️ Alerta de gasto en 24 horas: ${today.cost.toFixed(2)} $ estimados de texto y ${today.images} imágenes PRO. Usa /gasto para ver el detalle.`);
  }
  if (hour >= 21 && state.usageReportDay !== date) {
    state.usageReportDay = date;
    await sendMessage(OWNER, `Resumen del día\n\n${today.users.size} usuarios activos\n${actionLines(today.actions)}\n\nTexto estimado: ${today.cost.toFixed(2)} $\nImágenes PRO: ${today.images}`);
    const count = today.actions.get('image') || 0, plans = today.actions.get('release_plan') || 0;
    if (count + plans) await sendMessage(GROUP_CHAT, `🍌 Hoy en Banana: ${count} ${count === 1 ? 'imagen PRO creada' : 'imágenes PRO creadas'} y ${plans} ${plans === 1 ? 'plan de lanzamiento' : 'planes de lanzamiento'}.`);
  }
  return changed;
}

const USER_DAILY_LIMIT_USD = Number(process.env.BANANA_USER_DAILY_LIMIT_USD || 2);
// Estimate: the image model has no verified public price, so this errs high.
const IMAGE_COST_USD = Number(process.env.BANANA_IMAGE_COST_USD || 0.25);
const madridDay = time => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(time));
export const USER_LIMIT_MESSAGE = 'Has llegado a tu límite de uso de IA por hoy. Vuelve mañana y seguimos. Mientras tanto siguen disponibles /plan, /hecho y /referir.';
export function userSpendToday(rows, now = Date.now()) {
  const today = madridDay(now);
  return rows.filter(row => madridDay(row.created_at) === today)
    .reduce((total, row) => total + costOf(row.model, row.input_tokens || 0, row.output_tokens || 0) + (row.images || 0) * IMAGE_COST_USD, 0);
}
const limitNotified = new Set();
export async function userLimitReached(userId, now = Date.now()) {
  if (Number(userId) === OWNER) return false;
  try {
    const from = new Date(now - 25 * 3600_000).toISOString();
    const rows = await database(`sb_usage_events?telegram_id=eq.${Number(userId)}&created_at=gte.${from}&select=model,input_tokens,output_tokens,images,created_at&limit=5000`);
    if (userSpendToday(rows || [], now) < USER_DAILY_LIMIT_USD) return false;
    const key = `${userId}:${madridDay(now)}`;
    if (!limitNotified.has(key)) {
      limitNotified.add(key);
      await sendMessage(OWNER, `⚠️ El usuario ${userId} ha llegado a su límite diario de IA.`).catch(() => console.error('[usage] owner notice failed'));
    }
    return true;
  } catch { console.error('[usage] limit check failed'); return false; }
}
