import { database } from './database.js';
import { sendMessage } from './telegram.js';

const OWNER = Number(process.env.TELEGRAM_OWNER_ID || 1661812916);
const PHAEDRA_ACCOUNT = 'j9728s2139w1qrqdte0fynrjf98hbg4j';
export const TRIAL_MESSAGE = '🍌 Hay 1 hueco gratis para conectar tu Instagram a Banana durante 3 días. Es para el primero que lo reclame.\n\nEscríbeme /reclamar por privado: https://t.me/SocialBananaBot?start=reclamar\n\nNecesitas una cuenta Creator o Business y tu cuenta de Social Banana vinculada con /cuenta. Cuando termine, se desconecta sola y sin ningún cobro.';
const REPLIES = {
  claimed: '¡Es tuyo! Tienes 3 días desde ahora para usar Banana con tu Instagram.\n\nEscribe /instagram para conectarlo. Podré analizar tu cuenta y preparar borradores, pero no publicaré ni enviaré mensajes. Al terminar, se desconectará sola y sin cobros.',
  yours: 'Este hueco ya es tuyo. Usa /instagram para conectar o revisar tu cuenta.',
  taken: 'Este hueco ya lo ha reclamado otra persona. Si se libera otro, lo avisaré en el grupo.',
  not_linked: 'Antes necesito tu cuenta de Social Banana vinculada: escribe /cuenta y sigue los pasos. Después vuelve a escribir /reclamar. El hueco no queda reservado hasta entonces.',
};

export async function claimInstagramTrial(userId) {
  if (Number(userId) === OWNER) return 'Tu cuenta de propietario ya tiene acceso. El hueco queda para la comunidad.';
  const result = await database('rpc/sb_claim_instagram_trial', 'POST', { p_user: userId });
  if (result === 'claimed') await sendMessage(OWNER, 'Alguien ha reclamado el hueco gratis de Instagram. Termina en 3 días y se cerrará solo.').catch(() => console.error('[trial] owner notice failed'));
  return REPLIES[result] || REPLIES.taken;
}
export async function hasActiveInstagramTrial(userId, now = Date.now()) {
  const rows = await database(`sb_instagram_trial?telegram_id=eq.${Number(userId)}&ended_at=is.null&ends_at=gt.${new Date(now).toISOString()}&select=telegram_id`);
  return !!rows?.length;
}
export async function instagramTrialClaimed() {
  return !!(await database('sb_instagram_trial?select=telegram_id'))?.length;
}

export async function expireInstagramTrial({ api, connection }, now = Date.now()) {
  const [trial] = await database(`sb_instagram_trial?ended_at=is.null&ends_at=lte.${new Date(now).toISOString()}&select=telegram_id`) || [];
  if (!trial) return false;
  const userId = trial.telegram_id;
  const [user] = await database(`sb_telegram_users?telegram_id=eq.${Number(userId)}&select=user_id`);
  const paid = user?.user_id ? await database(`sb_subscriptions?user_id=eq.${encodeURIComponent(user.user_id)}&livemode=eq.true&status=eq.active&risk_hold=eq.false&paid_until=gt.${new Date(now).toISOString()}&select=user_id`) : [];
  if (!paid?.length) {
    const row = await connection(userId);
    if (row?.profile_id) {
      const accounts = (await api(`/accounts?profileId=${encodeURIComponent(row.profile_id)}&platform=instagram`)).accounts || [];
      for (const account of accounts) {
        const profile = typeof account.profileId === 'string' ? account.profileId : account.profileId?._id;
        if (profile === row.profile_id && account._id !== PHAEDRA_ACCOUNT) await api(`/accounts/${encodeURIComponent(account._id)}`, { method: 'DELETE' });
      }
      await connection(userId, { ...row, status: 'disabled' });
    }
  }
  await database(`sb_instagram_trial?telegram_id=eq.${Number(userId)}`, 'PATCH', { ended_at: new Date(now).toISOString() }, 'return=minimal');
  await sendMessage(userId, paid?.length ? 'Tu hueco gratis ha terminado. Tu Instagram sigue conectado porque tienes una suscripción activa.' : 'Tu hueco gratis de Instagram ha terminado y he desconectado la cuenta. No se ha borrado ninguna publicación ni hay ningún cobro.').catch(() => console.error('[trial] user notice failed'));
  await sendMessage(OWNER, 'El hueco gratis de Instagram ha terminado y se ha cerrado.').catch(() => console.error('[trial] owner notice failed'));
  return true;
}
