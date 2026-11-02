import { randomBytes, createHash } from 'node:crypto';
import { getUser } from './tiers.js';
import { database } from './database.js';
export async function createAccountLink(userId, username) {
  const user = await getUser(userId, username);
  if (user.user_id) return 'Tu Telegram ya está vinculado a tu cuenta Social Banana. Gestiona la suscripción y descarga la extensión en https://banana.phaedra.com.es/cuenta.html';
  const code = randomBytes(12).toString('hex');
  await database('sb_telegram_links?on_conflict=telegram_id', 'POST', {
    telegram_id: userId, code_hash: createHash('sha256').update(code).digest('hex'), expires_at: new Date(Date.now()+10*60_000).toISOString(),
  }, 'resolution=merge-duplicates,return=minimal');
  return `Abre https://banana.phaedra.com.es/cuenta.html e inicia sesión con la misma cuenta que usas en la extensión. En «Vincular Telegram», pega este código:\n\n${code}\n\nCaduca en 10 minutos. Úsalo solo tú; no lo compartas. Vincular la cuenta no realiza ningún cobro.`;
}
