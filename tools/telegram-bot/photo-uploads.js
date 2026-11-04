const MAX_LIBRARY = 100;
const ACK_DELAY_MS = 3000;
const ackTimers = new Map();

export const isPhotoOnly = message => Boolean((message.photo?.length || /^image\/(?:png|jpeg|webp)$/.test(message.document?.mime_type || '')) && !message.caption);
export const wantsNewImage = text => /portada|car[aá]tula|cover|fotorreal|genera|crea(?:me)?\s+(?:una\s+)?(?:imagen|foto)|haz(?:me)?\s+(?:una\s+)?(?:imagen|foto|portada)|dise[ñn]a/i.test(text);
export const answersFaceQuestion = text => /soy yo|es mi cara|soy el de|soy la de|otra persona|no soy yo|es mi (?:amig|herman|pareja|cliente)|fotorreal|realista|estilizad|ilustraci|anime|caricatura|^(?:s[ií]|no)\b/i.test(text.trim());
export const wantsToSave = text => !/no\s+(?:las?\s+|los?\s+)?guard/i.test(text) && /guard|gu[aá]rda|para\s+(?:publicaciones|m[aá]s adelante|despu[eé]s|luego|el futuro)|publicaciones futuras/i.test(text);
export const wantsToDiscard = text => /no\s+(?:las?\s+|los?\s+)?guard|desc[aá]rta|olv[ií]dalas|b[oó]rralas/i.test(text);

export function addUpload(state, fileId) {
  const pending = state.pendingUploads || [];
  if (!pending.includes(fileId)) pending.push(fileId);
  state.pendingUploads = pending.slice(-MAX_LIBRARY);
  return state.pendingUploads.length;
}
export function saveUploads(state) {
  const saved = state.pendingUploads || [];
  state.library = [...new Set([...(state.library || []), ...saved])].slice(-MAX_LIBRARY);
  state.pendingUploads = [];
  state.profile = { ...state.profile, savedPhotos: state.library.length };
  return saved.length;
}
export const uploadQuestion = count => count === 1
  ? 'Tengo tu foto. ¿Qué hacemos con ella? Puedo guardarla para tus publicaciones, usarla en un post o trabajar una portada a partir de ella.'
  : `Tengo tus ${count} fotos. ¿Qué hacemos con ellas? Puedo guardarlas para tus publicaciones, elegir las mejores para redes o trabajar una portada a partir de alguna.`;

// An album arrives as separate updates, so one question goes out once they stop arriving.
export function scheduleUploadQuestion(key, count, send, delay = ACK_DELAY_MS) {
  clearTimeout(ackTimers.get(key));
  ackTimers.set(key, setTimeout(() => {
    ackTimers.delete(key);
    Promise.resolve(send(uploadQuestion(count))).catch(() => console.error('[photos] question not delivered'));
  }, delay));
}
