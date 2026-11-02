import { sendMessage, sendTyping, sendPhoto, getFileUrl } from "./telegram.js";
import { gatherStatus } from "./postzen.js";
import { chat, detectFace } from "./ai.js";
import { checkAccess, incrementUsage, getUser, getTierInfo } from "./tiers.js";
import { runEngagementSession } from "./engage.js";

import { resolveCoverBrief } from "./cover-brief.js";
import { archiveCover } from "./drive.js";
import { memoryRequest, groupConversationContext } from "./memory.js";

const OWNER_ID = Number(process.env.TELEGRAM_OWNER_ID) || 1661812916;
const GROUP_CHAT = String(process.env.TELEGRAM_GROUP_CHAT_ID || "-1004319265595");
const STRIPE_LINK = process.env.STRIPE_PAYMENT_LINK || "https://buy.stripe.com/8x2dR8ez45JG85s4e504800";

const activeChats = new Set();
const FACE_QUESTION = "Veo un rostro en la foto. ¿Eres tú o es otra persona? ¿Quieres que la portada sea fotorrealista? Puedes decirme, por ejemplo: ‘soy yo, sí, fotorrealista’. Siempre la haré en calidad Pro.";

export async function handleUpdate(update) {
  const chatId = update.message?.chat?.id;
  if (!chatId) return;
  const requestKey = `${chatId}:${update.message.from?.id}`;
  if (activeChats.has(requestKey)) {
    await sendMessage(chatId, "Sigo con el encargo anterior. Te aviso en cuanto termine; después seguimos con ese detalle.").catch(() => {});
    return;
  }
  activeChats.add(requestKey);
  try { await handleMessage(update); }
  catch (e) {
    console.error("[bot] request failed", e.name);
    await sendMessage(chatId, "Esta vez se ha cortado la conexión con uno de los servicios. No he completado el encargo; puedes volver a intentarlo.").catch(() => {});
  } finally { activeChats.delete(requestKey); }
}

