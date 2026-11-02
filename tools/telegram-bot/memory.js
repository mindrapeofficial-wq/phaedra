const BASE = process.env.SUPABASE_URL || "https://mfylkalarzuhivhmvzbm.supabase.co";
export async function groupConversationContext(chatId) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("Persistent memory unavailable");
  const query = new URLSearchParams({ chat_id: `eq.${chatId}`, telegram_id: "gt.0", select: "telegram_id,history:state->history,name:state->profile->>telegramName,updated_at", order: "updated_at.desc", limit: "10" });
  const res = await fetch(`${BASE}/rest/v1/sb_bot_memory?${query}`, {
    signal: AbortSignal.timeout(10_000), headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error("Group context unavailable");
  return (await res.json()).filter(row => Date.now() - Date.parse(row.updated_at) < 86400_000)
    .map(row => ({ userId: row.telegram_id, name: row.name, updated_at: row.updated_at, messages: (row.history || []).filter(message => message.role === "user").slice(-6) }));
}
export async function memoryRequest(chatId, userId, method = "GET", state) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("Persistent memory unavailable");
  const query = method === "POST" ? "?on_conflict=chat_id,telegram_id" : `?chat_id=eq.${chatId}&telegram_id=eq.${userId}`;
  const res = await fetch(`${BASE}/rest/v1/sb_bot_memory${query}`, {
    method, signal: AbortSignal.timeout(10_000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    ...(state ? { body: JSON.stringify({ chat_id: chatId, telegram_id: userId, state, updated_at: new Date().toISOString() }) } : {}),
  });
  if (!res.ok) throw new Error(`Persistent memory failed: ${res.status}`);
  if (method === "GET") return (await res.json())[0]?.state || { history: [], profile: {}, reference: null };
}
