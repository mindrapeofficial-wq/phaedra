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
  return `Para vincular tu cuenta, son 3 pasos:\n\n1. Abre https://banana.phaedra.com.es/cuenta.html e inicia sesión con la misma cuenta que usas en la extensión. Si no tienes, regístrate allí.\n2. En «Vincular Telegram», pega este código:\n\n${code}\n\n3. Espera aquí: te avisaré en cuanto quede vinculada.\n\nEl código caduca en 10 minutos. Si caduca, escribe /cuenta otra vez.`;
}
