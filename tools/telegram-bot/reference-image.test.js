import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_SERVICE_KEY = "test-memory-key";
process.env.OPENAI_API_KEY = "test-key";
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_OWNER_ID = "1";
const { handleUpdate } = await import("./bot.js");

test("photo-only upload survives follow-ups and reaches image edits and Telegram", async () => {
  const originalFetch = globalThis.fetch;
  const edits = [], sentPhotos = [], sentTexts = [], resolvedIds = [];
  const memories = new Map();
  let hasFace = false;
  let failEdit = false, generations = 0;
  const json = body => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes("/rest/v1/sb_telegram_users")) return json([{ tier: "owner" }]);
    if (url.includes("/rest/v1/sb_bot_memory")) {
      if (options.method === "POST") {
        const row = JSON.parse(options.body); memories.set(`${row.chat_id}:${row.telegram_id}`, row.state); return new Response(null, { status: 204 });
      }
      const parsed = new URL(url); const key = parsed.searchParams.get("chat_id").slice(3) + ":" + parsed.searchParams.get("telegram_id").slice(3);
      if (options.method === "DELETE") { memories.delete(key); return new Response(null, { status: 204 }); }
      return json(memories.has(key) ? [{ state: structuredClone(memories.get(key)) }] : []);
    }
    if (url.includes("postzen.dev")) return json({ data: [] });
    if (url.endsWith("/getFile")) {
      resolvedIds.push(JSON.parse(options.body).file_id);
      return json({ result: { file_path: "photos/ref.jpg" } });
    }
    if (url.includes("/file/bot")) return new Response("original-photo-bytes", { headers: { "Content-Type": "image/jpeg" } });
    if (url.endsWith("/chat/completions")) {
      const request = JSON.parse(options.body);
      if (request.response_format) return json({ choices: [{ message: { content: JSON.stringify({ hasFace }) } }] });
      const content = request.messages.findLast(m => m.role === "user").content;
      const text = typeof content === "string" ? content : content[0].text;
      const message = text.includes("próxima petición") ? { content: "Foto recibida." } : {
        tool_calls: [{ id: "image-call", function: { name: "generate_image", arguments: JSON.stringify({ prompt: "Create a cinematic cover", quality: text.includes("pro") ? "pro" : "normal" }) } }],
      };
      return json({ choices: [{ message }] });
    }
    if (url.endsWith("/images/edits")) {
      edits.push({ bytes: await options.body.get("image[]").text(), quality: options.body.get("quality"), model: options.body.get("model"), prompt: options.body.get("prompt") });
      assert.ok(options.signal);
      return failEdit ? new Response("edit unavailable", { status: 400 }) : json({ data: [{ b64_json: Buffer.from("edited-photo").toString("base64") }] });
    }
    if (url.endsWith("/images/generations")) {
      generations++;
      return json({ data: [{ b64_json: Buffer.from("fresh-photo").toString("base64") }] });
    }
    if (url.endsWith("/sendPhoto")) {
      sentPhotos.push(await options.body.get("photo").text());
      return json({ ok: true });
    }
    if (url.endsWith("/sendMessage")) {
      sentTexts.push(JSON.parse(options.body).text);
      return json({ ok: true });
    }
    if (url.endsWith("/sendChatAction")) return json({ ok: true });
    throw new Error("Unexpected request in test");
  };
  const send = (fields, chatId = 100) => handleUpdate({ message: {
    chat: { id: chatId, type: "group" }, from: { id: 1 }, reply_to_message: { from: { is_bot: true } }, ...fields,
  } });
  try {
    await send({ photo: [{ file_id: "original-file" }] });
    await send({ text: "haz la portada" });
    await send({ text: "pro" });
    assert.equal(edits.length, 2);
    for (const edit of edits) {
      assert.equal(edit.bytes, "original-photo-bytes");
      assert.equal(edit.quality, "max");
      assert.equal(edit.model, "gpt-image-2.5-sunburst");
    }
    assert.deepEqual(sentPhotos, ["edited-photo", "edited-photo"]);
    assert.ok(sentTexts.some(t => t.includes("1–4 minutos")));
    assert.equal(generations, 0);
    failEdit = true;
    await send({ text: "haz la portada otra vez" });
    assert.equal(sentPhotos.length, 2);
    assert.match(sentTexts.at(-1), /fallado|falló|tiempo de espera/);
    assert.equal(generations, 0);
    await send({ text: "haz una portada" }, 200);
    assert.equal(generations, 1, "a separate chat must not inherit the reference");
    assert.equal(sentPhotos.at(-1), "fresh-photo");
    failEdit = false;
    hasFace = true;
    const previousEdits = edits.length;
    await send({ photo: [{ file_id: "client-original" }], caption: "portada violeta sin texto" }, 300);
    assert.equal(edits.length, previousEdits, "must ask before generating a face");
    assert.match(sentTexts.at(-1), /¿Eres tú/);
    await send({ text: "soy yo" }, 300);
    assert.equal(edits.length, previousEdits, "identity alone is not photorealism consent");
    await send({ text: "sí, fotorrealista" }, 300);
    assert.equal(edits.length, previousEdits + 1);
    assert.equal(memories.get("300:1").reference.photorealistic, true);
    assert.match(memories.get("300:1").reference.identity, /declara/);
    await send({ text: "prompt: cabina violeta, sin letras ni logotipos" }, 300);
    assert.match(edits.at(-1).prompt, /^cabina violeta, sin letras ni logotipos/);
    assert.equal(resolvedIds.at(-1), "client-original");
    await send({ text: "/olvidame" }, 300);
    assert.equal(memories.has("300:1"), false);

  } finally {
    globalThis.fetch = originalFetch;
  }
});
