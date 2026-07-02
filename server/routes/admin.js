// Protected administrative area. Every route requires the admin role (enforced
// at mount time in server/index.js AND here, defense in depth).
import { Router } from 'express';
import { q, tx } from '../db.js';
import { uid, token, sha256, slugify, nowPlus, audit, httpError } from '../lib/util.js';
import { requireAdmin } from '../lib/auth.js';
import { sendMail, appUrl } from '../lib/email.js';
import { corePublic } from './cores.js';

const router = Router();
router.use(requireAdmin);

const jsonArr = (v) => JSON.stringify(Array.isArray(v) ? v.map(String) : []);

// ── Core CRUD ─────────────────────────────────────────────────────────────
router.post('/cores', (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) throw httpError(400, 'Core name is required.');
    const slug = slugify(req.body.slug || name);
    if (!slug) throw httpError(400, 'Could not derive a slug.');
    if (q.get('SELECT 1 FROM cores WHERE slug = ? OR name = ?', slug, name)) throw httpError(409, 'A core with that name or slug already exists.');
    const id = uid('cor');
    q.run(
      `INSERT INTO cores (id, slug, name, definition, description, history, cultural_context,
        visual_characteristics, themes, keywords, cover_image, profile_image, gallery_dir, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, slug, String(name).trim(),
      req.body.definition || null, req.body.description || null, req.body.history || null,
      req.body.cultural_context || null, jsonArr(req.body.visual_characteristics),
      jsonArr(req.body.themes), jsonArr(req.body.keywords),
      req.body.cover_image || null, req.body.profile_image || null, req.body.gallery_dir || null,
      req.user.id);
    audit(req.user.id, 'core.created', 'core', id, { slug }, req.ip);
    res.status(201).json({ ok: true, id, slug });
  } catch (err) { next(err); }
});

router.patch('/cores/:slug', (req, res, next) => {
  try {
    const core = q.get('SELECT * FROM cores WHERE slug = ?', req.params.slug);
    if (!core) throw httpError(404, 'Core not found.');
    const fields = ['name', 'definition', 'description', 'history', 'cultural_context', 'cover_image', 'profile_image', 'gallery_dir'];
    const arrays = ['visual_characteristics', 'themes', 'keywords'];
    for (const f of fields) if (req.body[f] !== undefined) q.run(`UPDATE cores SET ${f} = ? WHERE id = ?`, req.body[f] === null ? null : String(req.body[f]), core.id);
    for (const f of arrays) if (req.body[f] !== undefined) q.run(`UPDATE cores SET ${f} = ? WHERE id = ?`, jsonArr(req.body[f]), core.id);
    if (req.body.archived !== undefined) q.run('UPDATE cores SET archived = ? WHERE id = ?', req.body.archived ? 1 : 0, core.id);
    q.run('UPDATE cores SET updated_at = datetime(\'now\') WHERE id = ?', core.id);
    audit(req.user.id, 'core.updated', 'core', core.id, { fields: Object.keys(req.body) }, req.ip);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/cores/:slug', (req, res, next) => {
  try {
    const core = q.get('SELECT * FROM cores WHERE slug = ?', req.params.slug);
    if (!core) throw httpError(404, 'Core not found.');
    res.json({ core: corePublic(core, req.user.id), archived: !!core.archived });
  } catch (err) { next(err); }
});

// aliases & tags
router.put('/cores/:slug/aliases', (req, res, next) => {
  try {
    const core = q.get('SELECT id FROM cores WHERE slug = ?', req.params.slug);
    if (!core) throw httpError(404, 'Core not found.');
    tx(() => {
      q.run('DELETE FROM core_aliases WHERE core_id = ?', core.id);
      for (const a of (req.body?.aliases || [])) q.run('INSERT OR IGNORE INTO core_aliases (core_id, alias) VALUES (?,?)', core.id, String(a).trim());
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/cores/:slug/tags', (req, res, next) => {
  try {
    const core = q.get('SELECT id FROM cores WHERE slug = ?', req.params.slug);
    if (!core) throw httpError(404, 'Core not found.');
    tx(() => {
      q.run('DELETE FROM core_tags WHERE core_id = ?', core.id);
      for (const t of (req.body?.tags || [])) q.run('INSERT OR IGNORE INTO core_tags (core_id, tag) VALUES (?,?)', core.id, String(t).trim());
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// relationships
router.post('/cores/:slug/relationships', (req, res, next) => {
  try {
    const core = q.get('SELECT id FROM cores WHERE slug = ?', req.params.slug);
    const target = q.get('SELECT id FROM cores WHERE slug = ?', req.body?.target_slug || '');
    if (!core || !target) throw httpError(404, 'Core not found.');
    const kind = req.body?.kind;
    const inverse = { parent: 'child', child: 'parent', influenced_by: 'influences', influences: 'influenced_by' };
    q.run('INSERT OR IGNORE INTO core_relationships (core_id, target_id, kind, notes) VALUES (?,?,?,?)',
      core.id, target.id, kind, req.body?.notes || null);
    const inv = inverse[kind] || kind; // symmetric kinds mirror themselves
    q.run('INSERT OR IGNORE INTO core_relationships (core_id, target_id, kind, notes) VALUES (?,?,?,?)',
      target.id, core.id, inv, req.body?.notes || null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/cores/:slug/relationships', (req, res, next) => {
  try {
    const core = q.get('SELECT id FROM cores WHERE slug = ?', req.params.slug);
    const target = q.get('SELECT id FROM cores WHERE slug = ?', req.body?.target_slug || '');
    if (!core || !target) throw httpError(404, 'Core not found.');
    q.run('DELETE FROM core_relationships WHERE core_id = ? AND target_id = ? AND kind = ?', core.id, target.id, req.body?.kind);
    q.run('DELETE FROM core_relationships WHERE core_id = ? AND target_id = ? AND kind = ?', target.id, core.id,
      ({ parent: 'child', child: 'parent', influenced_by: 'influences', influences: 'influenced_by' })[req.body?.kind] || req.body?.kind);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// external communities
router.post('/cores/:slug/external-communities', (req, res, next) => {
  try {
    const core = q.get('SELECT id FROM cores WHERE slug = ?', req.params.slug);
    if (!core) throw httpError(404, 'Core not found.');
    const { platform, url, label, approx_size, is_public } = req.body || {};
    if (!platform || !url) throw httpError(400, 'Platform and URL are required.');
    const id = uid('ext');
    q.run('INSERT INTO external_communities (id, core_id, platform, url, label, approx_size, is_public, added_by) VALUES (?,?,?,?,?,?,?,?)',
      id, core.id, platform, url, label || null, Number.isFinite(+approx_size) ? +approx_size : null, is_public === false ? 0 : 1, req.user.id);
    audit(req.user.id, 'core.external_community_added', 'core', core.id, { platform, url }, req.ip);
    res.status(201).json({ ok: true, id });
  } catch (err) { next(err); }
});

router.delete('/external-communities/:id', (req, res, next) => {
  try {
    const r = q.run('DELETE FROM external_communities WHERE id = ?', req.params.id);
    if (!r.changes) throw httpError(404, 'Not found.');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Verification: invitations & review ────────────────────────────────────
router.post('/cores/:slug/verification-invitations', (req, res, next) => {
  try {
    const core = q.get('SELECT * FROM cores WHERE slug = ?', req.params.slug);
    if (!core) throw httpError(404, 'Core not found.');
    const raw = token(24);
    const id = uid('inv');
    q.run(
      'INSERT INTO verification_invitations (id, core_id, code_hash, invitee_email, note, created_by, expires_at) VALUES (?,?,?,?,?,?,?)',
      id, core.id, sha256(raw), req.body?.invitee_email || null, req.body?.note || null, req.user.id, nowPlus(14 * 86400));
    const url = appUrl(`/?view=claim&code=${raw}`);
    if (req.body?.invitee_email) {
      sendMail(req.body.invitee_email, `Represent ${core.name} on CORE`,
        `Hello,\n\nCORE is building the official home for the ${core.name} community and we'd like to verify you as its representative.\n\nUse this secure invitation to claim the community:\n${url}\n\nThe link expires in 14 days.\n\n— The CORE team`);
    }
    audit(req.user.id, 'verification.invitation_created', 'core', core.id, { invitation_id: id }, req.ip);
    res.status(201).json({ ok: true, invitation_id: id, url }); // raw code shown once, only to the admin
  } catch (err) { next(err); }
});

