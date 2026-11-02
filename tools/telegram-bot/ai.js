const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `Eres Social Banana, el agente de redes sociales de Phaedra (@phaedrasound en Instagram).
Hablas en español, informal pero profesional. Eres directo, con personalidad, como un community manager real.

Phaedra es un DAW (Digital Audio Workstation) open-source y gratuito basado en Ardour.
- Release actual: Phaedra Lite v0.1.0-preview.5 (Windows/Linux), preview.4 (macOS)
- Web: phaedra.com.es
- Discord: discord.phaedra.com.es
- WhatsApp: family.phaedra.com.es

CAPACIDADES (SIEMPRE usa function calling para ejecutarlas, NO digas que no puedes):
- Ver posts recientes, programados y borradores (get_recent_posts, get_scheduled_posts, get_draft_posts)
- Crear borradores de posts, reels, carousels (create_draft_post)
- PUEDES responder a comentarios en posts de Instagram (reply_to_comment) - HAZLO cuando te lo pidan
- PUEDES ver comentarios de cualquier post (get_post_comments)
- PUEDES ver y responder DMs de Instagram (get_open_conversations, get_conversation_messages, send_dm)
- Ver analytics y mejores horarios (get_analytics, get_best_time_to_post)
- Sincronizar posts externos de Instagram (sync_external_posts)
- Generar imagenes con GPT Image (generate_image) - portadas, diseños, thumbnails. Pregunta al usuario si quiere calidad "normal" (rapida) o "pro" (alta calidad) cuando no lo especifique
- Pedir analisis profundo a Claude AI (ask_claude) - estrategia, scripts, auditorias

IMPORTANTE:
- NUNCA digas "no puedo". SIEMPRE usa una herramienta.
- IMAGENES: Cuando el usuario pida CUALQUIER imagen, portada, diseño, cover, thumbnail, promo, cartel, banner, arte, visual, o diga "hazme", "creame", "genera" seguido de algo visual → USA generate_image INMEDIATAMENTE. NO respondas con texto ni ideas. NO preguntes nada. GENERA LA IMAGEN directamente. Usa calidad "normal" por defecto, y "pro" solo si el usuario dice "pro", "alta calidad" o "HD" en el mismo mensaje.
- Para tareas de engagement (comentar reels/posts de otros, generar comentarios, planificar contenido, escribir scripts de reels, auditorias, estrategia): USA ask_claude.
- Para datos y acciones directas en tu cuenta (ver posts, analytics, crear borradores, responder TUS comentarios/DMs): USA las herramientas de PostZen.
- Si alguien pide "comenta reels", usa ask_claude para generar los comentarios on-brand y presentalos listos para copiar y pegar.
- Si alguien pide "haz engagement", usa ask_claude para crear un plan de engagement con cuentas target y comentarios preparados.

REGLAS:
- NUNCA anuncies features que no existan
- NUNCA menciones @ny0b3 ni lo conectes con @phaedrasound
- Responde con datos reales cuando te los dan
- Si no tienes datos, dilo honestamente
- Maximo 500 caracteres por mensaje (excepto cuando reportas datos)
- No uses emojis excesivos, maximo 2-3 por mensaje
- Cuando te den datos de Instagram, analiza y sugiere acciones concretas
- Todos los posts de @phaedrasound deben ser en INGLES como idioma base
- Las portadas y diseños deben seguir la estetica de Phaedra: minimalista, oscuro, moderno, DAW vibes
- Maximo 20 comentarios/hora, minimo 10 palabras por comentario
- NUNCA hagas pitch de Phaedra en comentarios de otras cuentas`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_recent_posts",
      description: "Get recent published Instagram posts with analytics",
      parameters: { type: "object", properties: { limit: { type: "number", default: 5 } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_scheduled_posts",
      description: "Get posts scheduled for future publishing",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_draft_posts",
      description: "Get draft posts not yet scheduled or published",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_draft_post",
      description: "Create a new draft post on Instagram. Content must be in ENGLISH.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Post caption in English" },
          postType: { type: "string", enum: ["post", "reel", "carousel"], default: "post" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_post_comments",
      description: "Get comments on a specific post",
      parameters: {
        type: "object",
        properties: { postId: { type: "string" } },
        required: ["postId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reply_to_comment",
      description: "Reply to a comment on a post",
      parameters: {
        type: "object",
        properties: {
          postId: { type: "string" },
          commentId: { type: "string" },
          text: { type: "string" },
        },
        required: ["postId", "commentId", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_open_conversations",
      description: "Get open DM conversations",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_conversation_messages",
      description: "Read messages in a DM conversation",
      parameters: {
        type: "object",
        properties: { conversationId: { type: "string" } },
        required: ["conversationId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_dm",
      description: "Send a DM reply in a conversation",
      parameters: {
        type: "object",
        properties: {
          conversationId: { type: "string" },
          text: { type: "string" },
        },
        required: ["conversationId", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_analytics",
      description: "Get top posts by engagement for the last N days",
      parameters: { type: "object", properties: { days: { type: "number", default: 30 } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_best_time_to_post",
      description: "Get the best times to post based on historical engagement",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "sync_external_posts",
      description: "Sync posts published directly on Instagram into PostZen",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Generate an image with GPT Image / DALL-E. Use for music covers, post designs, carousel visuals, reel thumbnails. Style: minimalist, dark, modern, DAW aesthetic. Ask the user if they want normal or pro quality when not specified.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Image description in English, detailed" },
          size: { type: "string", enum: ["1024x1024", "1024x1792", "1792x1024"], default: "1024x1024" },
          quality: { type: "string", enum: ["normal", "pro"], default: "normal", description: "normal = fast & cheaper, pro = high detail & slower" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_claude",
      description: "ALWAYS use this for: commenting on other accounts' reels/posts, engagement plans, reel scripts, carousel text, content audits, caption writing, content strategy, voice-matching. Claude has full Instagram Agent Skills. IMPORTANT: When Claude returns a response, present it DIRECTLY to the user as-is. Do NOT rephrase, summarize, or replace Claude's response with your own version.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "What Claude should do" },
          context: { type: "string", description: "Relevant data or background" },
        },
        required: ["task"],
      },
    },
  },
];

import * as pz from "./postzen.js";

async function executeTool(name, args) {
  switch (name) {
    case "get_recent_posts":
      return pz.getRecentPosts(args.limit || 5);
    case "get_scheduled_posts":
      return pz.getScheduledPosts();
    case "get_draft_posts":
      return pz.getDraftPosts();
    case "create_draft_post":
      return pz.createDraftPost(args.content, args.postType || "post");
    case "get_post_comments":
      return pz.getPostComments(args.postId);
    case "reply_to_comment":
      return pz.replyToComment(args.postId, args.commentId, args.text);
    case "get_open_conversations":
      return pz.getOpenConversations();
    case "get_conversation_messages":
      return pz.getConversationMessages(args.conversationId);
    case "send_dm":
      return pz.sendDM(args.conversationId, args.text);
    case "get_analytics":
      return pz.getAnalytics(args.days || 30);
    case "get_best_time_to_post":
      return pz.getBestTimeToPost();
    case "sync_external_posts":
      return pz.syncExternalPosts();
    case "generate_image":
      return generateImage(args.prompt, args.size || "1024x1024", args.quality || "normal");
    case "ask_claude":
      return askClaude(args.task, args.context || "");
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function generateImage(prompt, size, quality = "normal") {
  if (!OPENAI_KEY) return { error: "OPENAI_API_KEY not configured" };
  const isPro = quality === "pro";
  for (const model of ["gpt-image-1", "dall-e-3", "dall-e-2"]) {
    const body = { model, prompt, n: 1 };
    if (model === "gpt-image-1") {
      body.size = size;
      body.quality = isPro ? "high" : "medium";
    } else {
      body.size = size;
      body.quality = isPro ? "hd" : "standard";
    }
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      const url = data.data?.[0]?.url;
      const revised = data.data?.[0]?.revised_prompt;
      return { imageUrl: url, revisedPrompt: revised, model, quality: isPro ? "pro" : "normal" };
    }
    const err = await res.text();
    console.error(`Image gen (${model}) error: ${res.status}`, err);
    if (res.status !== 400) return { error: `Image generation failed: ${res.status}` };
  }
  return { error: "No image model available on this API key" };
}

async function askClaude(task, context) {
  if (!ANTHROPIC_KEY) return { error: "ANTHROPIC_API_KEY not configured" };
  const systemMsg = `You are Claude, the strategic brain behind @phaedrasound Instagram, with full Instagram Agent Skills.
Phaedra is a free, open-source DAW based on Ardour. Current release: Phaedra Lite v0.1.0-preview.5 (Windows/Linux), preview.4 (macOS).
Website: phaedra.com.es | Discord: discord.phaedra.com.es | WhatsApp: family.phaedra.com.es

YOUR SKILLS (use them):
- /ig-comment: Generate on-brand comments for other accounts' posts/reels. Min 10 words, ask questions, never pitch Phaedra. Max 20 comments/hour.
- /ig-reel: Write reel scripts with hooks, beats, timing.
- /ig-caption: Write captions in English with CTAs.
- /ig-carousel: Design carousel slide text.
- /ig-plan: Weekly content plans.
- /ig-audit: Analyze account performance.
- /ig-story: Story sequences.
- /ig-profile: Bio and profile optimization.
- /ig-viral: Analyze trending formats.
- /ig-repurpose: Turn content into new formats.

RULES:
- All @phaedrasound content in ENGLISH
- Never announce features that don't exist
- Never mention @ny0b3
- No pitch in comments on other accounts - never mention Phaedra in comments
- Min 10 words per comment, ask questions, be genuine
- Respond in SPANISH to the operator
- Write Instagram content in ENGLISH
- When asked to generate comments: provide 5-10 ready-to-copy comments with the target account/post described
- When asked for engagement: provide a list of target accounts + prepared comments for each
- Be actionable: give copy-paste ready content, not theory`;

  const messages = [{ role: "user", content: context ? `${task}\n\nContexto:\n${context}` : task }];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "claude-opus-5-5", max_tokens: 1024, system: systemMsg, messages }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Claude error:", res.status, err);
    return { error: `Claude failed: ${res.status}` };
  }
  const data = await res.json();
  console.log("[claude raw]", JSON.stringify(data).slice(0, 500));
  const textBlock = data.content?.find(b => b.type === "text");
  const text = textBlock?.text || "No response";
  console.log("[claude response]", text.slice(0, 200));
  return { response: text };
}

export { askClaude };

export async function chat(userMessage, context, imageUrl = null) {
  if (!OPENAI_KEY) return "No tengo la API key de ChatGPT configurada.";

  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
  if (context) {
    messages.push({ role: "system", content: `Datos actuales de Instagram @phaedrasound:\n${JSON.stringify(context, null, 2)}` });
  }
  if (imageUrl) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userMessage },
        { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
      ],
    });
  } else {
    messages.push({ role: "user", content: userMessage });
  }

  let response = await callOpenAI(messages);

  // Function calling loop (max 5 rounds)
  let rounds = 0;
  while (response.tool_calls && rounds < 5) {
    rounds++;
    messages.push({ role: "assistant", tool_calls: response.tool_calls });

    for (const tc of response.tool_calls) {
      const args = JSON.parse(tc.function.arguments || "{}");
      console.log(`[tool] ${tc.function.name}(${JSON.stringify(args)})`);
      let result;
      try {
        result = await executeTool(tc.function.name, args);
      } catch (e) {
        result = { error: e.message };
      }
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result).slice(0, 4000),
      });
    }

    response = await callOpenAI(messages);
  }

  return response.content || "No se que decirte, algo fallo.";
}

async function callOpenAI(messages) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1",
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      max_tokens: 800,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("OpenAI error:", res.status, err);
    return { content: "Uf, no me pude conectar con el cerebro." };
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  return {
    content: msg?.content,
    tool_calls: msg?.tool_calls,
  };
}
