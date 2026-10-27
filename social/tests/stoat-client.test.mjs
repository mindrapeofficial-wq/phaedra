import test from "node:test";
import assert from "node:assert/strict";
import { StoatClient } from "../src/stoat-client.js";

const API = "https://chat.example.test/api";
const SELF = { _id: "USER_SELF", username: "producer", relationship: "User" };
const SESSION = { result: "Success", _id: "SESSION_ONE", user_id: SELF._id, token: "test-session-token" };
const CHANNEL = { _id: "CHANNEL_DM", channel_type: "DirectMessage", recipients: [SELF._id, "USER_FRIEND"] };
const CONFIG = { ws: "wss://chat.example.test/ws", app: "https://chat.example.test", features: { autumn: { enabled: true, url: "https://chat.example.test/autumn" } } };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const pause = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function harness({ respond, configuration = CONFIG, options = {} } = {}) {
  const calls = [];
  const sockets = [];
  class FakeSocket {
    readyState = 0;
    sent = [];
    constructor(url) { this.url = url; sockets.push(this); }
    open() { this.readyState = 1; this.onopen?.({}); }
    receive(packet) { this.onmessage?.({ data: JSON.stringify(packet) }); }
    send(payload) { assert.equal(this.readyState, 1); this.sent.push(JSON.parse(payload)); }
    close() { if (this.readyState !== 3) { this.readyState = 3; this.onclose?.({}); } }
  }
  const fetchImpl = async (url, request) => {
    calls.push({ url, request });
    const override = respond?.(url, request, calls);
    if (override !== undefined) return await override;
    const path = new URL(url).pathname;
    if (path === "/api/") return json(configuration);
    if (path === "/api/auth/session/login") return json(SESSION);
    if (path === "/api/auth/session/logout") return new Response(null, { status: 204 });
    if (path === "/api/onboard/hello") return json({ onboarding: false });
    if (path === "/api/users/@me") return json(SELF);
    if (path === "/api/users/USER_FRIEND/dm") return json(CHANNEL);
    if (path === "/api/channels/CHANNEL_DM/messages" && request.method === "POST") {
      return json({ _id: "MESSAGE_ONE", channel: CHANNEL._id, author: SELF._id, ...JSON.parse(request.body) });
    }
    if (path === "/api/channels/CHANNEL_DM/messages") return json({
      messages: [{ _id: "MESSAGE_2", channel: CHANNEL._id }, { _id: "MESSAGE_1", channel: CHANNEL._id }],
      users: [{ _id: "USER_FRIEND", username: "collaborator" }],
    });
    if (path.endsWith("/attachments")) return json({ id: "ATTACHMENT_ONE" });
    throw new Error(`Unexpected test route: ${path}`);
  };
  const client = new StoatClient({ fetchImpl, WebSocketImpl: FakeSocket, requestTimeoutMs: 1000, heartbeatMs: 100000, ...options });
  const states = [];
  client.addEventListener("state", ({ detail }) => states.push(detail));
  async function waitSocket(count = 1) {
    for (let i = 0; i < 50 && sockets.length < count; i++) await pause(1);
    assert.equal(sockets.length, count, "the client should open the expected socket");
    return sockets[count - 1];
  }
  function ready(socket, extra = {}) {
    socket.open();
    socket.receive({ type: "Authenticated" });
    socket.receive({ type: "Ready", users: [SELF], channels: [CHANNEL], servers: [], ...extra });
  }
  async function connect() {
    const connecting = client.connect({ apiUrl: API, email: "producer@example.test", password: "test-password" });
    const socket = await waitSocket();
    ready(socket);
    await connecting;
    return socket;
  }
  return { client, calls, sockets, states, waitSocket, ready, connect };
}

test("real login contract, token in headers and Authenticate frame only, Ready maps and live presence", async (t) => {
  const h = harness(); t.after(() => h.client.disconnect());
  const socket = await h.connect();
  assert.equal(h.client.status, "online");
  assert.equal(h.client.currentUser._id, SELF._id);
  assert.equal(h.client.channels.get(CHANNEL._id).channel_type, "DirectMessage");
  assert.deepEqual(socket.sent[0], { type: "Authenticate", token: SESSION.token });
  assert.equal(new URL(socket.url).searchParams.get("token"), null);
  assert.equal(new URL(socket.url).searchParams.get("version"), "1");
  assert.ok(!JSON.stringify(h.client).includes(SESSION.token), "public client state must not serialize credentials");
  for (const { url, request } of h.calls) {
    assert.ok(!url.includes(SESSION.token));
    assert.equal(request.redirect, "error");
    assert.equal(request.credentials, "omit");
  }
  const login = h.calls.find(({ url }) => url.endsWith("/auth/session/login"));
  assert.equal(login.request.headers["X-Session-Token"], undefined);
  assert.equal(JSON.parse(login.request.body).friendly_name, "Phaedra Social");
  assert.equal(h.calls.find(({ url }) => url.endsWith("/users/@me")).request.headers["X-Session-Token"], SESSION.token);
  let incoming;
  h.client.addEventListener("message", ({ detail }) => { incoming = detail; });
  socket.receive({ type: "Message", _id: "MESSAGE_LIVE", channel: CHANNEL._id, author: "USER_FRIEND", content: "Escucha el bajo" });
  assert.equal(incoming.content, "Escucha el bajo");
  socket.receive({ type: "UserPresence", id: "USER_FRIEND", online: true });
  assert.equal(h.client.users.get("USER_FRIEND").online, true);
});

