const timedFetch = (url, options = {}) => fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(20_000) });
const BASE = "https://api.postzen.dev/v1";
const ACCOUNT_ID = process.env.POSTZEN_ACCOUNT_ID || "j9728s2139w1qrqdte0fynrjf98hbg4j";

function headers() {
  return {
    Authorization: `Bearer ${process.env.POSTZEN_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function get(path) {
  const res = await timedFetch(`${BASE}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`PostZen ${res.status}: ${await res.text()}`);
  return res.json();
}

async function post(path, body) {
  const res = await timedFetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PostZen ${res.status}: ${await res.text()}`);
  return res.json();
}

async function patch(path, body) {
  const res = await timedFetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PostZen ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- Posts ---

export async function getRecentPosts(limit = 5) {
  return get(`/posts?platform=instagram&accountId=${ACCOUNT_ID}&status=published&sortBy=createdAt&limit=${limit}`);
}

export async function getScheduledPosts() {
  return get(`/posts?platform=instagram&accountId=${ACCOUNT_ID}&status=scheduled&sortBy=scheduledFor`);
}

export async function getDraftPosts() {
  return get(`/posts?platform=instagram&accountId=${ACCOUNT_ID}&status=draft&sortBy=createdAt&limit=10`);
}

export async function createDraftPost(content, postType = "post") {
  return post("/posts", {
    accountIds: [ACCOUNT_ID],
    platform: "instagram",
    content,
    postType,
    status: "draft",
  });
}

export async function updatePost(postId, updates) {
  return patch(`/posts/${postId}`, updates);
}

export async function deletePost(postId) {
  const res = await timedFetch(`${BASE}/posts/${postId}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) throw new Error(`PostZen delete ${res.status}`);
  return { ok: true };
}

// --- Inbox: Comments ---

export async function getPostComments(postId) {
  return get(`/inbox/posts/${postId}/comments`);
}

export async function replyToComment(postId, commentId, text) {
  return post(`/inbox/posts/${postId}/reply`, { commentId, text });
}

// --- Inbox: DMs ---

export async function getOpenConversations() {
  return get(`/inbox/conversations?accountId=${ACCOUNT_ID}&status=active`);
}

export async function getConversationMessages(conversationId) {
  return get(`/inbox/conversations/${conversationId}/messages`);
}

export async function sendDM(conversationId, text) {
  return post(`/inbox/conversations/${conversationId}/messages`, { text });
}

// --- Analytics ---

export async function getAnalytics(days = 30) {
  const now = new Date();
  const from = new Date(now - days * 86400000);
  const fmt = (d) => d.toISOString().split("T")[0];
  return get(`/analytics?platform=instagram&accountId=${ACCOUNT_ID}&source=all&sortBy=engagement&fromDate=${fmt(from)}&toDate=${fmt(now)}&limit=10`);
}

export async function getBestTimeToPost() {
  return get(`/best-time-to-post?platform=instagram&accountId=${ACCOUNT_ID}`);
}

export async function getFollowerStats(days = 30) {
  const now = new Date();
  const from = new Date(now - days * 86400000);
  const fmt = (d) => d.toISOString().split("T")[0];
  return get(`/analytics/followers?accountIds=${ACCOUNT_ID}&fromDate=${fmt(from)}&toDate=${fmt(now)}`);
}

// --- Comment Automations ---

export async function listCommentAutomations() {
  return get(`/comment-automations?accountId=${ACCOUNT_ID}`);
}

// --- Sync ---

export async function syncExternalPosts() {
  return post(`/posts/sync`, { accountId: ACCOUNT_ID });
}

// --- Profiles & Queue ---

export async function listProfiles() {
  return get(`/profiles?accountId=${ACCOUNT_ID}`);
}

export async function listQueueSlots(profileId) {
  return get(`/profiles/${profileId}/queue-slots?all=true`);
}

// --- Gather Status (comprehensive) ---

export async function gatherStatus() {
  const results = {};
  try {
    const posts = await getRecentPosts(5);
    results.recentPosts = (posts.data || []).map((p) => ({
      id: p._id,
      content: (p.content || "").slice(0, 80),
      publishedAt: p.publishedAt,
      likes: p.analytics?.likes || 0,
      comments: p.analytics?.comments || 0,
      views: p.analytics?.views || 0,
    }));
  } catch (e) {
    results.recentPostsError = e.message;
  }

  try {
    const sched = await getScheduledPosts();
    results.scheduledCount = (sched.data || []).length;
    results.nextScheduled = (sched.data || [])[0]?.scheduledFor || null;
  } catch (e) {
    results.scheduledError = e.message;
  }

  try {
    const drafts = await getDraftPosts();
    results.draftCount = (drafts.data || []).length;
  } catch (e) {
    results.draftsError = e.message;
  }

  try {
    const convos = await getOpenConversations();
    results.openDMs = (convos.data || []).length;
  } catch (e) {
    results.dmsError = e.message;
  }

  try {
    const analytics = await getAnalytics();
    results.topPosts = (analytics.data || []).slice(0, 5).map((p) => ({
      content: (p.content || "").slice(0, 60),
      views: p.analytics?.views || 0,
      likes: p.analytics?.likes || 0,
      engagement: p.analytics?.engagementRate || 0,
    }));
  } catch (e) {
    results.analyticsError = e.message;
  }

  return results;
}
