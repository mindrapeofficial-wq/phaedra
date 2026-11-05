import { database } from './database.js';
import { sendMessage } from './telegram.js';

const OWNER = Number(process.env.TELEGRAM_OWNER_ID || 1661812916);
const INTERVAL_MS = 2 * 3600_000;
// The same approximate prices published in the group. Beat length is not recorded, so a PRO beat counts at its 3-minute price.
const ITEMS = {
  chat: ['mensajes', 0.02], voice: ['notas de voz', 0.10], release_plan: ['planes', 0.02],
  instagram: ['tareas de Instagram', 0.15], instagram_analysis: ['análisis de Instagram', 0.15],
  image_lite: ['imágenes Lite', 0.05], image: ['imágenes PRO', 0.25], music_lite: ['bases Lite', 0.15],
  music: ['bases PRO', 0.40], music_pro: ['bases PRO', 0.40], stems: ['separaciones', 0.50],
};
const money = value => `${value.toFixed(2).replace('.', ',')} $`;
const madridDay = time => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(time));

function tally(rows) {
  const lines = new Map();
  let total = 0;
  for (const { action } of rows) {
    const item = ITEMS[action];
    if (!item) continue;
    lines.set(item[0], { count: (lines.get(item[0])?.count || 0) + 1, price: item[1] });
    total += item[1];
  }
  return { lines, total };
}

export function buildConsumptionReport(rows, names = new Map(), now = Date.now()) {
  const billable = rows.filter(row => ITEMS[row.action] && row.telegram_id && Number(row.telegram_id) !== OWNER);
  const recent = billable.filter(row => now - Date.parse(row.created_at) <= INTERVAL_MS);
  if (!recent.length) return null;
  const today = madridDay(now), people = new Map();
  for (const row of billable) if (madridDay(row.created_at) === today) people.set(row.telegram_id, [...(people.get(row.telegram_id) || []), row]);
  const users = [...new Set(recent.map(row => row.telegram_id))].map(id => ({
    id, last: tally(recent.filter(row => row.telegram_id === id)), day: tally(people.get(id) || []),
  })).sort((a, b) => b.last.total - a.last.total);
  const blocks = users.map(({ id, last, day }) => {
    const detail = [...last.lines].map(([label, { count, price }]) => `• ${label}: ${count} (${money(count * price)})`).join('\n');
    return `${names.get(Number(id)) || `Usuario ${id}`}: ${money(last.total)}\n${detail}\nHoy en total: ${money(day.total)}`;
  });
  const sum = users.reduce((total, user) => total + user.last.total, 0);
  return `📊 Consumo por usuario, últimas 2 horas\n\n${blocks.join('\n\n')}\n\nTotal: ${money(sum)}\nEstimación con los precios aproximados, no es una factura.`;
}

async function fetchNames(ids) {
  if (!ids.length) return new Map();
  const rows = await database(`sb_bot_memory?telegram_id=in.(${ids.map(Number).join(',')})&select=telegram_id,name:state->profile->>telegramName,username:state->>telegramUsername`) || [];
  const names = new Map();
  for (const row of rows) {
    const label = row.username ? `@${row.username}` : row.name;
    if (label && (row.username || !names.has(row.telegram_id))) names.set(row.telegram_id, label);
  }
  return names;
}

export async function sendConsumptionReport(state, now = Date.now()) {
  if (state.consumptionReportAt && now - state.consumptionReportAt < INTERVAL_MS) return false;
  state.consumptionReportAt = now;
  try {
    const from = new Date(now - 25 * 3600_000).toISOString();
    const rows = await database(`sb_usage_events?created_at=gte.${from}&action=neq.ai_tokens&select=telegram_id,action,created_at&limit=10000`) || [];
    const ids = [...new Set(rows.map(row => row.telegram_id).filter(Boolean))];
    const report = buildConsumptionReport(rows, await fetchNames(ids), now);
    if (report) await sendMessage(OWNER, report);
  } catch { console.error('[usage] consumption report failed'); }
  return true;
}
