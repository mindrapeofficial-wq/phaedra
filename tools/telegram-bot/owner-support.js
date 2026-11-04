const SUPPORT_MS = 2 * 3600_000;
const OWN_MS = 30 * 60_000;
const ACTIVE_MS = 2 * 3600_000;

export const wantsOwnWork = text => /\bm[ií][oa]s?\b|para m[ií]\b|m[ií] (?:encargo|portada|proyecto)/i.test(text);
export const wantsToSupport = text => /ayud|apoy|soport|support|su encargo|\bpara\s+\S+/i.test(text) && !wantsOwnWork(text);
export const endsSupport = text => /^\/soporte(?:@\w+)?(?:\s+off)?$/i.test(text.trim()) || /^(?:ya\s+)?(?:termin[eé]|acab[eé]) de ayudar|deja de ayudar/i.test(text.trim());

export function activeMembers(community, ownerId, now = Date.now()) {
  return (community || [])
    .filter(member => Number(member.userId) !== Number(ownerId) && now - Date.parse(member.updated_at) < ACTIVE_MS)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .map(member => ({ id: member.userId, name: member.name || `Usuario ${member.userId}` }));
}
export function repliedMember(msg, ownerId) {
  const from = msg.reply_to_message?.from;
  return from && !from.is_bot && Number(from.id) !== Number(ownerId) ? { id: from.id, name: from.first_name || from.username || `Usuario ${from.id}` } : null;
}
export function supportQuestion(candidates) {
  const names = candidates.map(person => person.name).join(' o ');
  return `¿Estás ayudando a ${names}, o esto es para un encargo tuyo?`;
}
function chooseTarget(text, candidates) {
  const lower = text.toLowerCase();
  return candidates.find(person => lower.includes(String(person.name).toLowerCase())) || candidates[0];
}

// Returns what to do with the owner's group message; mutates only the owner's mode fields.
export function resolveOwnerMessage(ownerState, text, candidates, now = Date.now()) {
  if (endsSupport(text)) {
    ownerState.ownerMode = null; ownerState.pendingOwnerAsk = null;
    return { action: 'ended' };
  }
  const pending = ownerState.pendingOwnerAsk;
  if (pending) {
    ownerState.pendingOwnerAsk = null;
    const mentioned = pending.candidates.some(person => text.toLowerCase().includes(String(person.name).toLowerCase()));
    if (wantsToSupport(text) || (mentioned && !wantsOwnWork(text))) {
      const target = chooseTarget(text, pending.candidates);
      ownerState.ownerMode = { type: 'support', target, until: now + SUPPORT_MS };
      return { action: 'support', target, restore: pending.message, confirmed: true };
    }
    ownerState.ownerMode = { type: 'own', until: now + OWN_MS };
    return { action: 'own', restore: wantsOwnWork(text) ? pending.message : null };
  }
  const mode = ownerState.ownerMode;
  if (mode && mode.until > now) {
    if (mode.type === 'support') { mode.until = now + SUPPORT_MS; return { action: 'support', target: mode.target }; }
    return { action: 'own' };
  }
  ownerState.ownerMode = null;
  return candidates.length ? { action: 'ask' } : { action: 'own' };
}
