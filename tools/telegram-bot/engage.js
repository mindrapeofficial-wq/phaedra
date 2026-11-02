/**
 * Auto-engagement module — Playwright-based Instagram commenter.
 * Navigates to target accounts' reels, generates comments via Claude,
 * and posts them with human-like randomization.
 */

import { askClaude } from "./ai.js";
import { sendMessage } from "./telegram.js";

const OWNER_CHAT = process.env.TELEGRAM_OWNER_ID || "1661812916";
const GROUP_CHAT = process.env.TELEGRAM_GROUP_CHAT_ID || "-1004319265595";
const REPORT_CHAT = GROUP_CHAT;

// Target accounts — music production niche, rotated each session
const TARGET_POOLS = [
  // Reach accounts (bigger, comment early for visibility)
  "output", "spliceapp", "izotopeaudio", "ablofficialapp", "native_instruments",
  "waves_audio", "image.line", "fl_studio", "steinbergmedia", "reabornemusic",
  // Peer accounts (similar size, reciprocal engagement)
  "ardabornemusic", "audaciousmusic", "linuxmusicians", "opensourcemusic",
  "bedroomproducers", "indieproducertips", "homestudiosetup",
  // Producer/creator accounts
  "producergrind", "musicproducerlife", "beatmakerlife", "sounddesignorg",
  "synthmania", "samplegod", "drumbroker", "loopmasters",
];

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickTargets(pool, count) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Human-like delay between 45-120 seconds
function humanDelay() {
  return sleep(random(45000, 120000));
}

// Short scroll/browse delay
function browseDelay() {
  return sleep(random(3000, 8000));
}

async function generateComment(accountName, reelDescription) {
  const result = await askClaude(
    `Generate ONE single comment (in English) for a reel by @${accountName}. The reel is about: ${reelDescription}.
Rules:
- Minimum 10 words
- Ask a genuine question about their content
- Never mention Phaedra, DAWs, or anything promotional
- Sound like a real person, not a brand
- Be specific to what you see described
- No emojis or very few (max 1)
- Just output the comment text, nothing else`,
    ""
  );
  return result.response || result.error || null;
}

export async function runEngagementSession() {
  let browser, context, page;

  try {
    // Dynamic import — Playwright may not be installed in all environments
    const pw = await import("playwright");

    const shouldSkip = Math.random() < 0.15; // 15% chance to skip (no pattern)
    if (shouldSkip) {
      console.log("[engage] Skipping this session (random skip)");
      await notify("🍌 Sesión de engagement saltada (patrón aleatorio)");
      return { skipped: true };
    }

    const commentCount = random(3, 8);
    const targets = pickTargets(TARGET_POOLS, commentCount);

    console.log(`[engage] Starting session: ${commentCount} targets: ${targets.join(", ")}`);
    await notify(`🍌 Empezando engagement: ${commentCount} cuentas`);

    browser = await pw.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    // Load saved session if available
    const storagePath = process.env.IG_SESSION_PATH || "./ig-session.json";
    try {
      context = await browser.newContext({
        storageState: storagePath,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 900 },
        locale: "en-US",
      });
    } catch {
      console.error("[engage] No saved session, need manual login first");
      await notify("⚠️ No hay sesión de Instagram guardada. Necesito login manual primero.");
      await browser.close();
      return { error: "no_session" };
    }

    page = await context.newPage();

    // Check if logged in
    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded" });
    await sleep(3000);
    const loginButton = await page.$('a[href="/accounts/login/"]');
    if (loginButton) {
      console.error("[engage] Session expired, not logged in");
      await notify("⚠️ La sesión de Instagram expiró. Necesito re-login.");
      await browser.close();
      return { error: "session_expired" };
    }

    const results = [];

    for (let i = 0; i < targets.length; i++) {
      const account = targets[i];
      console.log(`[engage] ${i + 1}/${targets.length} Visiting @${account}`);

      try {
        // Navigate to account's reels tab
        await page.goto(`https://www.instagram.com/${account}/reels/`, {
          waitUntil: "domcontentloaded",
        });
        await browseDelay();

        // Find the first reel link
        const reelLink = await page.$('a[href*="/reel/"]');
        if (!reelLink) {
          console.log(`[engage] No reels found for @${account}`);
          results.push({ account, status: "no_reels" });
          continue;
        }

        // Click on the first reel
        await reelLink.click();
        await sleep(random(2000, 4000));

        // Try to get reel description/caption
        const caption = await page
          .$eval('div[class*="Caption"] span, span[class*="caption"], h1 + div span', (el) => el.textContent?.trim())
          .catch(() => "music production content");

        const reelDesc = (caption || "").slice(0, 200) || "music production content";

        // Generate a comment via Claude
        const comment = await generateComment(account, reelDesc);
        if (!comment || comment.includes("error")) {
          console.log(`[engage] Failed to generate comment for @${account}`);
          results.push({ account, status: "comment_gen_failed" });
          await humanDelay();
          continue;
        }

        // Find and click the comment input
        const commentInput = await page.$(
          'textarea[aria-label*="comment" i], textarea[placeholder*="comment" i], textarea[aria-label*="comentario" i]'
        );
        if (!commentInput) {
          console.log(`[engage] No comment input found for @${account}`);
          results.push({ account, status: "no_comment_input" });
          await humanDelay();
          continue;
        }

        await commentInput.click();
        await sleep(random(500, 1500));

        // Type comment character by character (human-like)
        for (const char of comment) {
          await page.keyboard.type(char, { delay: random(30, 80) });
        }
        await sleep(random(1000, 2500));

        // Submit
        const postButton = await page.$(
          'button:has-text("Post"), button:has-text("Publicar"), div[role="button"]:has-text("Post")'
        );
        if (postButton) {
          await postButton.click();
          await sleep(random(2000, 4000));
          console.log(`[engage] Commented on @${account}: ${comment.slice(0, 50)}...`);
          results.push({ account, status: "commented", comment: comment.slice(0, 80) });
        } else {
          // Try pressing Enter as fallback
          await page.keyboard.press("Enter");
          await sleep(random(2000, 4000));
          console.log(`[engage] Commented (Enter) on @${account}: ${comment.slice(0, 50)}...`);
          results.push({ account, status: "commented", comment: comment.slice(0, 80) });
        }
      } catch (e) {
        console.error(`[engage] Error with @${account}:`, e.message);
        results.push({ account, status: "error", error: e.message });
      }

      // Human delay between accounts (skip after last one)
      if (i < targets.length - 1) {
        await humanDelay();
      }
    }

    // Save session state for next time
    try {
      await context.storageState({ path: storagePath });
    } catch (e) {
      console.error("[engage] Failed to save session:", e.message);
    }

    await browser.close();

    // Report results
    const commented = results.filter((r) => r.status === "commented");
    const report = `🍌 Engagement completado:
${commented.length}/${targets.length} comentarios publicados

${results.map((r) => `• @${r.account}: ${r.status}${r.comment ? ` — "${r.comment}"` : ""}`).join("\n")}`;

    await notify(report);
    console.log("[engage] Session complete:", JSON.stringify(results));
    return { results };
  } catch (e) {
    console.error("[engage] Session error:", e);
    await notify(`⚠️ Error en engagement: ${e.message}`);
    if (browser) await browser.close().catch(() => {});
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

// Export askClaude so it can be imported from ai.js
export { generateComment };
