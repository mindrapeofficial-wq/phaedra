import { randomUUID } from 'node:crypto';
import { database } from './database.js';
import { handleUpdate } from './bot.js';
import { sendMessage } from './telegram.js';
let timer, active = 0, stopped = false, pumping = false;
export async function enqueueUpdate(update) {
  if (!Number.isSafeInteger(update.update_id)) throw new Error('Invalid update');
  if (!update.message?.chat?.id || update.message.from?.is_bot) return;
  // Persist before acknowledging Telegram; duplicate deliveries cannot add another job.
  const inserted = await database('sb_bot_jobs?on_conflict=update_id&select=update_id', 'POST', {
    update_id: update.update_id, chat_id: update.message.chat.id,
    telegram_id: update.message.from?.id || 0, payload: update,
  }, 'resolution=ignore-duplicates,return=representation');
  if (inserted?.length) {
    const waiting = await database(`sb_bot_jobs?update_id=lt.${update.update_id}&status=in.(pending,processing)&select=telegram_id&limit=2`);
    if (waiting.length >= 2 || waiting.some(job => job.telegram_id === update.message.from?.id)) {
      await sendMessage(update.message.chat.id, 'Te he leído. Tu mensaje está en cola; lo atenderé cuando termine el trabajo que está en curso.').catch(() => {});
    }
  }
}
export async function processJob(job, lease, handler = handleUpdate, notify = sendMessage) {
  const path = `sb_bot_jobs?update_id=eq.${job.update_id}&lease=eq.${lease}`;
  const heartbeat = setInterval(() => database(path, 'PATCH', { lease_until: new Date(Date.now() + 120_000).toISOString() }).catch(() => console.error('[queue] lease refresh failed')), 30_000);
  try {
    if (job.recovered) {
      // Never replay an interrupted image/publish operation whose external outcome is uncertain.
      await database(path, 'PATCH', { status: 'interrupted', payload: null, lease: null, lease_until: null, updated_at: new Date().toISOString() });
      await notify(job.chat_id, 'El servicio se reinició mientras atendía tu mensaje. No puedo confirmar que ese encargo terminase y no lo repetiré automáticamente. Tu conversación está guardada; revisa lo recibido y dime si quieres retomarlo.');
    } else {
      await handler(job.payload);
      await database(path, 'PATCH', { status: 'done', payload: null, lease: null, lease_until: null, updated_at: new Date().toISOString() });
    }
  } finally { clearInterval(heartbeat); }
}
export async function pumpJobs() {
  if (pumping || stopped) return;
  pumping = true;
  try {
    while (!stopped && active < 2) {
      const lease = randomUUID();
      const job = await database('rpc/sb_claim_bot_job', 'POST', { p_lease: lease });
      if (!job) break;
      active++;
      void processJob(job, lease).catch(() => console.error('[queue] job interrupted')).finally(() => { active--; void pumpJobs(); });
    }
  } catch { console.error('[queue] store unavailable'); }
  finally { pumping = false; }
}
export function startJobWorker() { stopped = false; void pumpJobs(); timer = setInterval(pumpJobs, 2000); }
export function stopJobWorker() { stopped = true; clearInterval(timer); }
