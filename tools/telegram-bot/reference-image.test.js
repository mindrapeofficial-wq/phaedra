import test from "node:test";
import assert from "node:assert/strict";

process.env.OPENAI_API_KEY = "test-key";
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_OWNER_ID = "1";
const { handleUpdate } = await import("./bot.js");

test("photo-only upload survives follow-ups and reaches image edits and Telegram", async () => {
  const originalFetch = globalThis.fetch;
  const edits = [], sentPhotos = [], sentTexts = [], resolvedIds = [];
  let failEdit = false, generations = 0;
  const json = body => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes("postzen.dev")) return json({ data: [] });
    if (url.endsWith("/getFile")) {
      resolvedIds.push(JSON.parse(options.body).file_id);
      return json({ result: { file_path: "photos/ref.jpg" } });
    }
    if (url.includes("/file/bot")) return new Response("original-photo-bytes", { headers: { "Content-Type": "image/jpeg" } });
    if (url.endsWith("/chat/completions")) {
      const request = JSON.parse(options.body);
      const content = request.messages.at(-1).content;
      const text = typeof content === "string" ? content : content[0].text;
      const message = text.includes("próxima petición") ? { content: "Foto recibida." } : {
        tool_calls: [{ id: "image-call", function: { name: "generate_image", arguments: JSON.stringify({ prompt: "Create a cinematic cover", quality: text.includes("pro") ? "pro" : "normal" }) } }],
      };
      return json({ choices: [{ message }] });
    }
    if (url.endsWith("/images/edits")) {
      edits.push({ bytes: await options.body.get("image[]").text(), quality: options.body.get("quality"), model: options.body.get("model") });
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
    assert.deepEqual(edits, ["medium", "high"].map(quality => ({ bytes: "original-photo-bytes", quality, model: "gpt-image-2" })));
    assert.deepEqual(resolvedIds, ["original-file", "original-file", "original-file"]);
    assert.deepEqual(sentPhotos, ["edited-photo", "edited-photo"]);
    assert.equal(generations, 0);
    failEdit = true;
    await send({ text: "haz la portada otra vez" });
    assert.equal(sentPhotos.length, 2);
    assert.match(sentTexts.at(-1), /edición ha fallado/);
    assert.equal(generations, 0);
    await send({ text: "haz una portada" }, 200);
    assert.equal(generations, 1, "a separate chat must not inherit the reference");
    assert.equal(sentPhotos.at(-1), "fresh-photo");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
