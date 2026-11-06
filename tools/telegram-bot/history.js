// Only the latest turns travel verbatim to the model; older ones go as a short digest of the same person's chat.
// The private profile (ficha) is sent separately and in full, so nothing saved there depends on this history.
export const RECENT_MESSAGES = 12;
const RECENT_CHARS = 1500;
const DIGEST_CHARS = 2400;
const LINE_CHARS = { user: 220, assistant: 100 };

const text = content => typeof content === 'string' ? content
  : Array.isArray(content) ? content.filter(part => part?.type === 'text').map(part => part.text).join(' ') : '';
const clip = (value, max) => {
  const clean = text(value).replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
};

export function compactHistory(history = [], { recent = RECENT_MESSAGES } = {}) {
  const usable = history.filter(message => (message?.role === 'user' || message?.role === 'assistant') && text(message.content).trim());
  const kept = usable.slice(-recent).map(message => ({ role: message.role, content: clip(message.content, RECENT_CHARS) }));
  const older = usable.slice(0, -recent);
  const lines = [];
  let size = 0;
  // Newest older lines are kept first, so the digest loses the most distant past when it is full.
  for (const message of older.reverse()) {
    const line = `${message.role === 'user' ? 'Artista' : 'Emil'}: ${clip(message.content, LINE_CHARS[message.role])}`;
    if (size + line.length > DIGEST_CHARS) break;
    lines.unshift(line);
    size += line.length + 1;
  }
  return { digest: lines.length ? lines.join('\n') : null, recent: kept };
}
