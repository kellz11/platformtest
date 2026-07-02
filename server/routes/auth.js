import { Router } from 'express';
import { q, tx } from '../db.js';
import { uid, token, sha256, nowPlus, audit, httpError } from '../lib/util.js';
import { hashPassword, verifyPassword, createSession, destroySession, requireAuth } from '../lib/auth.js';
import { sendMail, appUrl } from '../lib/email.js';
import { rateLimit } from '../lib/ratelimit.js';
import { provisionWalletFor } from '../wallets/index.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

function publicUser(u) {
  return {
    id: u.id, email: u.email, username: u.username, role: u.role,
    email_verified: !!u.email_verified_at,
    display_name: u.display_name || null, avatar_path: u.avatar_path || null,
  };
}

// ── Register ──────────────────────────────────────────────────────────────
router.post('/register', rateLimit({ name: 'register', max: 10, windowMs: 3600_000 }), (req, res, next) => {
  try {
    const { email, password, username, display_name, accept_terms, join_code } = req.body || {};
    if (!accept_terms) throw httpError(400, 'You must accept the Terms of Service and Privacy Policy.');
    if (!EMAIL_RE.test(email || '')) throw httpError(400, 'Please enter a valid email address.');
    if (!USERNAME_RE.test(username || '')) throw httpError(400, 'Username must be 3–24 characters (letters, numbers, underscore).');
    if (!password || password.length < 8) throw httpError(400, 'Password must be at least 8 characters.');
    if (q.get('SELECT 1 FROM users WHERE email = ?', email)) throw httpError(409, 'That email is already registered.');
    if (q.get('SELECT 1 FROM users WHERE username = ?', username)) throw httpError(409, 'That username is taken.');

    const userId = uid('usr');
    const rawToken = token();
    tx(() => {
      q.run('INSERT INTO users (id, email, username) VALUES (?,?,?)', userId, email, username);
      q.run('INSERT INTO profiles (user_id, display_name) VALUES (?,?)', userId, display_name || username);
      q.run('INSERT INTO auth_identities (id, user_id, provider, password_hash) VALUES (?,?,?,?)',
        uid('aid'), userId, 'password', hashPassword(password));
      q.run('INSERT INTO auth_tokens (id, user_id, purpose, expires_at) VALUES (?,?,?,?)',
        sha256(rawToken), userId, 'verify_email', nowPlus(86400));
      // anti-abuse fingerprint
      q.run('INSERT INTO signup_fingerprints (user_id, ip_hash, ua_hash) VALUES (?,?,?)',
        userId, sha256(req.ip || ''), sha256(req.get('user-agent') || ''));
      const dupes = q.get(
        `SELECT COUNT(*) AS n FROM signup_fingerprints WHERE ip_hash = ? AND created_at > datetime('now','-1 day')`,
        sha256(req.ip || '')
      );
      if (dupes.n > 3) q.run('INSERT INTO abuse_signals (user_id, kind, detail) VALUES (?,?,?)',
        userId, 'rapid_signup', `ip created ${dupes.n} accounts in 24h`);
      // referral attribution (first touch) — membership completes after email verification
      if (join_code) {
        const link = q.get('SELECT id FROM referral_links WHERE id = ? AND active = 1', join_code);
        if (link) q.run('INSERT OR IGNORE INTO referral_attributions (link_id, user_id) VALUES (?,?)', link.id, userId);
      }
    });

    sendMail(email, 'Verify your CORE account',
      `Welcome to CORE!\n\nConfirm your email address to finish creating your account:\n${appUrl(`/?view=verify&token=${rawToken}`)}\n\nThis link expires in 24 hours.`);
    audit(userId, 'user.registered', 'user', userId, null, req.ip);
    createSession(res, userId, req);
    const u = q.get('SELECT u.*, p.display_name, p.avatar_path FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id = ?', userId);
    res.status(201).json({ user: publicUser(u), message: 'Account created. Check your email for a verification link.' });
  } catch (err) { next(err); }
});

