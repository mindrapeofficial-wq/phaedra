import http from "node:http";
import { handleUpdate } from "./bot.js";
import { handleStripeWebhook } from "./stripe.js";

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

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", bot: "Social Banana" }));
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => console.log(`Social Banana listening on :${PORT}`));
