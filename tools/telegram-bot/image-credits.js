import { getUser } from './tiers.js';
const BASE = process.env.SUPABASE_URL || 'https://mfylkalarzuhivhmvzbm.supabase.co';
async function rpc(name, body) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const response = await fetch(`${BASE}/rest/v1/rpc/${name}`, { method: 'POST', signal: AbortSignal.timeout(10_000), headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error('No pude comprobar el crédito de imagen. Inténtalo en un momento.');
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
export async function reserveImage(userId, username) {
  if (Number(userId) === Number(process.env.TELEGRAM_OWNER_ID || 1661812916)) return null;
  const user = await getUser(userId, username);
  if (user.tier === 'owner' || user.tier === 'pro') return null;
  const token = await rpc('sb_reserve_free_image', { p_user: userId });
  if (!token) throw new Error('La cuenta gratuita incluye una imagen PRO en total. Ya está utilizada o hay una generación en curso. Puedes seguir preparando ideas y prompts conmigo.');
  return token;
}
export async function finishImage(userId, token, success) {
  if (token) await rpc('sb_finish_free_image', { p_user: userId, p_token: token, p_success: success });
}
