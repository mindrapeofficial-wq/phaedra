import { sendMessage, sendTyping } from "./telegram.js";
import { gatherStatus } from "./postzen.js";
import { chat } from "./ai.js";

const GROUP_CHAT_ID = Number(process.env.TELEGRAM_GROUP_CHAT_ID) || -1004319265595;
const OWNER_ID = Number(process.env.TELEGRAM_OWNER_ID) || 1661812916;

export async function handleUpdate(update) {
  const msg = update.message;
  if (!msg?.text) return;

  // Only respond in the target group or to the owner in private
  const chatId = msg.chat.id;
  const isGroup = chatId === GROUP_CHAT_ID;
  const isOwner = msg.from?.id === OWNER_ID;

  if (!isGroup && !isOwner) return;

  // In groups, only respond when mentioned or replied to, or with /commands
  if (isGroup && !isBotTriggered(msg)) return;

  const text = cleanMessage(msg.text);
  if (!text) return;

  console.log(`[${new Date().toISOString()}] ${msg.from?.username || "?"}: ${text}`);

  await sendTyping(chatId);

  // Gather Instagram data for context
  let context = null;
  try {
    context = await gatherStatus();
  } catch (e) {
    console.error("PostZen gather failed:", e.message);
  }

  // Let ChatGPT handle the response with Instagram context
  const reply = await chat(text, context);
  await sendMessage(chatId, reply);
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
