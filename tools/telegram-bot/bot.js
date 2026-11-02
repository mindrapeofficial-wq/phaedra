import { sendMessage, sendTyping, sendPhoto } from "./telegram.js";
import { gatherStatus } from "./postzen.js";
import { chat } from "./ai.js";

const OWNER_ID = Number(process.env.TELEGRAM_OWNER_ID) || 1661812916;

export async function handleUpdate(update) {
  const msg = update.message;
  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
  const isOwner = msg.from?.id === OWNER_ID;

  if (!isGroup && !isOwner) return;
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

    // If the reply contains a DALL-E image URL, send it as a photo
    const imageMatch = reply.match(/https:\/\/oaidalleapiprodscus\.blob\.core\.windows\.net[^\s)]+/);
    if (imageMatch) {
      const caption = reply.replace(imageMatch[0], "").trim().slice(0, 1024);
      await sendPhoto(chatId, imageMatch[0], caption);
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
