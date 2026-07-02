import crypto from 'node:crypto';
import { q } from '../db.js';

export const uid = (prefix = '') => (prefix ? `${prefix}_` : '') + crypto.randomBytes(12).toString('hex');
export const token = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

export const slugify = (name) =>
  String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// base58 (Bitcoin/Solana alphabet) for public keys
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(buf) {
  let n = BigInt('0x' + Buffer.from(buf).toString('hex'));
  let out = '';
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of buf) { if (b === 0) out = '1' + out; else break; }
  return out;
}

export function audit(actorId, action, targetType, targetId, detail, ip) {
  q.run(
    'INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail, ip) VALUES (?,?,?,?,?,?)',
    actorId ?? null, action, targetType ?? null, targetId ?? null,
    detail ? JSON.stringify(detail) : null, ip ?? null
  );
}

export const nowPlus = (seconds) => new Date(Date.now() + seconds * 1000).toISOString().replace('T', ' ').slice(0, 19);

export function parseJsonArray(value) {
  try { const v = JSON.parse(value || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
