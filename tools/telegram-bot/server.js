import http from "node:http";
import { handleUpdate } from "./bot.js";
import { handleStripeWebhook } from "./stripe.js";
import { runEngagementSession } from "./engage.js";
import { startProactiveLoop } from "./proactive.js";

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/webhook") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const update = JSON.parse(body);
      handleUpdate(update).catch((e) => console.error("handler error:", e));
      res.writeHead(200);
      res.end("ok");
    } catch {
      res.writeHead(400);
      res.end("bad json");
    }
    return;
  }

  if (req.method === "POST" && req.url === "/stripe-webhook") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      await handleStripeWebhook(body);
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
    if (authHeader !== `Bearer ${process.env.ENGAGE_SECRET}`) {
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
    if (authHeader !== `Bearer ${process.env.ENGAGE_SECRET}`) {
      res.writeHead(401);
      res.end("unauthorized");
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
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
  // Keep-alive: ping ourselves every 14 min so Render free tier doesn't sleep
  setInterval(() => {
    fetch(`https://social-banana-bot.onrender.com/health`).catch(() => {});
  }, 14 * 60 * 1000);
});
