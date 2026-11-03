import { sendMessage } from './telegram.js';
import { askClaude } from './ai.js';
import { memoryRequest, groupConversationContext } from './memory.js';
import { PRODUCT_CONTEXT } from './product-context.js';
const GROUP_CHAT = process.env.TELEGRAM_GROUP_CHAT_ID || '-1004319265595';
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
  return { day, latest, sentToday, allowed: hour >= 9 && hour < 23 && sentToday < 12 && latest > 0
    && now - latest > 2 * 60_000 && now - (state.lastSent || 0) > 15 * 60_000 && now - (state.lastAttempt || 0) > 30 * 60_000
    && (freshConversation || (sentToday < 4 && now - (state.lastSent || 0) > 3 * 3600_000)) };
}
export async function runProactiveTick() {
  if (running) return;
  running = true;
  try {
    const state = await memoryRequest(GROUP_CHAT, 0);
    const community = await groupConversationContext(GROUP_CHAT);
    const timing = communityTiming(state, community);
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
    state.lastAttempt = Date.now(); state.lastContextAt = timing.latest;
    await memoryRequest(GROUP_CHAT, 0, 'POST', state);
    const result = await askClaude(
      'Write one natural Spanish message as Banana, the AI artist manager who leads this community. Take the initiative like a demanding, caring manager: follow up on a release, deadline or goal a member stated, propose one concrete next action with a date, connect two members whose goals fit, or start a short practical challenge about releases, identity, covers or content. If the goal of a member is unknown, ask ONE question. Vary the format and address different members over time; do not keep singling out the same person. Never claim to be human. Use their supplied name where helpful. Be a participant, not a service menu. If a concrete need fits the product, explain that benefit and offer one easy next step; do not repeatedly pitch subscriptions. Respect refusals. Never invent metrics, research, completed actions, identity, testimony or capabilities. Do not disclose private profiles, DMs or individual billing. Avoid repeating the previous suggestions. Return exactly SKIP if there is no useful new contribution. Maximum 70 words.',
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
