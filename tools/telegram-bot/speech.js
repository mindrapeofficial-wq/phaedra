import { sendMessage, sendVoice } from './telegram.js';
import { meterTokens } from './usage.js';

// OpenAI shuts this model down on 2027-01-06; its replacement needs the Realtime API.
export const SPEECH_MODEL = 'gpt-4o-mini-tts';
const MAX_SPOKEN_CHARS = 900;
const URL_PATTERN = /https?:\/\/\S+/g;
export const VOICE_DISCLOSURE = '🍌 Voz generada por IA';

export function spokenText(text) {
  const clean = String(text).replace(URL_PATTERN, 'el enlace que te dejo por escrito').replace(/[*_`#]/g, '').trim();
  return clean.length <= MAX_SPOKEN_CHARS ? clean : null;
}

async function synthesize(input) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', signal: AbortSignal.timeout(45_000),
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: SPEECH_MODEL, voice: 'coral', input, response_format: 'opus', instructions: 'Habla en español con tono cercano y natural.' }),
  });
  if (!response.ok) throw new Error(`Speech failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// Text is the fallback, so a failed voice note never loses the answer.
export async function sendVoiceReply(chatId, text) {
  const input = spokenText(text);
  if (!input) return sendMessage(chatId, text);
  let voiceSent = false;
  try {
    await sendVoice(chatId, await synthesize(input), VOICE_DISCLOSURE);
    voiceSent = true;
    meterTokens(SPEECH_MODEL, { input_tokens: input.length });
  } catch { console.error('[voice] reply fell back to text'); }
  if (!voiceSent || URL_PATTERN.test(text)) { URL_PATTERN.lastIndex = 0; await sendMessage(chatId, text); }
}
