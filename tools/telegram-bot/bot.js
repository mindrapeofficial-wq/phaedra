import { sendMessage, sendTyping, sendPhoto } from "./telegram.js";
import { gatherStatus } from "./postzen.js";
import { chat } from "./ai.js";
import { checkAccess, incrementUsage, getUser, getTierInfo } from "./tiers.js";
import { runEngagementSession } from "./engage.js";

const OWNER_ID = Number(process.env.TELEGRAM_OWNER_ID) || 1661812916;
const STRIPE_LINK = process.env.STRIPE_PAYMENT_LINK || "https://buy.stripe.com/8x2dR8ez45JG85s4e504800";

export async function handleUpdate(update) {
  const msg = update.message;
  if (!msg?.text) return;

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

  console.log(`[${new Date().toISOString()}] chat=${chatId} user=${userId} ${username || "?"}: ${text}`);

  try {
    await sendTyping(chatId);

    let context = null;
    try {
      context = await gatherStatus();
    } catch (e) {
      console.error("PostZen gather failed:", e.message);
    }

    const reply = await chat(text, context);

    // Track usage for non-owners
    if (userId !== OWNER_ID) {
      await incrementUsage(userId);
    }

    const imageMatch = reply.match(/https:\/\/[^\s)]+\.(png|jpg|jpeg|webp)(\?[^\s)]*)?/i)
      || reply.match(/https:\/\/oaidalleapiprodscus\.blob\.core\.windows\.net[^\s)]+/)
      || reply.match(/https:\/\/[^\s)]*openai[^\s)]*\.(png|jpg|jpeg|webp|blob)[^\s)]*/i);
    if (imageMatch) {
      const caption = reply.replace(imageMatch[0], "").trim().slice(0, 1024);
      try {
        await sendPhoto(chatId, imageMatch[0], caption);
      } catch (photoErr) {
        console.error("sendPhoto failed, sending as text:", photoErr.message);
        await sendMessage(chatId, reply);
      }
    } else {
      await sendMessage(chatId, reply);
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
