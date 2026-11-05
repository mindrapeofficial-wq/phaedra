import { sendMessage, sendVoice } from './telegram.js';
import { meterTokens } from './usage.js';

// OpenAI shuts this model down on 2027-01-06; its replacement needs the Realtime API.
export const SPEECH_MODEL = 'gpt-4o-mini-tts';
const MAX_SPOKEN_CHARS = 900;
const URL_PATTERN = /https?:\/\/\S+/g;
export const VOICE_DISCLOSURE = '🍌 Te respondo con una voz generada por IA.';

export function spokenText(text) {
  const clean = String(text).replace(URL_PATTERN, 'el enlace que te dejo por escrito').replace(/[*_`#]/g, '').trim();
  return clean.length <= MAX_SPOKEN_CHARS ? clean : null;
}

const BANANA_VOICE_ID = process.env.BANANA_VOICE_ID || 'SZXOlCpjEUCaedG9kg4Y';
const ELEVEN_SPEECH_MODEL = 'eleven_multilingual_v2';

async function synthesizeWithElevenLabs(input) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${BANANA_VOICE_ID}?output_format=opus_48000_64`, {
    method: 'POST', signal: AbortSignal.timeout(45_000),
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: input, model_id: ELEVEN_SPEECH_MODEL, language_code: 'es' }),
  });
  if (!response.ok) throw new Error(`ElevenLabs speech failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function synthesizeWithOpenAi(input) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', signal: AbortSignal.timeout(45_000),
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: SPEECH_MODEL, voice: 'coral', input, response_format: 'opus', instructions: 'Habla en español con tono cercano y natural.' }),
  });
  if (!response.ok) throw new Error(`Speech failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function synthesize(input) {
  if (process.env.ELEVENLABS_API_KEY) {
    try { return { audio: await synthesizeWithElevenLabs(input), model: ELEVEN_SPEECH_MODEL }; }
    catch { console.error('[voice] ElevenLabs failed, using OpenAI voice'); }
  }
  return { audio: await synthesizeWithOpenAi(input), model: SPEECH_MODEL };
}

// Text is the fallback, so a failed voice note never loses the answer.
export async function sendVoiceReply(chatId, text, { disclose = false } = {}) {
  const input = spokenText(text);
  if (!input) { await sendMessage(chatId, text); return false; }
  let voiceSent = false;
  try {
    const { audio, model } = await synthesize(input);
    await sendVoice(chatId, audio, disclose ? VOICE_DISCLOSURE : '');
    voiceSent = true;
    meterTokens(model, { input_tokens: input.length });
  } catch { console.error('[voice] reply fell back to text'); }
  if (!voiceSent || URL_PATTERN.test(text)) { URL_PATTERN.lastIndex = 0; await sendMessage(chatId, text); }
  return voiceSent;
}