router.get('/verification-requests', (req, res) => {
  const status = ['pending', 'approved', 'rejected', 'revoked'].includes(req.query.status) ? req.query.status : 'pending';
  const rows = q.all(
    `SELECT r.id, r.status, r.created_at, r.reviewed_at, r.review_notes,
            c.slug AS core_slug, c.name AS core_name, u.username, u.email
     FROM verification_requests r JOIN cores c ON c.id = r.core_id JOIN users u ON u.id = r.user_id
     WHERE r.status = ? ORDER BY r.created_at`, status);
  res.json({ requests: rows });
});

router.get('/verification-requests/:id', (req, res, next) => {
  try {
    const r = q.get(
      `SELECT r.*, c.slug AS core_slug, c.name AS core_name, u.username, u.email
       FROM verification_requests r JOIN cores c ON c.id = r.core_id JOIN users u ON u.id = r.user_id WHERE r.id = ?`,
      req.params.id);
    if (!r) throw httpError(404, 'Request not found.');
    const evidence = q.all('SELECT platform, community_url, approx_size, evidence_text, evidence_url, created_at FROM verification_evidence WHERE request_id = ?', r.id);
    res.json({ request: r, evidence });
  } catch (err) { next(err); }
});

router.post('/verification-requests/:id/review', (req, res, next) => {
  try {
    const r = q.get('SELECT * FROM verification_requests WHERE id = ? AND status = \'pending\'', req.params.id);
    if (!r) throw httpError(404, 'Pending request not found.');
    const approve = !!req.body?.approve;
    tx(() => {
      q.run('UPDATE verification_requests SET status = ?, review_notes = ?, reviewed_by = ?, reviewed_at = datetime(\'now\') WHERE id = ?',
        approve ? 'approved' : 'rejected', req.body?.notes || null, req.user.id, r.id);
      if (approve) {
        q.run(`INSERT OR IGNORE INTO verified_representatives (id, core_id, user_id, request_id, approved_by) VALUES (?,?,?,?,?)`,
          uid('rep'), r.core_id, r.user_id, r.id, req.user.id);
        q.run(`INSERT OR IGNORE INTO community_roles (core_id, user_id, role, granted_by) VALUES (?,?,'manager',?)`,
          r.core_id, r.user_id, req.user.id);
        q.run(`INSERT OR IGNORE INTO community_memberships (core_id, user_id) VALUES (?,?)`, r.core_id, r.user_id);
        q.run(`UPDATE cores SET verification_status = 'verified', updated_at = datetime('now') WHERE id = ?`, r.core_id);
      } else if (!q.get(`SELECT 1 FROM verification_requests WHERE core_id = ? AND status = 'pending' AND id != ?`, r.core_id, r.id)
              && !q.get(`SELECT 1 FROM verified_representatives WHERE core_id = ? AND revoked_at IS NULL`, r.core_id)) {
        q.run(`UPDATE cores SET verification_status = 'unverified' WHERE id = ?`, r.core_id);
      }
    });
    const user = q.get('SELECT email FROM users WHERE id = ?', r.user_id);
    q.run('INSERT INTO notifications (id, user_id, kind, payload) VALUES (?,?,?,?)',
      uid('ntf'), r.user_id, 'verification', JSON.stringify({ request_id: r.id, approved: approve }));
    if (user) sendMail(user.email, approve ? 'Your community is verified on CORE' : 'Update on your CORE verification request',
      approve ? 'Your verification request was approved. You now have management access to your community on CORE.'
              : 'Your verification request was not approved at this time. You can reply to this email for more information.');
    audit(req.user.id, approve ? 'verification.approved' : 'verification.rejected', 'verification_request', r.id, null, req.ip);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/cores/:slug/revoke-verification', (req, res, next) => {
  try {
    const core = q.get('SELECT * FROM cores WHERE slug = ?', req.params.slug);
    if (!core) throw httpError(404, 'Core not found.');
    tx(() => {
      q.run('UPDATE verified_representatives SET revoked_at = datetime(\'now\') WHERE core_id = ? AND revoked_at IS NULL', core.id);
      q.run('DELETE FROM community_roles WHERE core_id = ? AND role = \'manager\'', core.id);
      q.run('UPDATE cores SET verification_status = \'unverified\', updated_at = datetime(\'now\') WHERE id = ?', core.id);
    });
    audit(req.user.id, 'verification.revoked', 'core', core.id, { reason: req.body?.reason }, req.ip);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// promote verified → official (community fully adopted CORE)
router.post('/cores/:slug/status', (req, res, next) => {
  try {
    const core = q.get('SELECT * FROM cores WHERE slug = ?', req.params.slug);
    if (!core) throw httpError(404, 'Core not found.');
    const status = req.body?.status;
    if (!['unverified', 'pending', 'verified', 'official'].includes(status)) throw httpError(400, 'Invalid status.');
    if (status === 'official' && core.verification_status !== 'verified') throw httpError(400, 'Only verified communities can become official.');
    q.run('UPDATE cores SET verification_status = ?, updated_at = datetime(\'now\') WHERE id = ?', status, core.id);
    audit(req.user.id, 'core.status_changed', 'core', core.id, { from: core.verification_status, to: status }, req.ip);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Users, reports, moderation ────────────────────────────────────────────
router.get('/users', (req, res) => {
  const like = `%${String(req.query.q || '').replace(/[%_]/g, ' ')}%`;
  const rows = q.all(
    `SELECT u.id, u.email, u.username, u.role, u.status, u.email_verified_at, u.created_at,
            (SELECT COUNT(*) FROM abuse_signals a WHERE a.user_id = u.id) AS abuse_signals
     FROM users u WHERE u.email LIKE ? OR u.username LIKE ? ORDER BY u.created_at DESC LIMIT 100`, like, like);
  res.json({ users: rows });
});

router.post('/users/:id/suspend', (req, res, next) => {
  try {
    const target = q.get('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!target) throw httpError(404, 'User not found.');
    if (target.role === 'admin') throw httpError(400, 'Cannot suspend an administrator.');
    const suspend = req.body?.unsuspend ? 'active' : 'suspended';
    tx(() => {
      q.run('UPDATE users SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', suspend, target.id);
      if (suspend === 'suspended') q.run('DELETE FROM sessions WHERE user_id = ?', target.id);
    });
    q.run('INSERT INTO moderation_actions (id, actor_id, action, target_type, target_id, reason) VALUES (?,?,?,?,?,?)',
      uid('mod'), req.user.id, suspend === 'suspended' ? 'suspend_user' : 'unsuspend_user', 'user', target.id, req.body?.reason || null);
    audit(req.user.id, `user.${suspend}`, 'user', target.id, { reason: req.body?.reason }, req.ip);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/reports', (req, res) => {
  const rows = q.all(
    `SELECT r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at,
            c.slug AS core_slug, c.name AS core_name, u.username AS reporter
     FROM reports r JOIN cores c ON c.id = r.core_id JOIN users u ON u.id = r.reporter_id
     WHERE r.status = 'open' ORDER BY r.created_at LIMIT 200`);
  res.json({ reports: rows });
});

// ── Analytics ─────────────────────────────────────────────────────────────
router.get('/analytics', (_req, res) => {
  res.json({
    totals: {
      users: q.get('SELECT COUNT(*) AS n FROM users').n,
      verified_users: q.get('SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NOT NULL').n,
      cores: q.get('SELECT COUNT(*) AS n FROM cores WHERE archived = 0').n,
      verified_cores: q.get(`SELECT COUNT(*) AS n FROM cores WHERE verification_status IN ('verified','official')`).n,
      memberships: q.get('SELECT COUNT(*) AS n FROM community_memberships').n,
      posts: q.get('SELECT COUNT(*) AS n FROM posts WHERE deleted_at IS NULL').n,
      wallets: q.get('SELECT COUNT(*) AS n FROM wallet_associations').n,
    },
    referrals: q.all(
      `SELECT l.id AS code, l.label, l.source, l.clicks, c.name AS core_name,
              (SELECT COUNT(*) FROM referral_attributions a WHERE a.link_id = l.id) AS signups,
              (SELECT COUNT(*) FROM community_memberships m WHERE m.referral_link_id = l.id) AS joins
       FROM referral_links l JOIN cores c ON c.id = l.core_id ORDER BY signups DESC LIMIT 50`),
    signups_by_day: q.all(
      `SELECT date(created_at) AS day, COUNT(*) AS n FROM users GROUP BY day ORDER BY day DESC LIMIT 30`),
  });
});

router.get('/audit-log', (req, res) => {
  const rows = q.all(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.detail, a.created_at, u.username AS actor
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 200`);
  res.json({ log: rows });
});

// ── Future distributions (public addresses only — never keys) ─────────────
router.post('/distributions', (req, res, next) => {
  try {
    const { label, criteria } = req.body || {};
    if (!label) throw httpError(400, 'A batch label is required.');
    const crit = {
      created_before: criteria?.created_before || null,
      core_slugs: Array.isArray(criteria?.core_slugs) ? criteria.core_slugs : [],
      min_posts: Number.isFinite(+criteria?.min_posts) ? +criteria.min_posts : 0,
      representatives_only: !!criteria?.representatives_only,
    };
    // Eligibility: active + email-verified + wallet + not flagged; criteria applied on top.
    let sql = `
      SELECT DISTINCT u.id AS user_id, w.public_address FROM users u
      JOIN wallet_associations w ON w.user_id = u.id AND w.status = 'active'
      WHERE u.status = 'active' AND u.email_verified_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM abuse_signals s WHERE s.user_id = u.id)`;
    const params = [];
    if (crit.created_before) { sql += ' AND u.created_at < ?'; params.push(crit.created_before); }
    if (crit.core_slugs.length) {
      sql += ` AND EXISTS (SELECT 1 FROM community_memberships m JOIN cores c ON c.id = m.core_id
               WHERE m.user_id = u.id AND c.slug IN (${crit.core_slugs.map(() => '?').join(',')}))`;
      params.push(...crit.core_slugs);
    }
    if (crit.min_posts > 0) {
      sql += ' AND (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.deleted_at IS NULL) >= ?';
      params.push(crit.min_posts);
    }
    if (crit.representatives_only) {
      sql += ' AND EXISTS (SELECT 1 FROM verified_representatives vr WHERE vr.user_id = u.id AND vr.revoked_at IS NULL)';
    }
    const recipients = q.all(sql, ...params);
    const batchId = uid('bat');
    tx(() => {
      q.run('INSERT INTO distribution_batches (id, label, criteria, created_by) VALUES (?,?,?,?)',
        batchId, String(label).slice(0, 120), JSON.stringify(crit), req.user.id);
      for (const r of recipients) {
        q.run('INSERT INTO distribution_recipients (batch_id, user_id, public_address) VALUES (?,?,?)',
          batchId, r.user_id, r.public_address);
      }
    });
    audit(req.user.id, 'distribution.batch_created', 'distribution_batch', batchId, { recipients: recipients.length, criteria: crit }, req.ip);
    res.status(201).json({ ok: true, batch_id: batchId, recipient_count: recipients.length });
  } catch (err) { next(err); }
});

router.get('/distributions', (_req, res) => {
  const rows = q.all(
    `SELECT b.id, b.label, b.status, b.criteria, b.created_at, b.exported_at, b.executed_at, b.tx_signature,
            (SELECT COUNT(*) FROM distribution_recipients r WHERE r.batch_id = b.id) AS recipient_count
     FROM distribution_batches b ORDER BY b.created_at DESC LIMIT 100`);
  res.json({ batches: rows });
});

router.get('/distributions/:id/export', (req, res, next) => {
  try {
    const batch = q.get('SELECT * FROM distribution_batches WHERE id = ?', req.params.id);
    if (!batch) throw httpError(404, 'Batch not found.');
    const rows = q.all('SELECT user_id, public_address, status FROM distribution_recipients WHERE batch_id = ?', batch.id);
    q.run(`UPDATE distribution_batches SET status = 'exported', exported_at = datetime('now') WHERE id = ? AND status = 'draft'`, batch.id);
    audit(req.user.id, 'distribution.exported', 'distribution_batch', batch.id, { rows: rows.length }, req.ip);
    res.type('text/csv').send('user_id,public_address,status\n' + rows.map((r) => `${r.user_id},${r.public_address},${r.status}`).join('\n'));
  } catch (err) { next(err); }
});

router.post('/distributions/:id/record-execution', (req, res, next) => {
  try {
    const { tx_signature } = req.body || {};
    if (!tx_signature) throw httpError(400, 'Transaction signature required.');
    const r = q.run(
      `UPDATE distribution_batches SET status = 'executed', executed_at = datetime('now'), tx_signature = ? WHERE id = ? AND status IN ('draft','exported')`,
      String(tx_signature).slice(0, 120), req.params.id);
    if (!r.changes) throw httpError(404, 'Batch not found or already executed.');
    q.run(`UPDATE distribution_recipients SET status = 'sent' WHERE batch_id = ? AND status = 'pending'`, req.params.id);
    audit(req.user.id, 'distribution.executed', 'distribution_batch', req.params.id, { tx_signature }, req.ip);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// dev outbox (verification links etc.) — admin-only, non-production convenience
router.get('/outbox', (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Not available in production.' });
  res.json({ mail: q.all('SELECT * FROM email_outbox ORDER BY id DESC LIMIT 50') });
});

export default router;
