import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyStripeSignature(body, signature, secret, now = Date.now()) {
  if (!secret || typeof signature !== "string") return false;
  const parts = signature.split(",").map(value => value.trim().split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  if (!/^\d+$/.test(timestamp || "") || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  return parts.some(([key, value]) => key === "v1" && /^[a-f0-9]{64}$/i.test(value || "") && timingSafeEqual(Buffer.from(value, "hex"), expected));
}

// A single billing authority serves both the extension and Telegram.
// Register Stripe at the canonical Supabase banana-billing/webhook endpoint.
export async function handleStripeWebhook(body, signature) {
  if (!verifyStripeSignature(body, signature, process.env.STRIPE_WEBHOOK_SECRET)) throw new Error('Invalid Stripe signature');
  throw new Error('Use the canonical banana-billing webhook; this legacy endpoint cannot grant access');
}
