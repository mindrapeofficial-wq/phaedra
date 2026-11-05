const RESERVED = /^(?:emil|banana|social banana)$/i;
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The owner is left out so that no personal account gets linked from a group message.
export function mentionPeople(community = [], ownerId, sender) {
  const byName = new Map(), ambiguous = new Set();
  for (const { userId, name, username } of community) {
    const clean = String(name || '').trim();
    if (!clean || Number(userId) === Number(ownerId) || RESERVED.test(clean)) continue;
    const known = byName.get(clean);
    if (known && known.id !== userId) ambiguous.add(clean);
    byName.set(clean, { id: userId, name: clean, username });
  }
  for (const name of ambiguous) byName.delete(name);
  const senderName = String(sender?.first_name || '').trim();
  if (senderName && Number(sender.id) !== Number(ownerId) && !RESERVED.test(senderName)) byName.set(senderName, { id: sender.id, name: senderName, username: sender.username });
  // People are often addressed by their first name alone: "Weslie" for "Weslie Snaips".
  const people = [...byName.values()];
  const firstNames = new Map();
  for (const person of people) {
    const first = person.name.split(/\s+/)[0];
    if (first === person.name || first.length < 3 || byName.has(first)) continue;
    firstNames.set(first, firstNames.has(first) ? null : person);
  }
  for (const [name, person] of firstNames) if (person) people.push({ ...person, name });
  return people;
}

// People with a username get a real @username. Without one, Telegram can still notify them through a linked @Name.
export function applyMentions(text, people = []) {
  if (!people.length) return { text };
  const byName = new Map(people.map(person => [person.name, person]));
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join('|');
  const pattern = new RegExp(`https?://\\S+|(?<![\\p{L}\\p{N}_@])@?(${names})(?![\\p{L}\\p{N}_])`, 'gu');
  const entities = [];
  let output = '', last = 0;
  for (const match of text.matchAll(pattern)) {
    if (!match[1]) continue;
    const person = byName.get(match[1]);
    output += text.slice(last, match.index);
    last = match.index + match[0].length;
    if (person.username) { output += `@${person.username}`; continue; }
    const label = `@${person.name}`;
    entities.push({ type: 'text_mention', offset: output.length, length: label.length, user: { id: Number(person.id) } });
    output += label;
  }
  output += text.slice(last);
  return entities.length ? { text: output, entities } : { text: output };
}
