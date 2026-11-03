import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { enqueueUpdate, startJobWorker, stopJobWorker, pumpJobs } from "./jobs.js";
import { handleStripeWebhook } from "./stripe.js";
import { runEngagementSession } from "./engage.js";
import { startProactiveLoop, stopProactiveLoop } from "./proactive.js";
import { startReminderLoop, stopReminderLoop } from "./releases.js";
import { memoryRequest } from "./memory.js";
import { webhookRegistration } from "./webhook-config.js";

const PORT = process.env.PORT || 3000;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || createHash("sha256").update(`social-banana-webhook:${process.env.TELEGRAM_BOT_TOKEN}`).digest("hex");

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/webhook") {
    const received = Buffer.from(String(req.headers["x-telegram-bot-api-secret-token"] || ""));
    const expected = Buffer.from(webhookSecret);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      res.writeHead(401); res.end("unauthorized"); return;
    }
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 1_000_000) { res.writeHead(413); res.end("payload too large"); return; }
    }
    try {
      const update = JSON.parse(body);
      console.log("[webhook] update received", { chat: update.message?.chat?.id, type: update.message?.chat?.type, hasMessage: Boolean(update.message) });
      await enqueueUpdate(update);
      res.writeHead(200);
      res.end("ok");
      void pumpJobs();
    } catch (error) {
      res.writeHead(error instanceof SyntaxError ? 400 : 503);
      res.end("retry later");
    }
    return;
  }

  if (req.method === "POST" && req.url === "/stripe-webhook") {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 1_000_000) { res.writeHead(413); res.end("payload too large"); return; }
    }
    try {
      await handleStripeWebhook(body, req.headers["stripe-signature"]);
      res.writeHead(200);
      res.end("ok");
    } catch (e) {
      console.error("stripe webhook error:", e);
      res.writeHead(400);
      res.end("error");
    }
    return;
  }

  if (req.method === "POST" && req.url === "/engage") {
    const authHeader = req.headers["authorization"];
    if (!process.env.ENGAGE_SECRET || authHeader !== `Bearer ${process.env.ENGAGE_SECRET}`) {
      res.writeHead(401);
      res.end("unauthorized");
      return;
    }
    res.writeHead(200);
    res.end("engagement started");
    runEngagementSession().catch((e) => console.error("engage error:", e));
    return;
  }

  if (req.method === "POST" && req.url === "/engagement-report") {
    const authHeader = req.headers["authorization"];
    if (!process.env.ENGAGE_SECRET || authHeader !== `Bearer ${process.env.ENGAGE_SECRET}`) {
      res.writeHead(401);
      res.end("unauthorized");
      return;
    }
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 1_000_000) { res.writeHead(413); res.end("payload too large"); return; }
    }
    try {
      const { actions } = JSON.parse(body);
      const { sendMessage } = await import("./telegram.js");
      const GROUP_CHAT = process.env.TELEGRAM_GROUP_CHAT_ID || "-1004319265595";
      const lines = ["🤖 <b>Engagement Report</b>\n"];
      for (const a of actions) {
        lines.push(`• <b>${a.type}</b>: ${a.detail}`);
      }
      await sendMessage(GROUP_CHAT, lines.join("\n"));
      res.writeHead(200);
      res.end("reported");
    } catch (e) {
      console.error("engagement-report error:", e);
      res.writeHead(400);
      res.end("error");
    }
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", bot: "Social Banana" }));
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`Social Banana listening on :${PORT}`);
  startProactiveLoop();
  startReminderLoop();
  startJobWorker();
  async function configureWebhook() {
    try {
      const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
        method: "POST", signal: AbortSignal.timeout(20_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookRegistration(webhookSecret)),
      });
      if (!response.ok || !(await response.json()).ok) throw new Error("Webhook registration failed");
      console.log("[webhook] authenticated webhook configured");
    } catch {
      console.error("[webhook] registration failed; retrying in 30 seconds");
      setTimeout(configureWebhook, 30_000);
    }
  }
  void configureWebhook();
  memoryRequest(0, 0).then(() => console.log("[memory] persistent store reachable"))
    .catch(() => console.error("[memory] persistent store unavailable"));
});

process.on('SIGTERM', () => {
  stopJobWorker(); stopProactiveLoop();
  stopReminderLoop();
  server.close();
  // Unfinished work remains leased in the database and is reported on recovery.
  setTimeout(() => process.exit(0), 25_000).unref();
});