// ── Verify email ──────────────────────────────────────────────────────────
router.post('/verify-email', (req, res, next) => {
  (async () => {
    const raw = req.body?.token;
    const row = raw && q.get(
      `SELECT * FROM auth_tokens WHERE id = ? AND purpose = 'verify_email' AND used_at IS NULL AND expires_at > datetime('now')`,
      sha256(raw)
    );
    if (!row) throw httpError(400, 'That verification link is invalid or has expired.');
    tx(() => {
      q.run('UPDATE auth_tokens SET used_at = datetime(\'now\') WHERE id = ?', row.id);
      q.run('UPDATE users SET email_verified_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?', row.user_id);
    });
    audit(row.user_id, 'user.email_verified', 'user', row.user_id, null, req.ip);

    // Background wallet provisioning — silent, non-blocking for the user experience.
    try { await provisionWalletFor(row.user_id); } catch (err) { console.error('wallet provisioning deferred:', err.message); }

    // Complete referral funnel: auto-join the referred community.
    let joinedCore = null;
    const attr = q.get(
      `SELECT r.link_id, l.core_id, c.slug, c.name FROM referral_attributions r
       JOIN referral_links l ON l.id = r.link_id JOIN cores c ON c.id = l.core_id
       WHERE r.user_id = ?`, row.user_id
    );
    if (attr) {
      q.run('INSERT OR IGNORE INTO community_memberships (core_id, user_id, referral_link_id) VALUES (?,?,?)',
        attr.core_id, row.user_id, attr.link_id);
      joinedCore = { slug: attr.slug, name: attr.name };
    }
    res.json({ ok: true, joined_core: joinedCore });
  })().catch(next);
});

router.post('/resend-verification', rateLimit({ name: 'resend', max: 5, windowMs: 3600_000 }), requireAuth, (req, res) => {
  if (req.user.email_verified_at) return res.json({ ok: true, message: 'Email already verified.' });
  const rawToken = token();
  q.run('INSERT INTO auth_tokens (id, user_id, purpose, expires_at) VALUES (?,?,?,?)',
    sha256(rawToken), req.user.id, 'verify_email', nowPlus(86400));
  sendMail(req.user.email, 'Verify your CORE account',
    `Confirm your email address:\n${appUrl(`/?view=verify&token=${rawToken}`)}`);
  res.json({ ok: true, message: 'Verification email sent.' });
});

// ── Login / logout ────────────────────────────────────────────────────────
router.post('/login', rateLimit({ name: 'login', max: 20, windowMs: 900_000 }), (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const user = q.get('SELECT u.*, p.display_name, p.avatar_path FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.email = ?', email || '');
    const identity = user && q.get(`SELECT password_hash FROM auth_identities WHERE user_id = ? AND provider = 'password'`, user.id);
    if (!user || !identity || !verifyPassword(password || '', identity.password_hash)) {
      throw httpError(401, 'Incorrect email or password.');
    }
    if (user.status === 'suspended') throw httpError(403, 'This account has been suspended.');
    createSession(res, user.id, req);
    audit(user.id, 'user.login', 'user', user.id, null, req.ip);
    res.json({ user: publicUser(user) });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user) });
});

// ── Password reset / account recovery ─────────────────────────────────────
router.post('/forgot-password', rateLimit({ name: 'forgot', max: 5, windowMs: 3600_000 }), (req, res) => {
  const user = q.get('SELECT id, email FROM users WHERE email = ?', req.body?.email || '');
  if (user) {
    const rawToken = token();
    q.run('INSERT INTO auth_tokens (id, user_id, purpose, expires_at) VALUES (?,?,?,?)',
      sha256(rawToken), user.id, 'reset_password', nowPlus(3600));
    sendMail(user.email, 'Reset your CORE password',
      `Reset your password:\n${appUrl(`/?view=reset&token=${rawToken}`)}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore it.`);
  }
  // identical response either way — no account enumeration
  res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
});

router.post('/reset-password', (req, res, next) => {
  try {
    const { token: raw, password } = req.body || {};
    if (!password || password.length < 8) throw httpError(400, 'Password must be at least 8 characters.');
    const row = raw && q.get(
      `SELECT * FROM auth_tokens WHERE id = ? AND purpose = 'reset_password' AND used_at IS NULL AND expires_at > datetime('now')`,
      sha256(raw)
    );
    if (!row) throw httpError(400, 'That reset link is invalid or has expired.');
    tx(() => {
      q.run('UPDATE auth_tokens SET used_at = datetime(\'now\') WHERE id = ?', row.id);
      q.run('UPDATE auth_identities SET password_hash = ? WHERE user_id = ? AND provider = \'password\'',
        hashPassword(password), row.user_id);
      q.run('DELETE FROM sessions WHERE user_id = ?', row.user_id); // invalidate existing sessions
    });
    audit(row.user_id, 'user.password_reset', 'user', row.user_id, null, req.ip);
    res.json({ ok: true, message: 'Password updated. You can sign in now.' });
  } catch (err) { next(err); }
});

export default router;