test("history populates users, sends exactly one idempotent message and opens a real DM", async (t) => {
  const h = harness(); t.after(() => h.client.disconnect()); await h.connect();
  const messages = await h.client.getMessages(CHANNEL._id);
  assert.deepEqual(messages.map(({ _id }) => _id), ["MESSAGE_1", "MESSAGE_2"]);
  assert.equal(h.client.users.get("USER_FRIEND").username, "collaborator");
  assert.ok(h.calls.some(({ url }) => url.includes("include_users=true")));
  const message = await h.client.sendMessage(CHANNEL._id, { content: "Mi nueva mezcla", attachments: ["ATTACHMENT_ONE"] });
  assert.deepEqual(message.attachments, ["ATTACHMENT_ONE"]);
  const sends = h.calls.filter(({ request, url }) => request.method === "POST" && url.endsWith("/messages"));
  assert.equal(sends.length, 1);
  assert.match(sends[0].request.headers["Idempotency-Key"], /^[0-9a-f-]{36}$/);
  assert.equal((await h.client.openDirectMessage("USER_FRIEND"))._id, CHANNEL._id);
});

test("rejects untrusted discovery services before sending a password or token", async () => {
  for (const configuration of [
    { ...CONFIG, ws: "wss://unexpected.example.test/ws" },
    { ...CONFIG, features: { autumn: { enabled: true, url: "https://unexpected.example.test/autumn" } } },
  ]) {
    const h = harness({ configuration });
    await assert.rejects(h.client.connect({ apiUrl: API, email: "producer@example.test", password: "test-password" }), { code: "UNTRUSTED_SERVICE" });
    assert.equal(h.calls.length, 1);
    assert.equal(h.sockets.length, 0);
    assert.equal(h.client.status, "error");
  }
});

test("explicit allowed origin permits Autumn uploads without exposing token in file URL", async (t) => {
  const h = harness({ configuration: { ...CONFIG, features: { autumn: { enabled: true, url: "https://files.example.test/autumn" } } },
    options: { allowedServiceOrigins: ["https://files.example.test"] } });
  t.after(() => h.client.disconnect()); await h.connect();
  const file = new File([new Uint8Array([82, 73, 70, 70])], "demo.wav", { type: "audio/wav" });
  assert.equal(await h.client.uploadFile(file), "ATTACHMENT_ONE");
  const upload = h.calls.find(({ url }) => url.endsWith("/attachments"));
  assert.equal(upload.url, "https://files.example.test/autumn/attachments");
  assert.equal(upload.request.headers["X-Session-Token"], SESSION.token);
  assert.equal(upload.request.headers["Content-Type"], undefined, "browser must set multipart boundary");
  assert.equal(upload.request.body.get("file").name, "demo.wav");
  assert.equal(h.client.fileUrl({ _id: "ATTACHMENT_ONE", tag: "attachments", filename: "demo.wav" }), "https://files.example.test/autumn/attachments/ATTACHMENT_ONE/original");
});

test("external HTTP, embedded credentials, query secrets and unsafe IDs never reach fetch", async () => {
  for (const apiUrl of ["http://chat.example.test/api", "https://user:pass@chat.example.test/api", `${API}?token=secret`, `${API}#secret`, "file:///etc/passwd"]) {
    const h = harness();
    await assert.rejects(h.client.resume({ apiUrl, token: "test-session-token" }), { code: "UNSAFE_URL" });
    assert.equal(h.calls.length, 0);
    assert.equal(h.client.status, "error");
  }
  const h = harness();
  await assert.rejects(h.client.openDirectMessage("../secrets"), { code: "INVALID_ID" });
  assert.equal(h.calls.length, 0);
});

test("HTML response does not become a successful connection or leak its contents", async () => {
  const h = harness({ respond: () => new Response("<html>private debug response</html>", { headers: { "content-type": "text/html" } }) });
  await assert.rejects(h.client.connect({ apiUrl: API, email: "a@example.test", password: "test-password" }), (failure) =>
    failure.code === "UNEXPECTED_RESPONSE" && !failure.message.includes("private debug"));
  assert.equal(h.client.status, "error");
  assert.equal(h.sockets.length, 0);
});

test("disconnect cancels an in-flight login and prevents a stale response reconnecting", async () => {
  let finishLogin;
  const h = harness({ respond: (url) => url.endsWith("/auth/session/login") ? new Promise((resolve) => { finishLogin = resolve; }) : undefined });
  const connecting = h.client.connect({ apiUrl: API, email: "a@example.test", password: "test-password" });
  const rejection = assert.rejects(connecting, { code: "CANCELLED" });
  for (let i = 0; !finishLogin && i < 50; i++) await pause(1);
  h.client.disconnect();
  finishLogin(json(SESSION));
  await rejection;
  assert.equal(h.client.status, "offline");
  assert.equal(h.sockets.length, 0);
  await assert.rejects(h.client.getMessages(CHANNEL._id), { code: "NOT_CONNECTED" });
});

