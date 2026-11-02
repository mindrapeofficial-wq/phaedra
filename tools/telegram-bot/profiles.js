import { database } from './database.js';
export async function privateProfile(userId) {
  const rows = await database(`sb_creator_profiles?telegram_id=eq.${Number(userId)}&select=facts`);
  return rows[0]?.facts || {};
}
export async function saveProfileChanges(userId, before, after) {
  const facts = Object.fromEntries(Object.entries(after || {}).filter(([key,value]) => !['telegramName','welcomedAt'].includes(key) && value !== before?.[key]));
  if (Object.keys(facts).length) await database('rpc/sb_merge_creator_profile','POST',{p_user:userId,p_facts:facts});
}
export async function forgetCreativeMemory(userId) {
  await database(`sb_bot_memory?telegram_id=eq.${Number(userId)}`,'DELETE');
  await database(`sb_creator_profiles?telegram_id=eq.${Number(userId)}`,'DELETE');
}
