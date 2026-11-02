const timedFetch = (url, options = {}) => fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(20_000) });
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;

export async function sendMessage(chatId, text) {
  text = String(text).replace(/<a href="([^"]+)">([^<]*)<\/a>/g, "$2: $1")
    .replace(/<\/?(?:b|i|strong|em|code|pre)>/g, "").replace(/\*\*/g, "");
  if (text.length > 4000) {
    let result;
    for (let i = 0; i < text.length; i += 4000) result = await sendMessage(chatId, text.slice(i, i + 4000));
    return result;
  }
  const res = await timedFetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("telegram sendMessage failed:", res.status);
    throw new Error(`Telegram message failed: ${res.status}`);
  }
  return res;
}

export async function sendPhoto(chatId, photo, caption) {
  let options;
  if (Buffer.isBuffer(photo)) {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("photo", new Blob([photo], { type: "image/png" }), "image.png");
    form.set("caption", caption || "");
    options = { method: "POST", body: form };
  } else {
    options = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, photo, caption }),
    };
  }
  const res = await timedFetch(`${API}/sendPhoto`, options);
  if (!res.ok) {
    const err = await res.text();
    console.error("telegram sendPhoto failed:", res.status, err);
    throw new Error(`Telegram sendPhoto failed: ${res.status}`);
  }
  return res;
}

export async function getFileUrl(fileId) {
  const res = await timedFetch(`${API}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const filePath = data.result?.file_path;
  if (!filePath) return null;
  return `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
}

export async function sendTyping(chatId) {
  await timedFetch(`${API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});
}
