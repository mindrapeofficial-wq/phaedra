const BASE = "https://api.postzen.dev/v1";
const ACCOUNT_ID = process.env.POSTZEN_ACCOUNT_ID || "j9728s2139w1qrqdte0fynrjf98hbg4j";

function headers() {
  return {
    Authorization: `Bearer ${process.env.POSTZEN_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`PostZen ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getRecentPosts(limit = 5) {
  return get(`/posts?platform=instagram&accountId=${ACCOUNT_ID}&status=published&sortBy=createdAt&limit=${limit}`);
}

export async function getScheduledPosts() {
  return get(`/posts?platform=instagram&accountId=${ACCOUNT_ID}&status=scheduled&sortBy=scheduledFor`);
}

export async function getPostComments(postId) {
  return get(`/inbox/posts/${postId}/comments`);
}

export async function getOpenConversations() {
  return get(`/inbox/conversations?accountId=${ACCOUNT_ID}&status=open`);
}

export async function getAnalytics() {
  const now = new Date();
  const from = new Date(now - 30 * 86400000);
  const fmt = (d) => d.toISOString().split("T")[0];
  return get(`/analytics?platform=instagram&accountId=${ACCOUNT_ID}&source=all&sortBy=engagement&fromDate=${fmt(from)}&toDate=${fmt(now)}&limit=10`);
}

export async function replyToComment(postId, commentId, text) {
  const res = await fetch(`${BASE}/inbox/posts/${postId}/reply`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ commentId, text }),
  });
  if (!res.ok) throw new Error(`PostZen reply ${res.status}`);
  return res.json();
}

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
