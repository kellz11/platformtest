import crypto from 'node:crypto';
import { q } from '../db.js';
import { sha256, token, nowPlus, httpError } from './util.js';

const SESSION_COOKIE = 'core_session';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

// ── Password hashing (scrypt, no native deps) ────────────────────────────
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = crypto.scryptSync(password, salt, expected.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

// ── Sessions (opaque token; only the hash is stored) ─────────────────────
export function createSession(res, userId, req) {
  const raw = token(32);
  q.run(
    'INSERT INTO sessions (id, user_id, expires_at, ip, user_agent) VALUES (?,?,?,?,?)',
    sha256(raw), userId, nowPlus(SESSION_TTL), req?.ip ?? null, req?.get?.('user-agent')?.slice(0, 250) ?? null
  );
  res.cookie?.(SESSION_COOKIE, raw); // express-less fallback below
  res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, raw, SESSION_TTL));
  return raw;
}

export function destroySession(req, res) {
  const raw = readCookie(req, SESSION_COOKIE);
  if (raw) q.run('DELETE FROM sessions WHERE id = ?', sha256(raw));
  res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', 0));
}

function serializeCookie(name, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

// ── Middleware ────────────────────────────────────────────────────────────
export function attachUser(req, _res, next) {
  req.user = null;
  const raw = readCookie(req, SESSION_COOKIE);
  if (raw) {
    const row = q.get(
      `SELECT u.id, u.email, u.username, u.role, u.status, u.email_verified_at,
              p.display_name, p.avatar_path
       FROM sessions s JOIN users u ON u.id = s.user_id
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE s.id = ? AND s.expires_at > datetime('now')`, sha256(raw)
    );
    if (row && row.status === 'active') req.user = row;
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(httpError(401, 'Sign in required.'));
  next();
}

export function requireVerifiedEmail(req, _res, next) {
  if (!req.user) return next(httpError(401, 'Sign in required.'));
  if (!req.user.email_verified_at) return next(httpError(403, 'Please verify your email address first.'));
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(httpError(401, 'Sign in required.'));
  if (req.user.role !== 'admin') return next(httpError(403, 'Administrator access required.'));
  next();
}

// role: 'manager' allows managers only; 'moderator' allows managers OR moderators
export function coreRole(userId, coreId) {
  if (!userId) return null;
  const rows = q.all('SELECT role FROM community_roles WHERE core_id = ? AND user_id = ?', coreId, userId);
  if (rows.some((r) => r.role === 'manager')) return 'manager';
  if (rows.some((r) => r.role === 'moderator')) return 'moderator';
  return null;
}

export function canModerate(user, coreId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return coreRole(user.id, coreId) !== null;
}

export function canManage(user, coreId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return coreRole(user.id, coreId) === 'manager';
}
