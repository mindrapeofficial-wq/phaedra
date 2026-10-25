import { createHash, timingSafeEqual } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { validToken } from '../lib/validation.mjs';

export function sqlClient() {
  if (!process.env.DATABASE_URL) throw new Error('CHAT_DATABASE_UNCONFIGURED');
  return neon(process.env.DATABASE_URL);
}

export function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

export function sameOrigin(req) {
  if (!req.headers.origin) return true;
  try {
    const origin = new URL(req.headers.origin);
    return (origin.protocol === 'https:' || origin.hostname === 'localhost') &&
      origin.host === req.headers.host;
  } catch {
    return false;
  }
}

export function bodyOf(req) {
  let obj = req.body;
  if (Buffer.isBuffer(obj)) obj = obj.toString('utf8');
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  if (Buffer.byteLength(JSON.stringify(obj), 'utf8') > 4096) return null;
  return obj;
}

export function digest(v) {
  return createHash('sha256').update(v).digest('hex');
}

export function remoteKey(req) {
  if (!process.env.CHAT_IP_PEPPER) throw new Error('CHAT_PEPPER_UNCONFIGURED');
  const value = String(
    req.headers['x-vercel-forwarded-for'] ||
    req.headers['x-forwarded-for'] ||
    req.socket?.remoteAddress || 'unknown'
  ).split(',')[0].trim().slice(0, 100);
  return digest(process.env.CHAT_IP_PEPPER + ':' + value);
}

export function secureEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
}

export async function sessionFor(req, sql) {
  const matched = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
  if (!matched || !validToken(matched[1])) return null;
  const hash = digest(matched[1]);
  const rows = await sql`SELECT token_hash, nickname, ip_hash, room
    FROM phaedra_chat_sessions
    WHERE token_hash = ${hash} AND expires_at > NOW()`;
  return rows[0] || null;
}

export function noMethod(res) {
  res.setHeader('Allow', 'GET, POST');
  return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
}
