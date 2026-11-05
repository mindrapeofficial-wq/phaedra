import { database } from './database.js';
import { activeSubscription } from './entitlements.js';
import { notifyAction } from './usage.js';

const OWNER = Number(process.env.TELEGRAM_OWNER_ID || 1661812916);
export const MUSIC_MODEL = 'music_v2_5';
export const MONTHLY_TRACKS = Number(process.env.BANANA_MONTHLY_TRACKS || 5);
const MIN_SECONDS = 15, MAX_SECONDS = 180, DEFAULT_SECONDS = 90;

export const clampSeconds = seconds => Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(Number(seconds) || DEFAULT_SECONDS)));
const monthStart = (now = Date.now()) => new Date(new Date(now).toISOString().slice(0, 7) + '-01T00:00:00Z').toISOString();

// Music is the most expensive service, so promotions and free accounts do not include it.
export async function musicDenial(userId) {
  if (!process.env.ELEVENLABS_API_KEY) return 'La generación de bases todavía no está activada. Puedo ayudarte con la idea, la estructura y el brief mientras tanto.';
  if (Number(userId) === OWNER) return null;
  const [user] = await database(`sb_telegram_users?telegram_id=eq.${Number(userId)}&select=user_id`) || [];
  const rows = user?.user_id ? await database(`sb_subscriptions?user_id=eq.${encodeURIComponent(user.user_id)}&livemode=eq.true&select=livemode,status,risk_hold,paid_until`) : [];
  if (!activeSubscription(rows || [])) return 'Las bases están incluidas en la suscripción mensual, que todavía no está disponible. Puedo ayudarte con la idea y el brief mientras tanto.';
  const used = await database(`sb_usage_events?telegram_id=eq.${Number(userId)}&action=eq.music&created_at=gte.${monthStart()}&select=id`);
  return (used?.length || 0) >= MONTHLY_TRACKS ? `Ya has usado tus ${MONTHLY_TRACKS} bases de este mes. El mes que viene tendrás más.` : null;
}

export async function generateMusic({ userId, prompt, seconds, vocals = false }) {
  if (!userId) return { error: 'Music requires an identified user' };
  const denied = await musicDenial(userId);
  if (denied) return { denied };
  const response = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
    method: 'POST', signal: AbortSignal.timeout(240_000),
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: MUSIC_MODEL, prompt: String(prompt || '').slice(0, 2000), music_length_ms: clampSeconds(seconds) * 1000, force_instrumental: !vocals }),
  });
  if (!response.ok) {
    console.error('[music] request failed', { status: response.status });
    return { error: `Music request failed: ${response.status}` };
  }
  const audio = Buffer.from(await response.arrayBuffer());
  notifyAction('music');
  return { audio };
}
