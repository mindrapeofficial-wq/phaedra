import { sendMessage } from './telegram.js';
import { memoryRequest } from './memory.js';

const GROUP_CHAT = process.env.TELEGRAM_GROUP_CHAT_ID || '-1004319265595';
const OWNER = Number(process.env.TELEGRAM_OWNER_ID || 1661812916);

export async function congratulateInstagramConnection(chatId, from) {
  if (!from?.id || Number(from.id) === OWNER) return false;
  const state = await memoryRequest(chatId, from.id);
  if (state.instagramCongratulated) return false;
  const name = from.first_name || (from.username ? `@${from.username}` : 'una artista de la comunidad');
  await sendMessage(GROUP_CHAT, `🎉 ¡Enhorabuena, ${name}! Ya ha conectado su Instagram a Emil. A por ese siguiente lanzamiento 🍌`);
  await memoryRequest(chatId, from.id, 'POST', { ...state, instagramCongratulated: true });
  return true;
}
