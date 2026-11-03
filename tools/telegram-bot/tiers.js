import { REFERRAL_NOTE } from './referrals.js';
import { withPromoTier } from './promo.js';
const timedFetch = (url, options = {}) => fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(20_000) });
const SUPABASE_URL = process.env.SUPABASE_URL || "https://mfylkalarzuhivhmvzbm.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabase(path, method = "GET", body = null) {
  const opts = {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "return=minimal",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await timedFetch(`${SUPABASE_URL}/rest/v1${path}`, opts);
  if (!res.ok) throw new Error(`User access unavailable (${res.status})`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const FREE_DAILY_LIMIT = 30;
const PRO_DAILY_LIMIT = 50;

const FREE_TOOLS = new Set([
  "get_recent_posts", "get_scheduled_posts", "get_analytics",
  "get_best_time_to_post", "get_open_conversations",
]);

const PRO_TOOLS = new Set([
  ...FREE_TOOLS,
  "get_draft_posts", "create_draft_post", "get_post_comments",
  "reply_to_comment", "get_conversation_messages", "send_dm",
  "sync_external_posts", "generate_image", "ask_claude",
]);

export async function getUser(telegramId, username) {
  const rows = await supabase(`/sb_telegram_users?telegram_id=eq.${telegramId}&select=*`);
  if (rows && rows.length > 0) return withPromoTier(rows[0]);

  // Auto-register as free
  const created = await supabase("/sb_telegram_users", "POST", {
    telegram_id: telegramId,
    username: username || null,
    tier: "free",
  });
  return withPromoTier(created?.[0] || { telegram_id: telegramId, tier: "free", daily_requests: 0 });
}

export async function checkAccess(telegramId, username, toolName) {
  const user = await getUser(telegramId, username);

  if (user.tier === "owner") return { allowed: true, user };

  const today = new Date().toISOString().split("T")[0];
  const limit = user.tier === "pro" ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;

  // Reset daily count if new day
  let requests = user.daily_requests || 0;
  if (user.last_request_date !== today) requests = 0;

  if (requests >= limit) {
    return {
      allowed: false,
      user,
      reason: user.tier === "free"
        ? `Has llegado al limite de ${FREE_DAILY_LIMIT} consultas gratis por dia. Usa /upgrade para desbloquear mas.\n\n${REFERRAL_NOTE}`
        : `Has llegado al limite de ${PRO_DAILY_LIMIT} consultas pro por dia.`,
    };
  }

  if (toolName && user.tier === "free" && !FREE_TOOLS.has(toolName)) {
    return {
      allowed: false,
      user,
      reason: `Esa herramienta es solo para usuarios Pro. Usa /upgrade para acceder a todas las funciones.`,
    };
  }

  return { allowed: true, user };
}

export async function incrementUsage(telegramId) {
  await supabase("/rpc/sb_increment_telegram_usage", "POST", { p_telegram_id: telegramId });
}

export function getTierInfo(tier) {
  switch (tier) {
    case "owner": return { name: "Owner", limit: "ilimitado", tools: "todas" };
    case "pro": return { name: "Pro", limit: `${PRO_DAILY_LIMIT}/dia`, tools: "todas" };
    default: return { name: "Free", limit: `${FREE_DAILY_LIMIT}/dia`, tools: "conversación, ideas y una imagen PRO en total" };
  }
}
