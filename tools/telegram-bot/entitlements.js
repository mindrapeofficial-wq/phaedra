import { database } from './database.js';
import { hasActiveInstagramTrial } from './instagram-trial.js';
export function activeSubscription(rows, now = Date.now()) {
  return rows.find(s => s.livemode === true && s.status === 'active' && s.risk_hold === false && Date.parse(s.paid_until) > now) || null;
}
export async function requireInstagramAccess(userId) {
  if (Number(userId) === Number(process.env.TELEGRAM_OWNER_ID || 1661812916)) return { owner: true };
  const user = (await database(`sb_telegram_users?telegram_id=eq.${Number(userId)}&select=user_id`))[0];
  if (!user?.user_id) throw new Error('Para conectar Instagram, primero vincula tu cuenta de Social Banana por privado con /cuenta. Conectar Instagram se contrata aparte de los planes y los cobros todavía no están activos.');
  if (await hasActiveInstagramTrial(userId)) return { userId: user.user_id, trial: true };
  // Plans no longer include Instagram, and the paid add-on is not on sale yet.
  if (process.env.BANANA_INSTAGRAM_INCLUDED !== 'true') throw new Error('Conectar Instagram se contrata aparte de los planes y todavía no está disponible. Si aún queda el hueco gratis, escribe /reclamar y después /instagram.');
  const rows = await database(`sb_subscriptions?user_id=eq.${encodeURIComponent(user.user_id)}&livemode=eq.true&select=livemode,status,risk_hold,paid_until`);
  const subscription = activeSubscription(rows);
  if (!subscription) throw new Error('No consta una suscripción de pago activa para conectar Instagram. Si aún queda el hueco gratis, escribe primero /reclamar y después /instagram. El mes de prueba de la extensión y los pagos de prueba no activan esta conexión. Puedes seguir preparando tu contenido conmigo.');
  return { userId: user.user_id, subscription };
}
