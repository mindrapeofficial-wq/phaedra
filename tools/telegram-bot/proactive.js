import { sendMessage } from "./telegram.js";
import { askClaude } from "./ai.js";
import { memoryRequest, groupConversationContext } from "./memory.js";
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
    const community = await groupConversationContext(GROUP_CHAT);
    const posts = (await pz.getRecentPosts(5).catch(() => ({ data: [] }))).data || [];
    const interactions = [];
    for (const post of posts) {
      const comments = (await pz.getPostComments(post._id).catch(() => ({ data: [] }))).data || [];
      for (const comment of comments) interactions.push({ id: comment._id, author: comment.author?.username || comment.author?.name, text: (comment.text || "").slice(0, 500), postId: post._id });
    }
    const seen = new Set(state.seenComments || []);
    const fresh = interactions.filter(c => c.id && !seen.has(c.id));
    const snapshot = posts.map(p => ({ id: p._id, text: (p.content || "").slice(0, 200), analytics: p.analytics }));
    const changed = JSON.stringify(snapshot) !== state.snapshot;
    // Baseline after first install: don't dump old activity into the group.
    if (!state.initialized) {
      state.initialized = true;
    } else if ((fresh.length || changed || community.length) && Date.now() - (state.lastSent || 0) > 90 * 60_000
      && community.every(person => Date.now() - Date.parse(person.updated_at) > 8 * 60_000)) {
      const result = await askClaude(
        "Write one natural Spanish message to our creator group as an attentive creative manager. Use ONLY supplied public account evidence and conversations that happened IN THIS GROUP. Follow up on a creator's stated goal, celebrate a real step, propose a useful action, or ask ONE relevant question to understand their project/audience/next goal. Address people by supplied name when relevant. Never pressure, guilt, or insist after a declined question. No generic reminders, repeated ideas, report headings, HTML or Markdown. Don't ask for private physical details in the group, disclose private profiles or DMs, invent metrics, or pretend you researched profiles/the entire network. Explain the evidence behind any networking recommendation. Don't repeat prior suggestions; return exactly SKIP if nothing useful can be added. Max 80 words. Instagram copy in English. Never imply an external action was executed.",
        JSON.stringify({ community, newPublicComments: fresh, posts: snapshot, previousSuggestions: state.suggestions || [] })
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
