import { database } from './database.js';
import { paidTier, scaled } from './paid-tier.js';

const OWNER = Number(process.env.TELEGRAM_OWNER_ID || 1661812916);
export const LITE_QUALITY = process.env.BANANA_IMAGE_LITE_QUALITY || 'low';
export const imageLiteAllowance = isPaid => isPaid ? { count: 25, monthly: true } : { count: 5, monthly: false };
export const wantsLite = text => /(?<![\p{L}\p{N}])lite(?![\p{L}\p{N}])/iu.test(String(text || ''));

export async function imageLiteDenial(userId) {
  if (Number(userId) === OWNER) return null;
  const plan = await paidTier(userId), paid = plan !== 'free';
  const allowance = imageLiteAllowance(paid);
  if (paid) allowance.count = scaled(allowance.count, plan);
  const period = allowance.monthly ? `&created_at=gte.${new Date().toISOString().slice(0, 7)}-01T00:00:00Z` : '';
  const used = await database(`sb_usage_events?telegram_id=eq.${Number(userId)}&action=eq.image_lite${period}&select=id`);
  if ((used?.length || 0) < allowance.count) return null;
  return paid ? `Ya has usado tus ${allowance.count} imágenes Lite de este mes. El mes que viene tendrás más.` : 'Ya has usado tus 5 imágenes Lite gratuitas. La suscripción incluye 25 al mes.';
}
