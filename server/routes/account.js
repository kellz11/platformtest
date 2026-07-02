import { Router } from 'express';
import { q } from '../db.js';
import { audit, httpError } from '../lib/util.js';
import { requireAuth } from '../lib/auth.js';

const router = Router();

// ── Own account ───────────────────────────────────────────────────────────
router.get('/settings', requireAuth, (req, res) => {
  const p = q.get('SELECT display_name, bio, avatar_path, is_private, show_wallet FROM profiles WHERE user_id = ?', req.user.id);
  res.json({
    email: req.user.email,
    username: req.user.username,
    email_verified: !!req.user.email_verified_at,
    profile: p || {},
  });
});

router.patch('/settings', requireAuth, (req, res, next) => {
  try {
    const { display_name, bio, is_private, show_wallet } = req.body || {};
    if (display_name !== undefined && String(display_name).length > 60) throw httpError(400, 'Display name is too long.');
    if (bio !== undefined && String(bio).length > 500) throw httpError(400, 'Bio must be 500 characters or less.');
    const p = q.get('SELECT * FROM profiles WHERE user_id = ?', req.user.id);
    q.run(
      'UPDATE profiles SET display_name = ?, bio = ?, is_private = ?, show_wallet = ? WHERE user_id = ?',
      display_name !== undefined ? String(display_name).trim() : p.display_name,
      bio !== undefined ? String(bio).trim() : p.bio,
      is_private !== undefined ? (is_private ? 1 : 0) : p.is_private,
      show_wallet !== undefined ? (show_wallet ? 1 : 0) : p.show_wallet,
      req.user.id
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Advanced → Digital Wallet. Only the OWNER can read their own address.
router.get('/wallet', requireAuth, (req, res) => {
  const w = q.get('SELECT provider, public_address, status, created_at FROM wallet_associations WHERE user_id = ?', req.user.id);
  res.json({
    wallet: w ? {
      public_address: w.public_address,
      status: w.status,
      provider: w.provider === 'local-dev' ? 'development' : w.provider,
      created_at: w.created_at,
    } : null,
    explanation: 'CORE provisions a Solana wallet for your account so the platform can allocate future community rewards. You never need to buy cryptocurrency, deposit funds, or manage keys — key material is protected by the wallet provider and is never stored by CORE. This address is private unless you choose to share it.',
  });
});

// ── Public profiles ───────────────────────────────────────────────────────
router.get('/users/:username', (req, res, next) => {
  try {
    const u = q.get(
      `SELECT u.id, u.username, u.created_at, u.status, p.display_name, p.bio, p.avatar_path, p.is_private
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.username = ?`, req.params.username
    );
    if (!u || u.status === 'deleted') throw httpError(404, 'User not found.');
    const out = {
      username: u.username,
      display_name: u.display_name,
      bio: u.bio,
      avatar_path: u.avatar_path,
      member_since: u.created_at,
    };
    if (!u.is_private) {
      out.followed_cores = q.all(
        `SELECT c.slug, c.name, c.verification_status FROM community_memberships m
         JOIN cores c ON c.id = m.core_id WHERE m.user_id = ? AND c.archived = 0 ORDER BY m.joined_at DESC LIMIT 50`, u.id);
      out.roles = q.all(
        `SELECT c.slug, c.name, r.role FROM community_roles r JOIN cores c ON c.id = r.core_id WHERE r.user_id = ?`, u.id);
      out.recent_posts = q.all(
        `SELECT p.id, p.body, p.kind, p.created_at, c.slug AS core_slug, c.name AS core_name
         FROM posts p JOIN cores c ON c.id = p.core_id
         WHERE p.user_id = ? AND p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 20`, u.id);
    }
    res.json({ profile: out });
  } catch (err) { next(err); }
});

export default router;
