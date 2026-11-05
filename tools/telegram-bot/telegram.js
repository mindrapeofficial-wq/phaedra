import { applyMentions } from "./mentions.js";

const timedFetch = (url, options = {}) => fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(20_000) });
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;

export async function sendMessage(chatId, text, { people, ...options } = {}) {
  text = String(text).replace(/<a href="([^"]+)">([^<]*)<\/a>/g, "$2: $1")
    .replace(/<\/?(?:b|i|strong|em|code|pre)>/g, "").replace(/\*\*/g, "");
  if (text.length > 4000) {
    let result;
    for (let i = 0; i < text.length; i += 4000) result = await sendMessage(chatId, text.slice(i, i + 4000));
    return result;
  }
  const mentioned = applyMentions(text, people);
  const res = await timedFetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, ...mentioned, ...options }),
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
    console.error("telegram sendPhoto failed:", res.status);
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

export async function sendDocument(chatId, bytes, filename, caption) {
  const form = new FormData();
  form.set('chat_id', String(chatId));
  form.set('document', new Blob([bytes], { type: 'application/zip' }), filename);
  form.set('caption', caption || '');
  const response = await timedFetch(`${API}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Telegram document failed: ${response.status}`);
  return response;
}

export async function sendImageDocument(chatId, bytes, caption) {
  const form = new FormData();
  form.set('chat_id', String(chatId));
  form.set('document', new Blob([bytes], { type: 'image/png' }), 'social-banana-transparente.png');
  form.set('caption', caption || '');
  const response = await timedFetch(`${API}/sendDocument`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Telegram document failed: ${response.status}`);
  return response;
}

export async function sendTyping(chatId) {
  await timedFetch(`${API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});
}

export async function setBotCommands(commands) {
  const res = await timedFetch(`${API}/setMyCommands`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commands }) });
  if (!res.ok) throw new Error(`Telegram setMyCommands failed: ${res.status}`);
}

export async function sendVoice(chatId, audio, caption) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("voice", new Blob([audio], { type: "audio/ogg" }), "banana.ogg");
  form.set("caption", caption || "");
  const res = await timedFetch(`${API}/sendVoice`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Telegram sendVoice failed: ${res.status}`);
}

export async function sendAudioById(chatId, fileId, caption) {
  const res = await timedFetch(`${API}/sendAudio`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, audio: fileId, caption }) });
  if (!res.ok) throw new Error(`Telegram sendAudio failed: ${res.status}`);
  return res;
}
export async function sendAudio(chatId, audio, caption) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("audio", new Blob([audio], { type: "audio/mpeg" }), "banana-base.mp3");
  form.set("caption", caption || "");
  form.set("title", "Base de Banana");
  const res = await timedFetch(`${API}/sendAudio`, { method: "POST", body: form, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Telegram sendAudio failed: ${res.status}`);
  return res;
}
