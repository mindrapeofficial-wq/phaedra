import { transcribeVoice } from "./voice.js";
import { createAccountLink } from "./account-link.js";
import { checkAiServices } from "./ai-health.js";
import { privateProfile, saveProfileChanges, forgetCreativeMemory } from "./profiles.js";
import { reserveImage, finishImage } from "./image-credits.js";
import { beginConnection, verifyConnection, disableConnection, connection } from "./instagram.js";
import { runInstagramAgent } from "./instagram-agent.js";
import { sendMessage, sendTyping, sendPhoto, sendImageDocument, getFileUrl } from "./telegram.js";
import { chat, detectFace } from "./ai.js";
import { checkAccess, incrementUsage, getUser, getTierInfo } from "./tiers.js";
import { runEngagementSession } from "./engage.js";

import { resolveCoverBrief } from "./cover-brief.js";
import { archiveCover } from "./drive.js";
import { memoryRequest, groupConversationContext } from "./memory.js";
import { referralSummary, claimReferral } from "./referrals.js";
import { claimInstagramTrial } from "./instagram-trial.js";
import { helpMessage } from "./help.js";
import { isPhotoOnly, addUpload, saveUploads, scheduleUploadQuestion, wantsToSave, wantsToDiscard, wantsNewImage, answersFaceQuestion } from "./photo-uploads.js";
import { withUsageContext, notifyAction, userLimitReached, USER_LIMIT_MESSAGE, activityReport, spendReport, PRIVACY_NOTICE } from "./usage.js";
import { releasePlanSummary, completeReleaseTask, setReleaseReminders } from "./releases.js";

const OWNER_ID = Number(process.env.TELEGRAM_OWNER_ID) || 1661812916;
const GROUP_CHAT = String(process.env.TELEGRAM_GROUP_CHAT_ID || "-1004319265595");

const activeChats = new Map();
const FACE_QUESTION = "Veo un rostro en la foto. ¿Eres tú o es otra persona? ¿Quieres que la portada sea fotorrealista? Puedes decirme, por ejemplo: ‘soy yo, sí, fotorrealista’. Siempre la haré en calidad Pro.";

