import { getUser } from "./tiers.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://mfylkalarzuhivhmvzbm.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabasePatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error("Supabase patch failed:", res.status, await res.text());
}

export async function handleStripeWebhook(body) {
  const event = JSON.parse(body);
  const type = event.type;
  console.log(`[stripe] ${type}`);

  if (type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_email || session.customer_details?.email;
    const telegramStart = session.client_reference_id;

    if (telegramStart) {
      const telegramId = parseInt(telegramStart, 10);
      if (!isNaN(telegramId)) {
        await supabasePatch(
          `/sb_telegram_users?telegram_id=eq.${telegramId}`,
          { tier: "pro", updated_at: new Date().toISOString() }
        );
        console.log(`[stripe] Upgraded telegram user ${telegramId} to pro`);
      }
    }
  }

  if (type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const metadata = sub.metadata;
    if (metadata?.telegram_id) {
      await supabasePatch(
        `/sb_telegram_users?telegram_id=eq.${metadata.telegram_id}`,
        { tier: "free", updated_at: new Date().toISOString() }
      );
      console.log(`[stripe] Downgraded telegram user ${metadata.telegram_id} to free`);
    }
  }
}
