const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;

export async function sendMessage(chatId, text) {
  const res = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("telegram sendMessage failed:", res.status, err);
  }
  return res;
}

export async function sendPhoto(chatId, photoUrl, caption) {
  const res = await fetch(`${API}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("telegram sendPhoto failed:", res.status, err);
  }
  return res;
}

export async function sendTyping(chatId) {
  await fetch(`${API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});
}
