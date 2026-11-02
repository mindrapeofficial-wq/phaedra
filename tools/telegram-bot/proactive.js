/**
 * Proactive messaging — every 30 min the bot checks status and sends
 * a short update, suggestion, or reminder to the owner via Telegram.
 */

import { sendMessage } from "./telegram.js";
import { askClaude } from "./ai.js";
import * as pz from "./postzen.js";

const OWNER_CHAT = process.env.TELEGRAM_OWNER_ID || "1661812916";
const GROUP_CHAT = process.env.TELEGRAM_GROUP_CHAT_ID || "-1004319265595";
const INTERVAL_MS = 30 * 60 * 1000; // 30 min

let timer = null;
let lastAction = null;

const PROACTIVE_TYPES = [
  "status_report",
  "engagement_reminder",
  "content_idea",
  "analytics_insight",
  "inbox_check",
  "schedule_check",
];

function pickType() {
  // Don't repeat the last one
  const pool = PROACTIVE_TYPES.filter((t) => t !== lastAction);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  lastAction = pick;
  return pick;
}

async function statusReport() {
  try {
    const status = await pz.gatherStatus();
    const parts = [];
    if (status.recentPosts?.length) {
      const top = status.recentPosts[0];
      parts.push(`Ultimo post: ${top.likes} likes, ${top.comments} comentarios, ${top.views} views`);
    }
    parts.push(`Posts programados: ${status.scheduledCount ?? "?"}`);
    parts.push(`Borradores: ${status.draftCount ?? "?"}`);
    if (status.openDMs > 0) parts.push(`DMs abiertos: ${status.openDMs}`);
    return "📊 <b>Estado de @phaedrasound</b>\n\n" + parts.join("\n");
  } catch (e) {
    return null;
  }
}

async function engagementReminder() {
  const hour = new Date().getUTCHours();
  // Only remind during active hours (7am-22pm UTC ~= 8am-11pm Madrid)
  if (hour < 7 || hour > 22) return null;
  const tips = [
    "Abre Instagram y comenta 3-4 reels de productores. 10 minutos. Comentarios reales, preguntas sobre su proceso.",
    "Revisa las stories de las cuentas que seguimos. Responde a 2-3 con algo especifico.",
    "Busca un reel nuevo de @output o @spliceapp y deja un comentario temprano. Los primeros comentarios se ven mas.",
    "Entra en 2-3 posts de productores pequenos y comenta algo tecnico. Esa gente devuelve.",
    "Mira si alguien nuevo comento en nuestros posts y responde. La conversacion temprana ayuda al algoritmo.",
    "Escribe /engage y te preparo comentarios listos para copiar y pegar.",
  ];
  return "💬 <b>Engagement</b>\n\n" + tips[Math.floor(Math.random() * tips.length)];
}

async function contentIdea() {
  try {
    const result = await askClaude(
      "Give me ONE short Instagram reel idea for @phaedrasound (an open-source DAW). " +
      "Just the hook line and a 1-sentence description. Keep it under 50 words total. " +
      "Make it specific and filmable today. In Spanish.",
      ""
    );
    if (result.error) return null;
    return "💡 <b>Idea de contenido</b>\n\n" + result.response;
  } catch {
    return null;
  }
}

async function analyticsInsight() {
  try {
    const analytics = await pz.getAnalytics(7);
    const posts = analytics.data || [];
    if (posts.length === 0) return "📈 No hay datos de la ultima semana. Hay que publicar mas!";
    const totalViews = posts.reduce((s, p) => s + (p.analytics?.views || 0), 0);
    const totalLikes = posts.reduce((s, p) => s + (p.analytics?.likes || 0), 0);
    const best = posts[0];
    const lines = [
      `Esta semana: ${totalViews} views, ${totalLikes} likes en ${posts.length} posts`,
    ];
    if (best) {
      lines.push(`Mejor post: "${(best.content || "").slice(0, 40)}..." (${best.analytics?.views || 0} views)`);
    }
    return "📈 <b>Analytics semanal</b>\n\n" + lines.join("\n");
  } catch {
    return null;
  }
}

async function inboxCheck() {
  try {
    const convos = await pz.getOpenConversations();
    const count = (convos.data || []).length;
    if (count === 0) return "📩 Inbox limpio, no hay DMs pendientes.";
    return `📩 <b>Inbox</b>\n\nTienes ${count} conversacion${count > 1 ? "es" : ""} abierta${count > 1 ? "s" : ""}. Escribe "revisa DMs" para que las lea.`;
  } catch {
    return null;
  }
}

async function scheduleCheck() {
  try {
    const sched = await pz.getScheduledPosts();
    const posts = sched.data || [];
    if (posts.length === 0) {
      return "📅 <b>Sin posts programados!</b>\n\nNo hay nada en cola. Quieres que prepare un borrador?";
    }
    const next = posts[0];
    const when = next.scheduledFor ? new Date(next.scheduledFor).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : "?";
    return `📅 <b>Cola</b>\n\n${posts.length} post${posts.length > 1 ? "s" : ""} programado${posts.length > 1 ? "s" : ""}. Proximo: ${when}`;
  } catch {
    return null;
  }
}

async function runProactiveTick() {
  try {
    const type = pickType();
    let message = null;

    switch (type) {
      case "status_report": message = await statusReport(); break;
      case "engagement_reminder": message = await engagementReminder(); break;
      case "content_idea": message = await contentIdea(); break;
      case "analytics_insight": message = await analyticsInsight(); break;
      case "inbox_check": message = await inboxCheck(); break;
      case "schedule_check": message = await scheduleCheck(); break;
    }

    if (message) {
      await sendMessage(GROUP_CHAT, message);
      console.log(`[proactive] Sent ${type} to group`);
    } else {
      console.log(`[proactive] ${type} returned nothing, skipping`);
    }
  } catch (e) {
    console.error("[proactive] tick error:", e.message);
  }
}

export function startProactiveLoop() {
  if (timer) return;
  console.log("[proactive] Starting loop (every 30 min)");
  // First tick after 2 min (let the server warm up)
  setTimeout(() => {
    runProactiveTick();
    timer = setInterval(runProactiveTick, INTERVAL_MS);
  }, 2 * 60 * 1000);
}

export function stopProactiveLoop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