test("transient socket loss reconnects with in-memory session and never replays a message", async (t) => {
  const h = harness({ options: { reconnectBaseMs: 1, reconnectMaxMs: 2 } });
  t.after(() => h.client.disconnect());
  const first = await h.connect();
  await h.client.sendMessage(CHANNEL._id, { content: "Una sola vez" });
  first.close();
  assert.equal(h.client.status, "reconnecting");
  const second = await h.waitSocket(2);
  h.ready(second);
  assert.equal(h.client.status, "online");
  assert.deepEqual(second.sent[0], { type: "Authenticate", token: SESSION.token });
  assert.equal(h.calls.filter(({ url }) => url.endsWith("/auth/session/login")).length, 1);
  assert.equal(h.calls.filter(({ url, request }) => url.endsWith("/messages") && request.method === "POST").length, 1);
});

test("revoked session stops reconnect and clears authenticated state", async () => {
  const h = harness({ options: { reconnectBaseMs: 1 } });
  const socket = await h.connect();
  socket.receive({ type: "Error", data: { type: "InvalidSession", message: "do not display raw server text" } });
  await pause(5);
  assert.equal(h.client.status, "error");
  assert.equal(h.client.currentUser, null);
  assert.equal(h.sockets.length, 1);
  assert.equal(h.states.at(-1).error.code, "AUTHENTICATION_FAILED");
  await assert.rejects(h.client.sendMessage(CHANNEL._id, { content: "test" }), { code: "NOT_CONNECTED" });
});

test("ambiguous network failure on send is reported once without an automatic retry", async (t) => {
  const h = harness({ respond: (url, request) => {
    if (url.endsWith("/messages") && request.method === "POST") return Promise.reject(new Error("network failed"));
  } });
  t.after(() => h.client.disconnect()); await h.connect();
  await assert.rejects(h.client.sendMessage(CHANNEL._id, { content: "Quizá entregado" }), { code: "SEND_UNCONFIRMED" });
  assert.equal(h.calls.filter(({ url, request }) => url.endsWith("/messages") && request.method === "POST").length, 1);
});

test("timeouts abort requests, and incomplete account setup is surfaced explicitly", async () => {
  const timeoutHarness = harness({ options: { requestTimeoutMs: 5 }, respond: (_url, request) => new Promise((_, reject) => {
    request.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }) });
  const timeoutCheck = assert.rejects(timeoutHarness.client.resume({ apiUrl: API, token: SESSION.token }), { code: "TIMEOUT" });
  await pause(15); await timeoutCheck;
  const onboardHarness = harness({ respond: (url) => url.endsWith("/onboard/hello") ? json({ onboarding: true }) : undefined });
  await assert.rejects(onboardHarness.client.connect({ apiUrl: API, email: "a@example.test", password: "test-password" }), { code: "ONBOARDING_REQUIRED" });
  assert.equal(onboardHarness.sockets.length, 0);
  assert.equal(onboardHarness.client.registrationUrl, "https://chat.example.test");
});

test("logout revokes backend session then removes all local credentials and sockets", async () => {
  const h = harness(); const socket = await h.connect();
  await h.client.logout();
  const request = h.calls.find(({ url }) => url.endsWith("/auth/session/logout")).request;
  assert.equal(request.method, "POST");
  assert.equal(request.headers["X-Session-Token"], SESSION.token);
  assert.equal(h.client.status, "offline");
  assert.equal(h.client.currentUser, null);
  assert.equal(socket.readyState, 3);
  assert.equal(h.client.channels.size, 0);
  await assert.rejects(h.client.getMessages(CHANNEL._id), { code: "NOT_CONNECTED" });
});

test("timeout also covers a response that stalls while reading its JSON body", async () => {
  const h = harness({ options: { requestTimeoutMs: 5 }, respond: (_url, request) => ({
    status: 200, ok: true, headers: new Headers({ "content-type": "application/json" }),
    json: () => new Promise((_, reject) => request.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })),
  }) });
  const rejected = assert.rejects(h.client.resume({ apiUrl: API, token: SESSION.token }), { code: "TIMEOUT" });
  await pause(15); await rejected;
  assert.equal(h.client.status, "error");
});

test("disconnect settles a connection waiting for Ready and cancels future reconnection", async () => {
  const h = harness({ options: { reconnectBaseMs: 1 } });
  const connecting = h.client.resume({ apiUrl: API, token: SESSION.token });
  const rejection = assert.rejects(connecting, { code: "CANCELLED" });
  const socket = await h.waitSocket(); socket.open();
  h.client.disconnect();
  await rejection; await pause(5);
  assert.equal(h.sockets.length, 1);
  assert.equal(h.client.status, "offline");
});
