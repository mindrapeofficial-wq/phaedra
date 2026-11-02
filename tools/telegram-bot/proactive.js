import { sendMessage } from "./telegram.js";
import { askClaude } from "./ai.js";
import { memoryRequest } from "./memory.js";
import * as pz from "./postzen.js";

const GROUP_CHAT = process.env.TELEGRAM_GROUP_CHAT_ID || "-1004319265595";
let timer, starting, running = false;

export async function runProactiveTick() {
  if (running) return;
  running = true;
  try {
    const hour = Number(new Intl.DateTimeFormat("en", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Madrid" }).format(new Date()));
    if (hour < 9 || hour >= 22) return;
    // A separate service record contains only public account activity and our prior group suggestions.
    const state = await memoryRequest(GROUP_CHAT, 0);
    const posts = (await pz.getRecentPosts(5)).data || [];
    const interactions = [];
    for (const post of posts) {
      const comments = (await pz.getPostComments(post._id)).data || [];
      for (const comment of comments) interactions.push({ id: comment._id, author: comment.author?.username || comment.author?.name, text: (comment.text || "").slice(0, 500), postId: post._id });
    }
    const seen = new Set(state.seenComments || []);
    const fresh = interactions.filter(c => c.id && !seen.has(c.id));
    const snapshot = posts.map(p => ({ id: p._id, text: (p.content || "").slice(0, 200), analytics: p.analytics }));
    const changed = JSON.stringify(snapshot) !== state.snapshot;
    // Baseline after first install: don't dump old activity into the group.
    if (!state.initialized) {
      state.initialized = true;
    } else if (fresh.length || (changed && Date.now() - (state.lastSent || 0) > 6 * 3600_000)) {
      const result = await askClaude(
        "Write one natural Spanish message to our creator group, as an attentive creative teammate. Use ONLY supplied public account evidence. Explain one useful observation and one specific next step. If a named commenter is worth talking to, explain why using their actual comment. Don't claim to have researched their profile or the whole network. No generic reminders, repeated content ideas, report headings, HTML or Markdown formatting. Don't disclose DMs or private user profiles. Don't repeat prior suggestions. If there is no useful new insight, return exactly SKIP. Max 100 words. Instagram copy, if any, must be English. Never imply you posted or contacted anyone.",
        JSON.stringify({ newPublicComments: fresh, posts: snapshot, previousSuggestions: state.suggestions || [] })
      );
      if (!result.error && result.response?.trim() !== "SKIP") {
        const message = result.response.replace(/\*\*/g, "").trim();
        await sendMessage(GROUP_CHAT, message);
        state.lastSent = Date.now();
        state.suggestions = [...(state.suggestions || []), message].slice(-12);
      }
    }
    state.snapshot = JSON.stringify(snapshot);
    state.seenComments = [...new Set([...(state.seenComments || []), ...interactions.map(c => c.id).filter(Boolean)])].slice(-1000);
    await memoryRequest(GROUP_CHAT, 0, "POST", state);
  } catch (e) { console.error("[proactive] check failed", e.name); }
  finally { running = false; }
}

export function startProactiveLoop() {
  if (timer || starting) return;
  starting = setTimeout(() => {
    starting = null;
    void runProactiveTick();
    timer = setInterval(runProactiveTick, 30 * 60_000);
  }, 120_000);
}
export function stopProactiveLoop() {
  clearTimeout(starting); clearInterval(timer);
  starting = timer = null;
}
