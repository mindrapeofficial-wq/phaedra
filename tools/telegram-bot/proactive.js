import { sendMessage } from './telegram.js';
import { askClaude } from './ai.js';
import { memoryRequest, groupConversationContext } from './memory.js';
import { PRODUCT_CONTEXT } from './product-context.js';
import { database } from './database.js';
import { runUsageTick } from './usage.js';
import { postzen, connection } from './instagram.js';
import { TRIAL_MESSAGE, instagramTrialClaimed, expireInstagramTrial, notifyNewAccountLinks } from './instagram-trial.js';
import { proPromoActive, PROMO_MESSAGE } from './promo.js';
const GROUP_CHAT = process.env.TELEGRAM_GROUP_CHAT_ID || '-1004319265595';
const OWNER = process.env.TELEGRAM_OWNER_ID || '1661812916';
const ANNOUNCEMENT = 'instagram-extension-10eur-preparation-v1';
let timer, starting, running = false;
export function communityTiming(state, community, now = Date.now()) {
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: 'numeric', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  const part = key => local.find(p => p.type === key)?.value;
  const day = `${part('year')}-${part('month')}-${part('day')}`;
  const hour = Number(part('hour'));
  const latest = Math.max(0, ...community.map(p => Date.parse(p.updated_at) || 0));
  const sentToday = state.day === day ? state.sentToday || 0 : 0;
  const freshConversation = latest > (state.lastContextAt || 0);
  return { day, latest, sentToday, allowed: !(state.pausedUntil > now) && hour >= 9 && hour < 23 && sentToday < 12
    && now - latest > 2 * 60_000 && now - (state.lastSent || 0) > 15 * 60_000 && now - (state.lastAttempt || 0) > 30 * 60_000
    && (state.nudge || freshConversation || (sentToday < 4 && now - (state.lastSent || 0) > 3 * 3600_000 && now - (state.lastAttempt || 0) > 3 * 3600_000)) };
}
export function applySupervisorOrder(state, order, now = Date.now()) {
  if (order.action === 'pause_initiative') state.pausedUntil = now + Math.min(Math.max(order.pause_hours || 1, 1), 24) * 3600_000;
  if (order.action === 'resume_initiative') state.pausedUntil = 0;
  if (order.action === 'nudge_group') state.nudge = true;
  return state;
}
async function runSupervisorOrders(state) {
  const orders = await database(`sb_supervisor_orders?applied_at=is.null&expires_at=gt.${new Date().toISOString()}&select=*&order=created_at.asc&limit=10`);
  for (const order of orders || []) {
    await database(`sb_supervisor_orders?id=eq.${Number(order.id)}`, 'PATCH', { applied_at: new Date().toISOString() }, 'return=minimal');
    if (order.action === 'notify_owner') await sendMessage(OWNER, `Supervisor de Banana: ${String(order.note || 'revisa el bot').slice(0, 300)}`).catch(() => console.error('[supervisor] owner notice failed'));
    else applySupervisorOrder(state, order);
    console.log('[supervisor] order applied', order.action);
  }
  if (orders?.length) await memoryRequest(GROUP_CHAT, 0, 'POST', state);
}
export async function announcePromo(state) {
  if (!proPromoActive()) return false;
  let changed = false;
  if (!state.promoGroupNotified) {
    await sendMessage(GROUP_CHAT, PROMO_MESSAGE);
    state.promoGroupNotified = true; changed = true;
  }
  const done = new Set(state.promoNotified || []);
  const users = await database('sb_telegram_users?tier=eq.free&select=telegram_id');
  for (const { telegram_id: id } of users || []) {
    if (done.has(id)) continue;
    done.add(id); changed = true;
    state.promoNotified = [...done];
    await memoryRequest(GROUP_CHAT, 0, 'POST', state);
    try { await sendMessage(id, PROMO_MESSAGE); console.log('[promo] private notice delivered'); }
    catch { console.log('[promo] private notice not delivered'); }
  }
  return changed;
}
async function announceInstagramTrial(state) {
  if (state.trialAnnounced) return;
  state.trialAnnounced = true;
  await memoryRequest(GROUP_CHAT, 0, 'POST', state);
  if (await instagramTrialClaimed()) return;
  await sendMessage(GROUP_CHAT, TRIAL_MESSAGE);
  for (const { telegram_id: id } of await database('sb_telegram_users?tier=eq.free&select=telegram_id') || []) {
    await sendMessage(id, TRIAL_MESSAGE).catch(() => console.log('[trial] private notice not delivered'));
  }
  console.log('[trial] announced');
}
// Billing is private, so new subscribers are celebrated without naming them.
export async function announceNewSubscribers(state) {
  const rows = await database('sb_paid_instagram_clients?select=user_id');
  const ids = (rows || []).map(row => row.user_id);
  if (!state.paidAnnounced) { state.paidAnnounced = ids; return true; }
  const fresh = ids.filter(id => !state.paidAnnounced.includes(id));
  if (!fresh.length) return false;
  state.paidAnnounced = ids;
  await memoryRequest(GROUP_CHAT, 0, 'POST', state);
  await sendMessage(GROUP_CHAT, fresh.length === 1 ? '🎉 ¡Alguien acaba de unirse a Social Banana con la suscripción mensual! Bienvenido al equipo 🍌' : `🎉 ¡${fresh.length} personas acaban de unirse a Social Banana con la suscripción mensual! Bienvenidos al equipo 🍌`);
  return true;
}
export async function runProactiveTick() {
  if (running) return;
  running = true;
  try {
    const state = await memoryRequest(GROUP_CHAT, 0);
    const community = await groupConversationContext(GROUP_CHAT);
    await runSupervisorOrders(state).catch(() => console.error('[supervisor] orders unavailable'));
    await expireInstagramTrial({ api: postzen, connection }).catch(() => console.error('[trial] expiry failed, will retry'));
    await announceInstagramTrial(state).catch(() => console.error('[trial] announcement failed'));
    if (await runUsageTick(state).catch(() => { console.error('[usage] tick failed'); return false; })) await memoryRequest(GROUP_CHAT, 0, 'POST', state);
    if (await announceNewSubscribers(state).catch(() => { console.error('[community] subscriber check failed'); return false; })) await memoryRequest(GROUP_CHAT, 0, 'POST', state);
    if (await notifyNewAccountLinks(state).catch(() => { console.error('[account] link check failed'); return false; })) await memoryRequest(GROUP_CHAT, 0, 'POST', state);
    const timing = communityTiming(state, community);
    if (await announcePromo(state)) await memoryRequest(GROUP_CHAT, 0, 'POST', state);
    if (state.productAnnouncement !== ANNOUNCEMENT) {
      const message = 'Os cuento lo que estamos preparando para Social Banana 🍌: una suscripción de 10 €/mes que incluirá conectar un Instagram y un mes de acceso a la extensión. Los cobros reales aún no están activados; cuando estén listos os explicaré cómo hacerlo.\n\nMientras tanto podemos trabajar en vuestra identidad y vuestras portadas: cada cuenta gratuita tendrá una imagen PRO para probar. Si ya tenéis una canción en marcha, contadme qué queréis transmitir y os ayudo a aterrizar la idea. También puedo guiaros para instalar Banana.';
      await sendMessage(GROUP_CHAT, message);
      state.productAnnouncement = ANNOUNCEMENT;
      state.lastSent = Date.now(); state.day = timing.day; state.sentToday = timing.sentToday + 1;
      state.suggestions = [...(state.suggestions || []), message].slice(-12);
      await memoryRequest(GROUP_CHAT, 0, 'POST', state);
      console.log('[community] product update delivered'); return;
    }
    if (!timing.allowed) return;
    state.lastAttempt = Date.now(); state.lastContextAt = timing.latest; state.nudge = false;
    await memoryRequest(GROUP_CHAT, 0, 'POST', state);
    const result = await askClaude(
      'Write one natural Spanish message as Banana, the AI artist manager who leads this community. Take the initiative like a demanding, caring manager: follow up on a release, deadline or goal a member stated, propose one concrete next action with a date, connect two members whose goals fit, or start a short practical challenge about releases, identity, covers or content. If the goal of a member is unknown, ask ONE question. Vary the format and address different members over time; do not keep singling out the same person. Never claim to be human. Use their supplied name where helpful. Be a participant, not a service menu. If a concrete need fits the product, explain that benefit and offer one easy next step; do not repeatedly pitch subscriptions. Respect refusals. Never invent metrics, research, completed actions, identity, testimony or capabilities. Do not disclose private profiles, DMs or individual billing. Avoid repeating the previous suggestions. If the conversation data is empty because the group has been quiet, do not stay silent: open with one short practical challenge or question for artists about releases, identity, covers or content, without naming anyone or implying that anyone said something. Otherwise return exactly SKIP if there is no useful new contribution. Maximum 70 words.',
      JSON.stringify({ product: PRODUCT_CONTEXT, community, previousSuggestions: state.suggestions || [] })
    );
    const message = result.response?.trim();
    if (result.error || !message || message === 'SKIP') return;
    await sendMessage(GROUP_CHAT, message);
    state.lastSent = Date.now(); state.lastContextAt = timing.latest;
    state.day = timing.day; state.sentToday = timing.sentToday + 1;
    state.suggestions = [...(state.suggestions || []), message].slice(-12);
    await memoryRequest(GROUP_CHAT, 0, 'POST', state);
    console.log('[community] contextual follow-up delivered');
  } catch (error) { console.error('[community] follow-up failed', error.name); }
  finally { running = false; }
}
export function startProactiveLoop() {
  if (timer || starting) return;
  starting = setTimeout(() => { starting = null; void runProactiveTick(); timer = setInterval(runProactiveTick, 60_000); }, 20_000);
}
export function stopProactiveLoop() { clearTimeout(starting); clearInterval(timer); starting = timer = null; }
