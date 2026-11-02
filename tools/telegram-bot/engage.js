/**
 * Auto-engagement module — generates ready-to-paste comments via Claude
 * and sends them to Telegram with direct links to target accounts' reels.
 * No browser needed.
 */

import { askClaude } from "./ai.js";
import { sendMessage } from "./telegram.js";

const GROUP_CHAT = process.env.TELEGRAM_GROUP_CHAT_ID || "-1004319265595";
const OWNER_CHAT = process.env.TELEGRAM_OWNER_ID || "1661812916";
const REPORT_CHAT = OWNER_CHAT;

const TARGET_POOLS = [
  // Reach — bigger accounts, comment early for visibility
  { handle: "output", niche: "sample packs and production tools" },
  { handle: "spliceapp", niche: "samples, plugins, DAW tutorials" },
  { handle: "izotopeaudio", niche: "mixing, mastering, audio repair" },
  { handle: "native_instruments", niche: "synths, samplers, production" },
  { handle: "waves_audio", niche: "mixing plugins and processing" },
  { handle: "fl_studio", niche: "beat making and FL Studio workflows" },
  { handle: "steinbergmedia", niche: "Cubase, recording, MIDI" },
  { handle: "ablofficialapp", niche: "Ableton Live, live performance, sound design" },
  // Peers — similar size, reciprocal engagement
  { handle: "bedroomproducers", niche: "home studio production tips" },
  { handle: "homestudiosetup", niche: "studio gear and acoustic treatment" },
  { handle: "reabornemusic", niche: "Reaper DAW tips and production" },
  // Creators — producers and beatmakers
  { handle: "producergrind", niche: "producer culture and motivation" },
  { handle: "musicproducerlife", niche: "daily producer life and tips" },
  { handle: "beatmakerlife", niche: "beatmaking and hip hop production" },
  { handle: "sounddesignorg", niche: "sound design for film and games" },
  { handle: "synthmania", niche: "synthesizers and sound design" },
  { handle: "loopmasters", niche: "loops, samples, production resources" },
  { handle: "drumbroker", niche: "drum kits and sampling" },
  { handle: "recordingrevolution", niche: "home recording and mixing" },
  { handle: "musicianonamission", niche: "mixing tips for home studios" },
];

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickTargets(pool, count) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export async function runEngagementSession() {
  try {
    const commentCount = random(4, 7);
    const targets = pickTargets(TARGET_POOLS, commentCount);

    console.log(`[engage] Generating comments for ${commentCount} accounts`);

    const prompt = `Generate ${commentCount} unique, engaging comments for Instagram reels. One comment per account listed below.

ACCOUNTS:
${targets.map((t, i) => `${i + 1}. @${t.handle} — their content is about: ${t.niche}`).join("\n")}

RULES:
- Each comment minimum 12 words, maximum 30 words
- Ask a genuine question about their specific content/niche
- Sound like a real music producer, not a brand or AI
- Never mention Phaedra, open-source, DAWs you sell, or anything promotional
- No generic compliments like "great content!" — be specific to their niche
- Maximum 1 emoji per comment, most should have zero
- Use casual English, contractions allowed
- Each comment must be completely different in structure

FORMAT (strictly follow this, one per line):
@handle | comment text here`;

    const result = await askClaude(prompt, "");

    if (result.error) {
      console.error("[engage] Claude failed:", result.error);
      await notify("Error generando comentarios: " + result.error);
      return { error: result.error };
    }

    const lines = result.response
      .split("\n")
      .filter((l) => l.includes("|") && l.includes("@"))
      .map((l) => {
        const [handlePart, ...commentParts] = l.split("|");
        const handle = handlePart.trim().replace("@", "").replace(/^\d+\.\s*/, "");
        const comment = commentParts.join("|").trim();
        return { handle, comment };
      })
      .filter((r) => r.handle && r.comment);

    if (lines.length === 0) {
      console.error("[engage] No comments parsed from Claude response");
      await notify("No pude parsear los comentarios. Respuesta de Claude:\n" + result.response.slice(0, 300));
      return { error: "parse_failed" };
    }

    // Build the Telegram message with links and ready-to-copy comments
    const header = `Ideas de conversación (${lines.length} propuestas sin verificar)

Estas cuentas son una lista de inspiración; no he consultado sus publicaciones recientes. Abre cada enlace, comprueba su contenido y adapta la propuesta solo si encaja:\n`;

    const body = lines
      .map(
        (r, i) =>
          `${i + 1}. <a href="https://www.instagram.com/${r.handle}/reels/">@${r.handle}</a>\n<code>${r.comment}</code>`
      )
      .join("\n\n");

    const footer = "\n\nSi quieres un comentario específico, envíame el contenido de la publicación. No envíes comentarios en serie ni atribuyas acciones que no hemos realizado.";

    await notify(header + body + footer);
    console.log("[engage] Sent", lines.length, "comments to Telegram");

    return { results: lines };
  } catch (e) {
    console.error("[engage] Session error:", e);
    await notify("Error en engagement: " + e.message);
    return { error: e.message };
  }
}

async function notify(text) {
  try {
    await sendMessage(REPORT_CHAT, text);
  } catch (e) {
    console.error("[engage] Notify failed:", e.message);
  }
}
