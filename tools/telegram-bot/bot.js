import { sendMessage, sendTyping } from "./telegram.js";
import { gatherStatus } from "./postzen.js";
import { chat } from "./ai.js";

const OWNER_ID = Number(process.env.TELEGRAM_OWNER_ID) || 1661812916;

export async function handleUpdate(update) {
  const msg = update.message;
  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
  const isOwner = msg.from?.id === OWNER_ID;

  // In private, only respond to the owner
  if (!isGroup && !isOwner) return;

  // In groups, only respond when triggered
  if (isGroup && !isBotTriggered(msg)) return;

  const text = cleanMessage(msg.text);
  if (!text) return;

  console.log(`[${new Date().toISOString()}] chat=${chatId} ${msg.from?.username || "?"}: ${text}`);

  try {
    await sendTyping(chatId);

    let context = null;
    try {
      context = await gatherStatus();
    } catch (e) {
      console.error("PostZen gather failed:", e.message);
    }

    const reply = await chat(text, context);
    await sendMessage(chatId, reply);
    console.log(`[${new Date().toISOString()}] reply sent to ${chatId}`);
  } catch (e) {
    console.error("handleUpdate error:", e);
    await sendMessage(chatId, "Uf, algo fallo por mi lado. Dame un momento.").catch(() => {});
  }
}

function isBotTriggered(msg) {
  const text = (msg.text || "").toLowerCase();
  // Slash commands
  if (text.startsWith("/")) return true;
  // Mentioned by name
  if (text.includes("@socialbananabot")) return true;
  if (text.includes("banana")) return true;
  // Reply to the bot
  if (msg.reply_to_message?.from?.is_bot) return true;
  return false;
}

function cleanMessage(text) {
  return text
    .replace(/@socialbananabot/gi, "")
    .replace(/^\/\w+\s*/, "")
    .trim();
}
