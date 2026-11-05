import { randomBytes } from 'node:crypto';
import { getUser } from './tiers.js';
import { database } from './database.js';
import { sendMessage } from './telegram.js';

export const REFERRAL_NOTE = 'Con /referir tienes tu enlace: por cada persona que invites y pague una suscripción, consigues 1 mes gratis de Social Banana. Los cobros reales aún no están activos, así que de momento solo registramos a quién invitas.';

const CLAIM_REPLIES = {
  recorded: 'He registrado tu invitación. Quien te invitó recibirá su mes gratis si contratas y pagas una suscripción cuando estén activas.',
  self: 'Este enlace es tuyo, así que no cuenta como referido.',
  invalid: 'Ese enlace de invitación no es válido, pero puedes usar Banana igualmente.',
  already_referred: 'Ya tenías una invitación registrada. Solo cuenta la primera.',
  existing_customer: 'Tu cuenta ya tiene una suscripción, así que esta invitación no cuenta.',
};

export async function referralLink(userId, username) {
  await getUser(userId, username);
  await database('sb_referral_codes?on_conflict=telegram_id', 'POST', { telegram_id: userId, code: randomBytes(5).toString('hex') }, 'resolution=ignore-duplicates,return=minimal');
  const [row] = await database(`sb_referral_codes?telegram_id=eq.${Number(userId)}&select=code`);
  if (!row?.code) throw new Error('No pude crear tu enlace. Inténtalo de nuevo en un momento.');
  return `https://t.me/SocialBananaBot?start=ref_${row.code}`;
}

export async function referralSummary(userId, username) {
  const link = await referralLink(userId, username);
  const rows = await database(`sb_referrals?referrer_telegram=eq.${Number(userId)}&select=status`) || [];
  const count = status => rows.filter(row => row.status === status).length;
  return `Tu enlace de invitación:\n${link}\n\nPor cada persona nueva que entre con él, consigues 1 día de funciones PRO al momento. Si además paga una suscripción, 1 mes gratis de Social Banana.\n\nInvitados: ${count('pending')}\nCon pago verificado, mes pendiente de aplicar: ${count('qualified')}\nMeses aplicados: ${count('rewarded')}\n\nLos cobros reales aún no están activos, así que todavía no se puede ganar ningún mes.`;
}

export async function claimReferral(code, userId, username) {
  await getUser(userId, username);
  const result = await database('rpc/sb_claim_referral', 'POST', { p_code: code, p_referred: userId });
  if (result === 'recorded') {
    const [row] = await database(`sb_referrals?referred_telegram=eq.${Number(userId)}&select=referrer_telegram`).catch(() => []) || [];
    if (row?.referrer_telegram) await sendMessage(row.referrer_telegram, '🎁 Alguien ha entrado con tu invitación. Si es nuevo en Social Banana, tienes 1 día más de funciones PRO.').catch(() => console.error('[referral] notice failed'));
  }
  return CLAIM_REPLIES[result] || CLAIM_REPLIES.invalid;
}
