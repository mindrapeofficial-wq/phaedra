const PROMO_ENDS_AT = Date.parse('2026-11-06T12:30:00Z');

export function proPromoActive(now = Date.now()) {
  return process.env.BANANA_PROMO_OFF !== '1' && now < PROMO_ENDS_AT;
}
export function withPromoTier(user, now = Date.now()) {
  return user?.tier === 'free' && proPromoActive(now) ? { ...user, tier: 'pro' } : user;
}
export const PROMO_MESSAGE = '🍌 Regalo para la comunidad: hasta el viernes 6 de noviembre a las 13:30 (hora de Madrid) tienes gratis las funciones Pro de Banana, incluidas imágenes PRO sin el límite de una.\n\nNo incluye conectar Instagram. Cuando termine, vuelves a tu plan gratuito sin ningún cobro.\n\n¿Tienes un lanzamiento en marcha? Cuéntamelo y nos ponemos con la portada y el plan: https://t.me/SocialBananaBot?start=welcome';
export const PROMO_CONTEXT = 'Promoción activa: hasta el 6 de noviembre de 2026 a las 13:30 (hora de Madrid), todos los usuarios tienen las funciones Pro del bot gratis, incluidas imágenes PRO sin el límite de una. No incluye conectar Instagram, que sigue requiriendo una suscripción de pago, salvo un único hueco gratis de 3 días para el primero que escriba /reclamar por privado con su cuenta vinculada; no aseguras que siga libre, remite a /reclamar. Al terminar, cada cuenta vuelve a su plan sin cobros.';
