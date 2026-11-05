import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_SERVICE_KEY = "test-memory-key";
process.env.OPENAI_API_KEY = "test-key";
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_OWNER_ID = "1";
const { handleUpdate } = await import("./bot.js");

test("photo-only upload survives follow-ups and reaches image edits and Telegram", async () => {
  const originalFetch = globalThis.fetch;
  const edits = [], sentPhotos = [], sentDocuments = [], sentTexts = [], resolvedIds = [];
  const memories = new Map();
  const originalPhoto = Buffer.concat([Buffer.from([255, 216, 255]), Buffer.from("original-photo-bytes")]);
  let hasFace = false;
  let failEdit = false, generations = 0;
  const json = body => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes("sb_creator_profiles")) return json([]);
    if (url.includes("sb_merge_creator_profile")) return json(null);
    if (url.includes("/rest/v1/sb_telegram_users")) return json([{ tier: "owner" }]);
    if (url.includes("/rest/v1/sb_bot_memory")) {
      if (options.method === "POST") {
        const row = JSON.parse(options.body); memories.set(`${row.chat_id}:${row.telegram_id}`, row.state); return new Response(null, { status: 204 });
      }
      const parsed = new URL(url);
      if (options.method === "DELETE" && !parsed.searchParams.has("chat_id")) {
        for (const key of memories.keys()) if (key.endsWith(":" + parsed.searchParams.get("telegram_id").slice(3))) memories.delete(key);
        return new Response(null, { status: 204 });
      }
      const key = parsed.searchParams.get("chat_id").slice(3) + ":" + parsed.searchParams.get("telegram_id").slice(3);
      if (options.method === "DELETE") { memories.delete(key); return new Response(null, { status: 204 }); }
      return json(memories.has(key) ? [{ state: structuredClone(memories.get(key)) }] : []);
    }
    if (url.includes("postzen.dev")) return json({ data: [] });
    if (url.endsWith("/getFile")) {
      resolvedIds.push(JSON.parse(options.body).file_id);
      return json({ result: { file_path: "photos/ref.jpg" } });
    }
    if (url.includes("/file/bot")) return new Response(originalPhoto, { headers: { "Content-Type": "application/octet-stream" } });
    if (url.endsWith("/chat/completions")) {
      const request = JSON.parse(options.body);
      if (request.messages[0].content.startsWith("Extract a cover design brief")) {
        const input = JSON.parse(request.messages[1].content);
        const brief = input.message === "quitale fondo"
          ? { kind: 'photo_edit', visualPrompt: 'Remove the background of the original logo only', background: 'transparent', lettering: '' }
          : input.message === "quiero preparar una portada"
          ? { artist: null, title: null, label: null, graphics: null, visualPrompt: null }
          : input.message.startsWith("Artista: Luna")
            ? { artist: "Luna", title: "Neon Rain", label: "", graphics: "", visualPrompt: "Cabina violeta con lluvia" }
            : { artist: "", title: "", label: "", graphics: "", ...input.previous, visualPrompt: input.message.replace(/^prompt:\s*/i, "") };
        return json({ choices: [{ message: { content: JSON.stringify(brief) } }] });
      }
      if (request.response_format) return json({ choices: [{ message: { content: JSON.stringify({ hasFace }) } }] });
      const content = request.messages.findLast(m => m.role === "user").content;
      const text = typeof content === "string" ? content : content[0].text;
      const message = text === "heyyy" ? { content: "¡Hey! ¿Qué estás creando hoy?" } : text.includes("próxima petición") ? { content: "Foto recibida." } : {
        tool_calls: [{ id: "image-call", function: { name: "generate_image", arguments: JSON.stringify({ prompt: "Create a cinematic cover", quality: text.includes("pro") ? "pro" : "normal" }) } }],
      };
      return json({ choices: [{ message }] });
    }
    if (url.endsWith("/images/edits")) {
      const photo = options.body.get("image[]");
      assert.equal(photo.type, "image/jpeg", "Telegram's generic MIME must be corrected");
      edits.push({ bytes: Buffer.from(await photo.arrayBuffer()), quality: options.body.get("quality"), model: options.body.get("model"), prompt: options.body.get("prompt"), background: options.body.get('background') });
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
    if (url.endsWith('/sendDocument')) {
      sentDocuments.push(await options.body.get('document').text());
      return json({ok:true,result:{document:{file_id:'transparent-output'}}});
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
      assert.deepEqual(edit.bytes, originalPhoto);
      assert.equal(edit.quality, "max");
      assert.equal(edit.model, "gpt-image-2.6-sunburst");
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
    await send({ text: "heyyy", reply_to_message: undefined, from: { id: 2 } }, -1004319265595);
    assert.match(sentTexts.at(-1), /Qué bien tenerte/);
    assert.match(sentTexts.at(-1), /start=welcome/);
    assert.doesNotMatch(sentTexts.at(-1), /phaedra/i);
    const afterGreeting = sentTexts.length;
    await send({ text: "heyyy", reply_to_message: undefined, from: { id: 2, is_bot: true } }, -1004319265595);
    assert.equal(sentTexts.length, afterGreeting, "ignore bots to prevent reply loops");
    await send({ new_chat_members: [{ id: 3, first_name: "Emil" }], reply_to_message: undefined }, -1004319265595);
    assert.match(sentTexts.at(-1), /Emil, qué bien tenerte/);
    assert.match(sentTexts.at(-1), /start=welcome/);
    const afterWelcome = sentTexts.length;
    await send({ new_chat_members: [{ id: 3, first_name: "Emil" }], reply_to_message: undefined }, -1004319265595);
    assert.equal(sentTexts.length, afterWelcome, "welcome only on first entry");
    await send({ text: "/start welcome" }, 700);
    assert.match(sentTexts.at(-1), /tipo de contenido creas/);
    await send({ text: "@SocialBananaBot", reply_to_message: undefined }, -1004319265595);
    assert.match(sentTexts.at(-1), /Aquí estoy/);
    const beforeBrief = generations;
    await send({ text: "quiero preparar una portada" }, 500);
    assert.equal(generations, beforeBrief, "ask for the brief before generating");
    assert.match(sentTexts.at(-1), /nombre del artista.*título.*sello discográfico/);
    assert.equal(memories.get("500:1").coverDraft.pending, true);
    await send({ text: "Artista: Luna; título: Neon Rain; sin sello ni extras. Cabina violeta con lluvia" }, 500);
    assert.equal(generations, beforeBrief + 1, "the visual prompt already supplied with the details is sufficient");
    await send({ text: "Cabina violeta con lluvia y luz cinematográfica" }, 500);
    assert.equal(generations, beforeBrief + 2);
    assert.equal(memories.get("500:1").coverDraft.pending, false);
    assert.match(memories.get("500:1").lastPrompt, /Artist: Luna/);
    assert.match(memories.get("500:1").lastPrompt, /Title: Neon Rain/);
    await Promise.all([send({ text: "heyyy" }, 900), send({ text: "heyyy" }, 900)]);
    assert.equal(memories.get("900:1").history.filter(m => m.role === "user").length, 2, "messages received during work must be processed in order, not discarded");
    assert.ok(sentTexts.some(t => t.includes("mensaje en cola")));
    await send({ text: "/instagram", reply_to_message: undefined, from: { id: 3 } }, -1004319265595);
    assert.match(sentTexts.at(-1), /por privado/);
    hasFace = false;
    await send({ photo: [{file_id:'logo-original'}] },1200);
    await send({ text:'quitale fondo' },1200);
    assert.equal(edits.at(-1).background,'transparent');
    assert.doesNotMatch(edits.at(-1).prompt,/Primary purpose: create music cover/);
    assert.equal(sentDocuments.at(-1),'edited-photo');
    assert.equal(memories.get('1200:1').generatedFileId,'transparent-output');
    assert.equal(memories.get('1200:1').reference.fileId,'logo-original');

  } finally {
    globalThis.fetch = originalFetch;
  }
});