export async function handleUpdate(update) {
  const chatId = update.message?.chat?.id;
  if (!chatId) return;
  const requestKey = `${chatId}:${update.message.from?.id}`;
  const pending = activeChats.get(requestKey);
  if (pending?.count >= 6) {
    await sendMessage(chatId, "Tengo varios mensajes tuyos pendientes. Este último no ha entrado en la cola; reenvíamelo cuando termine los anteriores.").catch(() => {});
    return;
  }
  const slot = { count: (pending?.count || 0) + 1 };
  slot.task = (pending?.task || Promise.resolve()).then(async () => {
    try {
      const from = update.message.from;
      await withUsageContext({ userId: from?.id, username: from?.username, isPrivate: update.message.chat?.type === "private" }, () => handleMessage(update));
    }
    catch (e) {
      console.error("[bot] request failed", e.name);
      await sendMessage(chatId, "Esta vez se ha cortado la conexión con uno de los servicios. No he completado el encargo; puedes volver a intentarlo.").catch(() => {});
    }
  }).finally(() => {
    const current = activeChats.get(requestKey);
    if (current === slot) activeChats.delete(requestKey);
    else if (current) current.count--;
  });
  activeChats.set(requestKey, slot);
  if (pending && !isPhotoOnly(update.message)) await sendMessage(chatId, "Te he leído. Tengo este mensaje en cola y lo atenderé cuando termine el encargo en curso.").catch(() => {});
  await slot.task;
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
      await sendMessage(msg.chat.id, `¡${newcomers.join(", ")}, ${single ? "qué bien tenerte por aquí" : "bienvenidos"}! Soy Banana, la IA manager de esta comunidad. ¿Qué tipo de contenido ${single ? "creas o te gustaría crear" : "creáis o queréis crear"}?\n\nPodemos hablar aquí o por privado: https://t.me/SocialBananaBot?start=welcome\nIré recordando lo que ${single ? "me cuentes" : "me contéis"} para ayudar mejor; podéis consultar o borrar lo guardado.`);
    }
    return;
  }
  if (msg.from?.is_bot) return;
  if (msg.voice) {
    if (msg.chat.type !== "private" && String(msg.chat.id) !== GROUP_CHAT && !isBotTriggered(msg)) return;
    const access = await checkAccess(msg.from.id, msg.from.username);
    if (!access.allowed) { await sendMessage(msg.chat.id, access.reason); return; }
    await sendMessage(msg.chat.id, "Te escucho; estoy pasando tu nota de voz a texto para responderte.");
    try { msg.text = await transcribeVoice(msg.voice); }
    catch (error) { await sendMessage(msg.chat.id, error.message); return; }
  }
  const imageDocument = /^(?:image\/(?:png|jpeg|webp))$/.test(msg.document?.mime_type || '') || /\.(?:png|jpe?g|webp)$/i.test(msg.document?.file_name || '');
  if (!msg.text && !msg.caption && !msg.photo?.length && !imageDocument) return;
  if (!msg.text) msg.text = msg.caption || "Usa esta foto como referencia para mi próxima petición.";

  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
  const userId = msg.from?.id;
  const username = msg.from?.username;

  // Handle commands first
  const cmd = msg.text.trim().toLowerCase();
  const ownerReport = cmd.match(/^\/(actividad|gasto)(?:@socialbananabot)?$/);
  if (ownerReport) {
    if (userId !== OWNER_ID) await sendMessage(chatId, "Este comando está reservado al administrador.");
    else if (isGroup) await sendMessage(chatId, "Te lo paso solo por privado: escríbeme el comando allí.");
    else await sendMessage(chatId, await (ownerReport[1] === "gasto" ? spendReport() : activityReport()));
    return;
  }
  if (/^\/fotos(?:@socialbananabot)?$/.test(cmd)) {
    if (isGroup) { await sendMessage(chatId, "Tus fotos son privadas. Pídemelas aquí: https://t.me/SocialBananaBot?start=welcome"); return; }
    const library = (await memoryRequest(chatId, userId)).library || [];
    if (!library.length) { await sendMessage(chatId, "Aún no tienes fotos guardadas. Mándamelas y dime que las guarde."); return; }
    await sendMessage(chatId, `Tienes ${library.length} ${library.length === 1 ? "foto guardada" : "fotos guardadas"}.${library.length > 10 ? " Te enseño las 10 más recientes." : ""}`);
    for (const fileId of library.slice(-10)) await sendPhoto(chatId, fileId);
    return;
  }
  const helpCommand = msg.text.trim().match(/^\/(?:help|ayuda)(?:@socialbananabot)?(?:\s+(.+))?$/i) || (/^\/start(?:@socialbananabot)?\s+help$/.test(cmd) ? [] : null);
  if (helpCommand) {
    await sendMessage(chatId, await helpMessage({ argument: helpCommand[1] || "", isGroup, isOwner: userId === OWNER_ID }));
    return;
  }
  const trackedCommand = [[/^\/reclamar|^\/start\s+reclamar/, "claim"], [/^\/referir|^\/start\s+referir/, "referral"], [/^\/cuenta|^\/start\s+cuenta/, "account"], [/^\/plan/, "plan_view"], [/^\/hecho/, "task_done"], [/^\/recordatorios/, "reminders"], [/^\/(?:instagram|conectarinstagram|desconectarinstagram)/, "instagram"]].find(([pattern]) => pattern.test(cmd));
  notifyAction(trackedCommand ? trackedCommand[1] : "chat");
  if (/^\/estadoia(?:@socialbananabot)?$/.test(cmd)) {
    if (userId !== OWNER_ID) { await sendMessage(chatId, 'La comprobación técnica está reservada al administrador. Si una petición te ha fallado, cuéntame cuál para retomarla.'); return; }
    if (isGroup) { await sendMessage(chatId, 'Escríbeme /estadoia por privado y compruebo las conexiones.'); return; }
    await sendMessage(chatId, 'Compruebo las conexiones. Puede tardar hasta 15 segundos.');
    await sendMessage(chatId, await checkAiServices(userId));
    return;
  }
  if (/^\/cuenta(?:@socialbananabot)?$/.test(cmd)) {
    if (isGroup) await sendMessage(chatId, "Vinculamos tu cuenta por privado: https://t.me/SocialBananaBot?start=cuenta");
    else await sendMessage(chatId, await createAccountLink(userId, username));
    return;
  }
  if (/^\/reclamar(?:@socialbananabot)?$/.test(cmd) || /^\/start(?:@socialbananabot)?\s+reclamar$/.test(cmd)) {
    if (isGroup) await sendMessage(chatId, "Se reclama por privado: https://t.me/SocialBananaBot?start=reclamar");
    else await sendMessage(chatId, await claimInstagramTrial(userId));
    return;
  }
  const releaseCommand = cmd.match(/^\/(plan|hecho|recordatorios)(?:@socialbananabot)?(?:\s+(\S+))?$/);
  if (releaseCommand) {
    if (isGroup) { await sendMessage(chatId, "Tu plan es privado. Seguimos aquí: https://t.me/SocialBananaBot?start=welcome"); return; }
    const [, action, value] = releaseCommand;
    if (action === "plan") await sendMessage(chatId, await releasePlanSummary(userId));
    else if (action === "hecho") await sendMessage(chatId, /^\d+$/.test(value || "") ? await completeReleaseTask(userId, Number(value)) : "Dime el número de la tarea, por ejemplo: /hecho 2");
    else if (value === "on" || value === "off") await sendMessage(chatId, await setReleaseReminders(userId, value === "on"));
    else await sendMessage(chatId, "Usa /recordatorios on o /recordatorios off.");
    return;
  }
  if (/^\/referir(?:@socialbananabot)?$/.test(cmd) || /^\/start(?:@socialbananabot)?\s+referir$/.test(cmd)) {
    if (isGroup) await sendMessage(chatId, "Te paso tu enlace de invitación por privado: https://t.me/SocialBananaBot?start=referir");
    else await sendMessage(chatId, await referralSummary(userId, username));
    return;
  }
  const referralStart = cmd.match(/^\/start(?:@socialbananabot)?\s+ref_([a-f0-9]{10})$/);
  if (referralStart) {
    if (!isGroup) await sendMessage(chatId, await claimReferral(referralStart[1], userId, username));
    if (isGroup) return;
  }
  if (/^\/start(?:@socialbananabot)?\s+cuenta$/.test(cmd)) {
    if (!isGroup) await sendMessage(chatId, await createAccountLink(userId, username));
    return;
  }
  const instagramCommand = /^\/(?:instagram|conectarinstagram|desconectarinstagram)(?:@socialbananabot)?(?:\s|$)/i.test(cmd) || /^\/start(?:@socialbananabot)?\s+instagram(?:_check)?$/.test(cmd);
  if (instagramCommand) {
    if (isGroup) {
      await sendMessage(chatId, "Conectamos tu cuenta por privado para mantener tus datos separados: https://t.me/SocialBananaBot?start=instagram");
      return;
    }
    try {
      if (cmd.startsWith("/desconectarinstagram")) {
        await disableConnection(userId);
        await sendMessage(chatId, "He desactivado el acceso de Banana a tu Instagram. Esto no borra publicaciones ni cancela contenido programado. Puedes revocar también PostZen desde las aplicaciones autorizadas de Instagram.");
      } else if (/verificar|instagram_check/.test(cmd)) {
        const linked = await verifyConnection(userId);
        await sendMessage(chatId, `Cuenta conectada: ${linked.username}. Ya puedes pedirme que analice tu Instagram o prepare borradores para tu próximo lanzamiento. No publicaré por mi cuenta.`);
      } else {
        const linked = await connection(userId);
        if (linked?.status === "active") {
          await sendMessage(chatId, `Tu cuenta vinculada es ${linked.username}. Usa /instagram verificar para comprobarla, /instagram reconectar para renovar permisos o /desconectarinstagram para desactivar el acceso.`);
          if (!cmd.includes("reconectar")) return;
        }
        const url = await beginConnection(userId);
        await sendMessage(chatId, "Conecta tu cuenta Creator o Business desde Instagram. No me envíes tu contraseña. Al terminar, vuelve aquí y pulsa Comprobar conexión. El enlace caduca en unos 10 minutos.", { reply_markup: { inline_keyboard: [[{ text: "Conectar mi Instagram", url }], [{ text: "Comprobar conexión", url: "https://t.me/SocialBananaBot?start=instagram_check" }]] } });
      }
    } catch (error) { await sendMessage(chatId, error.message); }
    return;
  }
  if (/^\/start(?:@socialbananabot)?(?:\s|$)/i.test(cmd)) {
    await sendMessage(chatId, `¡Hola${msg.from?.first_name ? ", " + msg.from.first_name : ""}! Aquí podemos hablar de tu proyecto con calma. ${PRIVACY_NOTICE} ¿Qué tipo de contenido creas, o te gustaría empezar a crear?\n\nIré recordando tus preferencias para ayudarte mejor. Puedes consultar lo guardado con /mimemoria o borrarlo con /olvidame.`);
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
    await sendMessage(chatId, "Las altas de pago todavía no están activadas en este bot. No te enviaré a pagar hasta que la suscripción y sus permisos estén comprobados.");
    return;
  }

  // In private, check access
  if (!isGroup && !["/mimemoria", "/olvidame"].includes(cmd)) {
    const access = await checkAccess(userId, username);
    if (!access.allowed) {
      await sendMessage(chatId, access.reason);
      return;
    }
  }

  // Our creator group is conversational; other groups still require a mention/reply.
  if (isGroup) {
    if (!isBotTriggered(msg)) return;
    if (!["/mimemoria", "/olvidame"].includes(cmd)) {
      const access = await checkAccess(userId, username);
      if (!access.allowed) { await sendMessage(chatId, access.reason); return; }
    }
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
    await forgetCreativeMemory(userId);
    await sendMessage(chatId, "He borrado tu ficha creativa y la memoria de nuestras conversaciones, incluidas las referencias a tus fotos. Tu cuenta, suscripción y consumo de créditos se conservan.");
    return;
  }
  // Only the user's private chat may load facts learned in other conversations.
  if (!isGroup) state.profile = { ...state.profile, ...await privateProfile(userId) };
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
  let imageReservation = null, imageDelivered = false;
  const typingTimer = setInterval(() => sendTyping(chatId).catch(() => {}), 4500);
  const progressTimer = setTimeout(() => sendMessage(chatId, "Sigo trabajando en ello. Te aviso aquí cuando esté listo o si surge algún problema.").catch(() => {}), 45_000);
  const record = (role, content) => {
    state.history.push({ role, content });
    state.history = state.history.slice(-40);
  };
  try {
    const photos = msg.photo || msg.reply_to_message?.photo;
    const repliedDocument = msg.reply_to_message?.document;
    const newFileId = photos?.at(-1)?.file_id || (imageDocument ? msg.document.file_id : /image\/(png|jpeg|webp)/.test(repliedDocument?.mime_type || '') ? repliedDocument.file_id : null);
    if (newFileId && newFileId !== state.reference?.fileId) {
      state.reference = { fileId: newFileId, hasFace: null, photorealistic: null, identity: null };
      state.pendingPrompt = msg.caption || (msg.photo ? null : text);
      state.lastPrompt = null;
      state.coverDraft = null;
      state.awaitingFaceAnswer = false;
    }
    if (isPhotoOnly(msg) && newFileId) {
      const count = addUpload(state, newFileId);
      await memoryRequest(chatId, userId, "POST", state);
      scheduleUploadQuestion(`${chatId}:${userId}`, count, question => sendMessage(chatId, question));
      return;
    }
    if (state.pendingUploads?.length && wantsToSave(text)) {
      const saved = saveUploads(state);
      record("user", text);
      const reply = `Hecho, ${saved === 1 ? "foto guardada" : `${saved} fotos guardadas`} para tus publicaciones. Tienes ${state.library.length} en total; míralas cuando quieras con /fotos.`;
      record("assistant", reply);
      await memoryRequest(chatId, userId, "POST", state);
      await sendMessage(chatId, reply);
      return;
    }
    if (state.pendingUploads?.length && wantsToDiscard(text)) {
      state.pendingUploads = [];
      record("user", text);
      record("assistant", "De acuerdo, no las guardo.");
      await memoryRequest(chatId, userId, "POST", state);
      await sendMessage(chatId, "De acuerdo, no las guardo.");
      return;
    }
    if (state.awaitingFaceAnswer && !answersFaceQuestion(text)) {
      state.awaitingFaceAnswer = false;
      state.pendingPrompt = null;
    }
    let imageUrl = null;
    if (state.reference) {
      imageUrl = await getFileUrl(state.reference.fileId);
      if (!imageUrl) throw new Error("Reference unavailable");
      if (state.reference.hasFace === null && wantsNewImage(text)) {
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
    if (imageUrl && /^(?:por favor[, ]+)?(?:qu[ií]ta(?:le|me)?\s+(?:el\s+)?fondo|elimina\s+(?:el\s+)?fondo|cambia\s+(?:el\s+)?fondo|haz(?:lo)?\s+transparente)/i.test(text)) directPrompt = text;
    if (state.coverDraft?.pending) directPrompt = text;
    if (directPrompt) directPrompt += "\n" + photoStyle;
    const context = null;
    const community = isGroup ? await groupConversationContext(chatId).catch(() => []) : [];
    record("user", text);
    await memoryRequest(chatId, userId, "POST", state);
    if (await userLimitReached(userId)) { await sendMessage(chatId, USER_LIMIT_MESSAGE); return; }
    const instagramTask = /^(?:\/ig[-_]|analiza mi instagram|audita mi instagram)/i.test(msg.text);
    const reply = instagramTask ? await (async () => {
      if (isGroup) return { text: "Seguimos con tu cuenta por privado: https://t.me/SocialBananaBot?start=instagram" };
      await sendMessage(chatId, "Voy a revisar tu petición con las herramientas de Instagram. Puede llevar 1–2 minutos; te cuento aquí el resultado.");
      const result = await runInstagramAgent(msg.text, JSON.stringify(state.history.slice(-8)), { userId, mediaFiles: { generated: state.generatedFileId, reference: state.reference?.fileId }, profile: state.profile, requestId: String(update.update_id || msg.message_id || "") });
      return { text: result.response };
    })() : await chat(text, context, imageUrl, state.history, {
      mediaFiles: { generated: state.generatedFileId, reference: state.reference?.fileId }, userId, requestId: String(update.update_id || msg.message_id || ""), directPrompt, photoStyle, profile: state.profile, isOwner: userId === OWNER_ID, isGroup, community,
      beforeImage: async () => {
        try { imageReservation = await reserveImage(userId, username); return null; }
        catch (error) { return error.message; }
      },
      prepareImage: async prompt => {
        const brief = await resolveCoverBrief(text, state.coverDraft, { history: state.history, hasReference: Boolean(imageUrl) });
        if (brief.unrelated) { state.coverDraft = null; return { chatInstead: true }; }
        state.coverDraft = brief.draft ? { ...brief.draft, pending: Boolean(brief.text) } : null;
        if (brief.text) return { text: brief.text };
        return { prompt: brief.prompt + "\n" + photoStyle, kind: brief.kind, background: brief.background };
      },
      onProgress: async (kind, details) => sendMessage(chatId, kind === "image"
        ? (details?.background === 'transparent' ? "Voy a quitar el fondo y entregarte un PNG con transparencia, en calidad PRO máxima" : "Me pongo con " + (details?.kind === 'music_cover' ? "tu portada" : "el diseño") + " en calidad PRO máxima") + (imageUrl ? ", usando tu imagen original" : "") + ". Puede tardar aproximadamente 1–4 minutos. Te la envío aquí en cuanto termine."
        : "Voy a revisar los datos y preparar una propuesta con contexto. Puede llevar aproximadamente 1–2 minutos."),
    });
    if (reply.profile) {
      await saveProfileChanges(userId, state.profile, reply.profile);
      state.profile = { ...state.profile, ...reply.profile };
    }
    if (reply.image) state.lastPrompt = reply.image.prompt;
    record("assistant", reply.text);
    await memoryRequest(chatId, userId, "POST", state);
    if (reply.image) {
      const deliverImage = reply.image.background === 'transparent' ? sendImageDocument : sendPhoto;
      const delivered = await deliverImage(chatId, Buffer.from(reply.image.imageBase64, "base64"), reply.text);
      imageDelivered = true;
      try { await finishImage(userId, imageReservation, true); imageReservation = null; }
      catch { console.error("[image] credit settlement pending retry"); }
      const delivery = await delivered.json();
      if (delivery.result?.photo?.length) {
        state.generatedFileId = delivery.result.photo.at(-1).file_id;
        await memoryRequest(chatId, userId, "POST", state);
      }
      if (delivery.result?.document?.file_id) {
        state.generatedFileId = delivery.result.document.file_id;
        await memoryRequest(chatId, userId, "POST", state);
      }
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
    if (userId !== OWNER_ID) await incrementUsage(userId).catch(() => console.error("[usage] increment failed"));
    console.log(`[bot] reply delivered chat=${chatId} image=${Boolean(reply.image)}`);
  } catch (error) {
    if (!imageDelivered) throw error;
    console.error('[image] post-delivery save failed', error.name);
    await sendMessage(chatId, 'La portada está entregada aquí. Ha fallado el guardado de parte del encargo; conserva la imagen de este mensaje.').catch(() => {});
  } finally {
    if (imageReservation) await finishImage(userId, imageReservation, imageDelivered).catch(() => console.error("[image] credit settlement failed"));
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
