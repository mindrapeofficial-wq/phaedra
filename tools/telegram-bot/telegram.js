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
  const res = await fetch(`${API}/sendPhoto`, options);
  if (!res.ok) {
    const err = await res.text();
    console.error("telegram sendPhoto failed:", res.status, err);
    throw new Error(`Telegram sendPhoto failed: ${res.status}`);
  }
  return res;
}

export async function getFileUrl(fileId) {
  const res = await fetch(`${API}/getFile`, {
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
  await fetch(`${API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});
}
