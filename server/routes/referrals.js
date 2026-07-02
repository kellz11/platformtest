import { Router } from 'express';
import crypto from 'node:crypto';
import { q } from '../db.js';
import { audit, httpError } from '../lib/util.js';
import { requireAuth, canManage } from '../lib/auth.js';
import { rateLimit } from '../lib/ratelimit.js';
import { appUrl } from '../lib/email.js';
import QRCode from 'qrcode';

const router = Router();
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const makeCode = () => Array.from(crypto.randomBytes(8)).map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

// ── Manager: create / list invitation links for their community ──────────
router.post('/cores/:slug/links', requireAuth, (req, res, next) => {
  try {
    const core = q.get('SELECT * FROM cores WHERE slug = ? AND archived = 0', req.params.slug);
    if (!core) throw httpError(404, 'Core not found.');
    if (!canManage(req.user, core.id)) throw httpError(403, 'Only community managers can create invitation links.');
    const code = makeCode();
    q.run(
      'INSERT INTO referral_links (id, core_id, created_by, label, source, welcome_message) VALUES (?,?,?,?,?,?)',
      code, core.id, req.user.id,
      String(req.body?.label || '').slice(0, 120) || null,
      String(req.body?.source || '').slice(0, 40) || null,
      String(req.body?.welcome_message || '').slice(0, 1000) || null);
    audit(req.user.id, 'referral.link_created', 'core', core.id, { code });
    res.status(201).json({ ok: true, code, url: appUrl(`/join/${code}`) });
  } catch (err) { next(err); }
});

router.get('/cores/:slug/links', requireAuth, (req, res, next) => {
  try {
    const core = q.get('SELECT * FROM cores WHERE slug = ? AND archived = 0', req.params.slug);
    if (!core) throw httpError(404, 'Core not found.');
    if (!canManage(req.user, core.id)) throw httpError(403, 'Only community managers can view invitation links.');
    const rows = q.all(
      `SELECT l.id AS code, l.label, l.source, l.active, l.clicks, l.created_at,
              (SELECT COUNT(*) FROM referral_attributions a WHERE a.link_id = l.id) AS signups,
              (SELECT COUNT(*) FROM community_memberships m WHERE m.referral_link_id = l.id) AS joins
       FROM referral_links l WHERE l.core_id = ? ORDER BY l.created_at DESC`, core.id);
    res.json({ links: rows.map((l) => ({ ...l, url: appUrl(`/join/${l.code}`) })) });
  } catch (err) { next(err); }
});

// ── Public: resolve a join code for the landing page ─────────────────────
router.get('/join/:code', rateLimit({ name: 'join', max: 60, windowMs: 60_000 }), (req, res, next) => {
  try {
    const link = q.get(
      `SELECT l.id, l.welcome_message, l.source, c.slug, c.name, c.definition, c.verification_status, c.member_count, c.gallery_dir
       FROM referral_links l JOIN cores c ON c.id = l.core_id
       WHERE l.id = ? AND l.active = 1 AND c.archived = 0`, req.params.code);
    if (!link) throw httpError(404, 'That invitation link is not active.');
    q.run('UPDATE referral_links SET clicks = clicks + 1 WHERE id = ?', link.id);
    res.json({
      link: {
        code: link.id,
        welcome_message: link.welcome_message,
        core: {
          slug: link.slug, name: link.name, definition: link.definition,
          verification_status: link.verification_status, member_count: link.member_count,
          gallery_dir: link.gallery_dir,
        },
      },
    });
  } catch (err) { next(err); }
});

// ── QR code (SVG via the qrcode package) ─────────────────────────────────
router.get('/join/:code/qr.svg', (req, res, next) => {
  (async () => {
    const link = q.get('SELECT id FROM referral_links WHERE id = ? AND active = 1', req.params.code);
    if (!link) throw httpError(404, 'Not found.');
    const svg = await QRCode.toString(appUrl(`/join/${link.id}`), { type: 'svg', margin: 2, width: 320 });
    res.type('image/svg+xml').send(svg);
  })().catch(next);
});

export default router;
