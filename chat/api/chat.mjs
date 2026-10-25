import { randomBytes } from 'node:crypto';
import { bodyOf, digest, json, noMethod, remoteKey, sameOrigin, secureEqual, sessionFor, sqlClient } from '../lib/server.mjs';
import { ROOMS, normalizeMessage, normalizeNickname, validAfter, validRoom } from '../lib/validation.mjs';

const MAX_DAILY_MESSAGES = 120;
const MESSAGE_WINDOW_SECONDS = 3;

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return noMethod(res);
  if (req.method === 'POST' && !sameOrigin(req)) return json(res, 403, { error: 'INVALID_ORIGIN' });
  const action = new URL(req.url, 'https://chat.local').searchParams.get('action') || '';
  const params = new URL(req.url, 'https://chat.local').searchParams;
  try {
    if (req.method === 'GET' && action === 'rooms') return json(res, 200, { rooms: ROOMS });
    const sql = sqlClient();

    if (req.method === 'GET' && action === 'health') {
      const rows = await sql`SELECT 1 AS ok`;
      return json(res, rows[0]?.ok === 1 ? 200 : 503, { ok: rows[0]?.ok === 1, app: 'phaedra-chat' });
    }

    if (req.method === 'POST' && action === 'join') {
      const body = bodyOf(req);
      const nickname = normalizeNickname(body?.nickname);
      if (!nickname) return json(res, 400, { error: 'INVALID_NICKNAME' });
      const ipHash = remoteKey(req);
      const recent = await sql`SELECT COUNT(*)::int AS count
        FROM phaedra_chat_sessions WHERE ip_hash = ${ipHash}
        AND created_at > NOW() - INTERVAL '1 hour'`;
      if (recent[0]?.count >= 8) return json(res, 429, { error: 'TOO_MANY_JOINS' });
      const token = randomBytes(32).toString('hex');
      const tokenHash = digest(token);
      await sql`INSERT INTO phaedra_chat_sessions
        (token_hash, nickname, ip_hash, expires_at)
        VALUES (${tokenHash}, ${nickname}, ${ipHash}, NOW() + INTERVAL '7 days')`;
      return json(res, 201, { token, nickname, expiresInDays: 7 });
    }

    if (req.method === 'GET' && action === 'messages') {
      const room = params.get('room') || 'general';
      const after = validAfter(params.get('after') || '0');
      if (!validRoom(room) || after === null) return json(res, 400, { error: 'INVALID_QUERY' });
      let rows;
      if (after > 0) {
        rows = await sql`SELECT id::text AS id, nickname AS nick, body, at
          FROM phaedra_chat_messages WHERE room = ${room}
          AND id > ${after} AND hidden = FALSE ORDER BY id ASC LIMIT 75`;
      } else {
        rows = await sql`SELECT id::text AS id, nickname AS nick, body, at
          FROM phaedra_chat_messages WHERE room = ${room}
          AND hidden = FALSE ORDER BY id DESC LIMIT 75`;
        rows.reverse();
      }
      return json(res, 200, { room, messages: rows });
    }

    if (req.method === 'GET' && action === 'presence') {
      const room = params.get('room') || 'general';
      if (!validRoom(room)) return json(res, 400, { error: 'INVALID_ROOM' });
      const rows = await sql`SELECT nickname
        FROM phaedra_chat_sessions
        WHERE room = ${room} AND last_seen > NOW() - INTERVAL '65 seconds'
        AND expires_at > NOW() ORDER BY last_seen DESC LIMIT 60`;
      return json(res, 200, { room, online: rows.length, nicknames: rows.map(r => r.nickname) });
    }

    if (req.method === 'POST' && action === 'moderate') {
      if (!process.env.CHAT_ADMIN_KEY) return json(res, 503, { error: 'MODERATION_NOT_CONFIGURED' });
      if (!secureEqual(req.headers['x-phaedra-admin-key'], process.env.CHAT_ADMIN_KEY)) {
        return json(res, 403, { error: 'FORBIDDEN' });
      }
      const body = bodyOf(req);
      const id = validAfter(body?.id);
      if (!id || body?.hidden !== true) return json(res, 400, { error: 'INVALID_MODERATION' });
      const rows = await sql`UPDATE phaedra_chat_messages SET hidden = TRUE
        WHERE id = ${id} RETURNING id::text AS id`;
      return json(res, rows.length ? 200 : 404, { ok: rows.length > 0 });
    }

    const session = await sessionFor(req, sql);
    if (!session) return json(res, 401, { error: 'LOGIN_REQUIRED' });

    if (req.method === 'GET' && action === 'me') {
      return json(res, 200, { nickname: session.nickname, room: session.room });
    }

    if (req.method === 'POST' && action === 'heartbeat') {
      const body = bodyOf(req);
      const room = body?.room || 'general';
      if (!validRoom(room)) return json(res, 400, { error: 'INVALID_ROOM' });
      await sql`UPDATE phaedra_chat_sessions SET last_seen = NOW(), room = ${room}
        WHERE token_hash = ${session.token_hash}`;
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && action === 'send') {
      const body = bodyOf(req);
      const room = body?.room;
      const text = normalizeMessage(body?.body);
      if (!validRoom(room) || !text) return json(res, 400, { error: 'INVALID_MESSAGE' });
      const bucket = Math.floor(Date.now() / (MESSAGE_WINDOW_SECONDS * 1000));
      const hash = session.token_hash;
      const rows = await sql`INSERT INTO phaedra_chat_messages
          (room, nickname, author_hash, ip_hash, body, rate_bucket)
        SELECT ${room}, ${session.nickname}, ${hash}, ${session.ip_hash}, ${text}, ${bucket}
        WHERE (SELECT COUNT(*) FROM phaedra_chat_messages
          WHERE ip_hash = ${session.ip_hash} AND at > NOW() - INTERVAL '1 day')
          < ${MAX_DAILY_MESSAGES}
        ON CONFLICT (ip_hash, rate_bucket) DO NOTHING
        RETURNING id::text AS id, nickname AS nick, body, at`;
      if (!rows.length) return json(res, 429, { error: 'SLOW_DOWN' });
      await sql`UPDATE phaedra_chat_sessions SET last_seen = NOW(), room = ${room}
        WHERE token_hash = ${hash}`;
      return json(res, 201, { message: rows[0] });
    }

    if (req.method === 'POST' && action === 'logout') {
      await sql`DELETE FROM phaedra_chat_sessions WHERE token_hash = ${session.token_hash}`;
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'UNKNOWN_ACTION' });
  } catch (error) {
    console.error('Phaedra chat request failed:', error?.message || 'unknown');
    return json(res, error?.message?.endsWith('UNCONFIGURED') ? 503 : 500, {
      error: 'CHAT_UNAVAILABLE',
    });
  }
}