async function handleMessage(update) {
  const msg = update.message;
  if (!msg) return;
  if (String(msg.chat.id) === GROUP_CHAT && msg.new_chat_members?.length) {
    const members = msg.new_chat_members.filter(member => !member.is_bot);
    const newcomers = [];
    for (const member of members) {
      const state = await memoryRequest(msg.chat.id, member.id);
      if (state.profile?.welcomedAt) continue;
      state.profile = { ...state.profile, telegramName: member.first_name || member.username || "", welcomedAt: new Date().toISOString() };
      await memoryRequest(msg.chat.id, member.id, "POST", state);
      newcomers.push(member.first_name || member.username || "colega");
    }
    if (newcomers.length) {
      const single = newcomers.length === 1;
      await sendMessage(msg.chat.id, `¡${newcomers.join(", ")}, ${single ? "qué bien tenerte por aquí" : "bienvenidos"}! Soy Banana, el asistente creativo de la comunidad. ¿Qué tipo de contenido ${single ? "creas o te gustaría crear" : "creáis o queréis crear"}?\n\nPodemos hablar aquí o por privado: https://t.me/SocialBananaBot?start=welcome\nIré recordando lo que ${single ? "me cuentes" : "me contéis"} para ayudar mejor; podéis consultar o borrar lo guardado.`);
    }
    return;
  }
  if (msg.from?.is_bot) return;
  if (!msg.text && !msg.caption && !msg.photo?.length) return;
  if (!msg.text) msg.text = msg.caption || "Usa esta foto como referencia para mi próxima petición.";

  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
  const userId = msg.from?.id;
  const username = msg.from?.username;

  // Handle commands first
  const cmd = msg.text.trim().toLowerCase();
  if (/^\/start(?:@socialbananabot)?(?:\s|$)/i.test(cmd)) {
    await sendMessage(chatId, `¡Hola${msg.from?.first_name ? ", " + msg.from.first_name : ""}! Aquí podemos hablar de tu proyecto con calma. ¿Qué tipo de contenido creas, o te gustaría empezar a crear?\n\nIré recordando tus preferencias para ayudarte mejor. Puedes consultar lo guardado con /mimemoria o borrarlo con /olvidame.`);
    return;
  }
  if (cmd === "/plan" || cmd === "/miplan") {
    const user = await getUser(userId, username);
    const info = getTierInfo(user.tier);
    const used = user.last_request_date === new Date().toISOString().split("T")[0] ? user.daily_requests : 0;
    await sendMessage(chatId, `Tu plan: <b>${info.name}</b>\nConsultas: ${used}/${info.limit}\nHerramientas: ${info.tools}`);
    return;
  }
  if (cmd === "/engage") {
    if (userId !== OWNER_ID) {
      await sendMessage(chatId, "Solo el owner puede ejecutar engagement.");
      return;
    }
    await sendMessage(chatId, "🍌 Lanzando sesión de engagement...");
    runEngagementSession().catch((e) => console.error("engage cmd error:", e));
    return;
  }
  if (cmd === "/upgrade") {
    const user = await getUser(userId, username);
    if (user.tier === "owner" || user.tier === "pro") {
      await sendMessage(chatId, `Ya tienes el plan ${user.tier === "owner" ? "Owner" : "Pro"} activo.`);
    } else {
      await sendMessage(chatId, `Plan Pro - Todas las herramientas desbloqueadas:\n\n- Crear borradores de posts\n- Responder comentarios y DMs\n- Generar imagenes con DALL-E\n- Analisis con Claude AI\n- 50 consultas/dia\n\n<a href="${STRIPE_LINK}">Suscribirse al Plan Pro</a>`);
    }
    return;
  }

  // In private, check access
  if (!isGroup) {
    const access = await checkAccess(userId, username);
    if (!access.allowed) {
      await sendMessage(chatId, access.reason);
      return;
    }
  }

  // Our creator group is conversational; other groups still require a mention/reply.
  if (isGroup) {
    if (!isBotTriggered(msg)) return;
    const access = await checkAccess(userId, username);
    if (!access.allowed) { await sendMessage(chatId, access.reason); return; }
  }

  let text = ["/olvidame", "/mimemoria"].includes(cmd) ? cmd : cleanMessage(msg.text);
  if (!text) {
    if (/@socialbananabot/i.test(msg.text)) await sendMessage(chatId, "Aquí estoy 🙂 ¿Qué tienes entre manos? Cuéntame y nos ponemos con ello.");
    return;
  }

  await sendTyping(chatId);
  let state;
  try { state = await memoryRequest(chatId, userId); }
  catch {
    await sendMessage(chatId, "Ahora no puedo recuperar tu memoria privada. Prefiero que lo intentemos de nuevo en un momento para no perder tu foto ni tu encargo.");
    return;
  }
  if (cmd === "/olvidame") {
    await memoryRequest(chatId, userId, "DELETE");
    await sendMessage(chatId, "He borrado tu memoria de esta conversación, incluida la referencia de tu foto.");
    return;
  }
  if (cmd === "/mimemoria") {
    if (isGroup) { await sendMessage(chatId, "Tu ficha es privada. Consúltala por mensaje privado conmigo usando /mimemoria."); return; }
    const profile = JSON.stringify(state.profile || {}, null, 2);
    await sendMessage(chatId, `Esto es lo que tengo anotado para atenderte:\n${profile}\nFoto de referencia: ${state.reference ? "sí" : "no"}. Puedes corregirme o usar /olvidame.`);
    return;
  }
  state.history ||= [];
  state.profile ||= {};
  state.profile.telegramName = msg.from?.first_name || username || "";
  if (isGroup && !state.profile.welcomedAt && /^(?:hola|buenas|hey+|hi|hello|buenos días|buenas tardes|buenas noches)[!., 🙂👋]*$/iu.test(text)) {
    const name = state.profile.name || state.profile.telegramName;
    const welcome = `¡Hola${name ? ", " + name : ""}! Qué bien tenerte por aquí. ¿Qué creas o qué te gustaría empezar a crear?\n\nPodemos hablar aquí o por privado: https://t.me/SocialBananaBot?start=welcome\nIré recordando lo que me cuentes para ayudarte con tu proyecto; puedes consultar o borrar lo guardado.`;
    await sendMessage(chatId, welcome);
    state.profile.welcomedAt = new Date().toISOString();
    state.history = [...state.history, { role: "user", content: text }, { role: "assistant", content: welcome }].slice(-40);
    await memoryRequest(chatId, userId, "POST", state);
    return;
  }
  const typingTimer = setInterval(() => sendTyping(chatId).catch(() => {}), 4500);
  const progressTimer = setTimeout(() => sendMessage(chatId, "Sigo trabajando en ello. Te aviso aquí cuando esté listo o si surge algún problema.").catch(() => {}), 45_000);
  const record = (role, content) => {
    state.history.push({ role, content });
    state.history = state.history.slice(-40);
  };
  try {
    const photos = msg.photo || msg.reply_to_message?.photo;
    const newFileId = photos?.at(-1)?.file_id;
    if (newFileId && newFileId !== state.reference?.fileId) {
      state.reference = { fileId: newFileId, hasFace: null, photorealistic: null, identity: null };
      state.pendingPrompt = msg.caption || (msg.photo ? null : text);
      state.lastPrompt = null;
      state.coverDraft = null;
    }
    let imageUrl = null;
    if (state.reference) {
      imageUrl = await getFileUrl(state.reference.fileId);
      if (!imageUrl) throw new Error("Reference unavailable");
      if (state.reference.hasFace === null) {
        await sendMessage(chatId, "Estoy mirando tu foto para preparar bien la referencia. Esto suele llevar unos segundos.");
        state.reference.hasFace = await detectFace(imageUrl);
        if (state.reference.hasFace) {
          state.awaitingFaceAnswer = true;
          record("user", text);
          record("assistant", FACE_QUESTION);
          await memoryRequest(chatId, userId, "POST", state);
          await sendMessage(chatId, FACE_QUESTION);
          return;
        }
      }
    }
    if (state.awaitingFaceAnswer) {
      const answer = text.toLowerCase();
      if (/otra persona|no soy yo|es mi (amig|herman|pareja|cliente)/.test(answer)) state.reference.identity = text;
      else if (/soy yo|es mi cara|soy el de|soy la de/.test(answer)) state.reference.identity = "El usuario declara que es él/ella en esta foto";
      if (/no (?:la quiero |quiero )?fotorreal|estilizad|ilustraci|anime|caricatura/.test(answer)) state.reference.photorealistic = false;
      else if (/fotorreal|realista|^s[ií][.! ]*$/.test(answer)) state.reference.photorealistic = true;
      else if (/^no[.! ]*$/.test(answer)) state.reference.photorealistic = false;
      record("user", text);
      if (state.reference.photorealistic === null) {
        await memoryRequest(chatId, userId, "POST", state);
        await sendMessage(chatId, "¿La quieres fotorrealista o prefieres otro estilo? Puedes añadir cómo te gustaría que fuese la portada.");
        return;
      }
      state.awaitingFaceAnswer = false;
      if (!state.pendingPrompt) {
        await memoryRequest(chatId, userId, "POST", state);
        await sendMessage(chatId, "Perfecto, tengo tu referencia y esa preferencia. Escríbeme el prompt: qué quieres crear, el ambiente, los colores y cualquier texto que deba aparecer.");
        return;
      }
      text = state.pendingPrompt + "\nPreferencias del usuario: " + text;
      state.pendingPrompt = null;
    }
    const photoStyle = state.reference?.photorealistic === true
      ? "El usuario pide fotorrealismo. Usa la foto ORIGINAL adjunta, conserva su identidad, rasgos y escena salvo cambios expresamente pedidos."
      : state.reference?.photorealistic === false ? "El usuario NO quiere fotorrealismo. Sigue el estilo artístico solicitado usando su foto original." : "";
    let directPrompt = /^(?:\/imagen(?:@\w+)?\s+|prompt\s*:\s*)/i.test(msg.text)
      ? msg.text.replace(/^(?:\/imagen(?:@\w+)?\s+|prompt\s*:\s*)/i, "") : null;
    if (/^(?:calidad\s+)?pro[.! ]*$/i.test(text) && state.lastPrompt) directPrompt = state.lastPrompt;
    if (state.coverDraft?.pending) directPrompt = text;
    if (directPrompt) directPrompt += "\n" + photoStyle;
    let context = null;
    if (userId === OWNER_ID && !directPrompt && /phaedra|instagram|analytics|estad[ií]stic|m[eé]trica|publicacion|programad|comentarios|\bdms?\b/i.test(text)) {
      try { context = await gatherStatus(); } catch { /* proceed with conversation */ }
    }
    const community = isGroup ? await groupConversationContext(chatId).catch(() => []) : [];
    record("user", text);
    const reply = await chat(text, context, imageUrl, state.history, {
      directPrompt, photoStyle, profile: state.profile, isOwner: userId === OWNER_ID, isGroup, community,
      prepareImage: async prompt => {
        const brief = await resolveCoverBrief(text, state.coverDraft);
        if (brief.unrelated) return { chatInstead: true };
        state.coverDraft = { ...brief.draft, pending: Boolean(brief.text) };
        if (brief.text) return { text: brief.text };
        return { prompt: brief.prompt + "\n" + photoStyle };
      },
      onProgress: async kind => sendMessage(chatId, kind === "image"
        ? "Me pongo con tu portada en calidad PRO máxima" + (imageUrl ? ", usando tu foto original" : "") + ". Puede tardar aproximadamente 1–4 minutos. Te la envío aquí en cuanto termine."
        : "Voy a revisar los datos y preparar una propuesta con contexto. Puede llevar aproximadamente 1–2 minutos."),
    });
    if (reply.profile) state.profile = { ...state.profile, ...reply.profile };
    if (reply.image) state.lastPrompt = reply.image.prompt;
    record("assistant", reply.text);
    await memoryRequest(chatId, userId, "POST", state);
    if (reply.image) {
      await sendPhoto(chatId, Buffer.from(reply.image.imageBase64, "base64"), reply.text);
      try {
        const archived = await archiveCover(userId, reply.image.imageBase64);
        if (archived?.id) {
          state.lastDriveFile = { id: archived.id, url: archived.webViewLink };
          await memoryRequest(chatId, userId, "POST", state);
          await sendMessage(chatId, "He guardado también la portada en tu carpeta de contenido.");
        }
      } catch {
        await sendMessage(chatId, "La portada está entregada aquí. No he podido guardar la copia en Drive; tendrás que conservar esta descarga por ahora.");
      }
    } else await sendMessage(chatId, reply.text);
    if (userId !== OWNER_ID) await incrementUsage(userId);
    console.log(`[bot] reply delivered chat=${chatId} image=${Boolean(reply.image)}`);
  } finally {
    clearInterval(typingTimer);
    clearTimeout(progressTimer);
  }
}

function isBotTriggered(msg) {
  if (String(msg.chat.id) === GROUP_CHAT) return true;
  const text = (msg.text || "").toLowerCase();
  if (text.startsWith("/")) return true;
  if (text.includes("@socialbananabot")) return true;
  if (text.includes("banana")) return true;
  if (msg.reply_to_message?.from?.is_bot) return true;
  return false;
}

function cleanMessage(text) {
  return text
    .replace(/@socialbananabot/gi, "")
    .replace(/^\/\w+\s*/, "")
    .trim();
}
