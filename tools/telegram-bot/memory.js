const BASE = process.env.SUPABASE_URL || "https://mfylkalarzuhivhmvzbm.supabase.co";
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
