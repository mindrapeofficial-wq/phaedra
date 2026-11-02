import { sendMessage, sendTyping, sendPhoto, getFileUrl } from "./telegram.js";
import { gatherStatus } from "./postzen.js";
import { chat } from "./ai.js";
import { checkAccess, incrementUsage, getUser, getTierInfo } from "./tiers.js";
import { runEngagementSession } from "./engage.js";

const OWNER_ID = Number(process.env.TELEGRAM_OWNER_ID) || 1661812916;
const STRIPE_LINK = process.env.STRIPE_PAYMENT_LINK || "https://buy.stripe.com/8x2dR8ez45JG85s4e504800";

// Conversation memory: last 20 messages per chat
const chatHistory = new Map();
const MAX_HISTORY = 20;

function addToHistory(chatId, role, content) {
  if (!chatHistory.has(chatId)) chatHistory.set(chatId, []);
  const history = chatHistory.get(chatId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
}

function getHistory(chatId) {
  return chatHistory.get(chatId) || [];
}

export async function handleUpdate(update) {
  const msg = update.message;
  if (!msg) return;
  if (!msg.text && !msg.caption) return;
  if (!msg.text) msg.text = msg.caption;

  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
  const userId = msg.from?.id;
  const username = msg.from?.username;

  // Handle commands first
  const cmd = msg.text.trim().toLowerCase();
  if (cmd === "/start") {
    await sendMessage(chatId, `Hola! Soy Social Banana, el agente de Instagram de @phaedrasound.\n\nComandos:\n/plan - ver tu plan actual\n/upgrade - desbloquear todas las herramientas\n\nEscribeme lo que necesites sobre Instagram y te ayudo.`);
    return;
  }
  if (cmd === "/plan" || cmd === "/miplan") {
    const user = await getUser(userId, username);
    const info = getTierInfo(user.tier);
    const used = user.last_request_date === new Date().toISOString().split("T")[0] ? user.daily_requests : 0;
    await sendMessage(chatId, `Tu plan: <b>${info.name}</b>\nConsultas: ${used}/${info.limit}\nHerramientas: ${info.tools}`);
    return;
  }
  if (cmd === "/engage") {
    if (userId !== OWNER_ID) {
      await sendMessage(chatId, "Solo el owner puede ejecutar engagement.");
      return;
    }
    await sendMessage(chatId, "🍌 Lanzando sesión de engagement...");
    runEngagementSession().catch((e) => console.error("engage cmd error:", e));
    return;
  }
  if (cmd === "/upgrade") {
    const user = await getUser(userId, username);
    if (user.tier === "owner" || user.tier === "pro") {
      await sendMessage(chatId, `Ya tienes el plan ${user.tier === "owner" ? "Owner" : "Pro"} activo.`);
    } else {
      await sendMessage(chatId, `Plan Pro - Todas las herramientas desbloqueadas:\n\n- Crear borradores de posts\n- Responder comentarios y DMs\n- Generar imagenes con DALL-E\n- Analisis con Claude AI\n- 50 consultas/dia\n\n<a href="${STRIPE_LINK}">Suscribirse al Plan Pro</a>`);
    }
    return;
  }

  // In private, check access
  if (!isGroup) {
    const access = await checkAccess(userId, username);
    if (!access.allowed) {
      await sendMessage(chatId, access.reason);
      return;
    }
  }

  // In groups, only respond when triggered and only owner has access
  if (isGroup) {
    if (!isBotTriggered(msg)) return;
    if (userId !== OWNER_ID) {
      await sendMessage(chatId, "Solo el admin puede usar el bot en el grupo.");
      return;
    }
  }

  const text = cleanMessage(msg.text);
  if (!text) return;

  // Extract photo URL if present
  let imageUrl = null;
  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    try {
      imageUrl = await getFileUrl(largest.file_id);
    } catch (e) {
      console.error("Failed to get photo URL:", e.message);
    }
  }

  console.log(`[${new Date().toISOString()}] chat=${chatId} user=${userId} ${username || "?"}: ${text}${imageUrl ? " [+image]" : ""}`);

  try {
    await sendTyping(chatId);

    let context = null;
    try {
      context = await gatherStatus();
    } catch (e) {
      console.error("PostZen gather failed:", e.message);
    }

    addToHistory(chatId, "user", text);
    const reply = await chat(text, context, imageUrl, getHistory(chatId));

    // Track usage for non-owners
    if (userId !== OWNER_ID) {
      await incrementUsage(userId);
    }

    addToHistory(chatId, "assistant", reply.text);
    if (reply.image) {
      await sendPhoto(chatId, reply.image.imageBase64
        ? Buffer.from(reply.image.imageBase64, "base64")
        : reply.image.imageUrl, reply.text.slice(0, 1024));
    } else {
      await sendMessage(chatId, reply.text);
    }

    console.log(`[${new Date().toISOString()}] reply sent to ${chatId}`);
  } catch (e) {
    console.error("handleUpdate error:", e);
    await sendMessage(chatId, "Uf, algo fallo por mi lado. Dame un momento.").catch(() => {});
  }
}

function isBotTriggered(msg) {
  const text = (msg.text || "").toLowerCase();
  if (text.startsWith("/")) return true;
  if (text.includes("@socialbananabot")) return true;
  if (text.includes("banana")) return true;
  if (msg.reply_to_message?.from?.is_bot) return true;
  return false;
}

function cleanMessage(text) {
  return text
    .replace(/@socialbananabot/gi, "")
    .replace(/^\/\w+\s*/, "")
    .trim();
}
