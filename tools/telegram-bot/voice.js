import { notifyAction } from './usage.js';
import { OggOpusDecoder } from 'ogg-opus-decoder';
import { getFileUrl } from './telegram.js';
export function pcmWav(channelData, sampleRate) {
  if (!channelData.length || !channelData[0].length) throw new Error('El audio no contiene voz legible.');
  const samples = channelData[0].length;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const value = Math.max(-1, Math.min(1, channelData.reduce((sum, ch) => sum + ch[i], 0) / channelData.length));
    wav.writeInt16LE(Math.round(value * (value < 0 ? 32768 : 32767)), 44 + i * 2);
  }
  return wav;
}
export async function transcribeVoice(voice) {
  if (voice.duration > 180 || voice.file_size > 6_000_000) throw new Error('Envíame notas de voz de hasta 3 minutos para poder responder con agilidad.');
  const signal = AbortSignal.timeout(60_000);
  const url = await getFileUrl(voice.file_id);
  if (!url) throw new Error('No pude recuperar la nota de voz.');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('No pude descargar la nota de voz.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 6_000_000) throw new Error('La nota de voz es demasiado grande.');
  const decoder = new OggOpusDecoder();
  let wav;
  try { await decoder.ready; const decoded = await decoder.decodeFile(bytes); wav = pcmWav(decoded.channelData, decoded.sampleRate); }
  finally { decoder.free(); }
  if (wav.length > 25_000_000) throw new Error('La nota de voz es demasiado larga.');
  const form = new FormData();
  form.set('model', 'gpt-transcribe'); form.set('file', new Blob([wav], { type: 'audio/wav' }), 'voice.wav');
  const transcription = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', signal, headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
  if (!transcription.ok) throw new Error('No pude transcribir este audio. Puedes escribirlo o volver a enviarlo.');
  notifyAction('voice');
  const text = (await transcription.json()).text?.trim();
  if (!text) throw new Error('No he entendido la nota de voz. ¿Puedes escribirla o repetirla?');
  return text;
}
