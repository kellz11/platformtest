// Representative-facing side of the verification workflow.
// (Invitations are CREATED by admins in routes/admin.js — there is deliberately
// no open public application form.)
import { Router } from 'express';
import { q, tx } from '../db.js';
import { uid, sha256, audit, httpError } from '../lib/util.js';
import { requireVerifiedEmail } from '../lib/auth.js';
import { rateLimit } from '../lib/ratelimit.js';

const router = Router();

// Look up an invitation (invitee opens /?view=claim&code=...)
router.get('/invitations/:code', rateLimit({ name: 'invlookup', max: 20, windowMs: 600_000 }), (req, res, next) => {
  try {
    const inv = q.get(
      `SELECT i.id, i.core_id, i.expires_at, i.used_at, i.revoked_at, c.slug, c.name
       FROM verification_invitations i JOIN cores c ON c.id = i.core_id WHERE i.code_hash = ?`,
      sha256(req.params.code));
    if (!inv || inv.revoked_at) throw httpError(404, 'That invitation is not valid.');
    if (inv.used_at) throw httpError(410, 'That invitation has already been used.');
    if (inv.expires_at <= new Date().toISOString().replace('T', ' ').slice(0, 19)) throw httpError(410, 'That invitation has expired.');
    res.json({ invitation: { core_slug: inv.slug, core_name: inv.name, expires_at: inv.expires_at } });
  } catch (err) { next(err); }
});

// Redeem invitation + submit evidence → creates a pending verification request.
router.post('/invitations/:code/claim', requireVerifiedEmail, rateLimit({ name: 'invclaim', max: 10, windowMs: 3600_000 }), (req, res, next) => {
  try {
    const inv = q.get(
      `SELECT * FROM verification_invitations WHERE code_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > datetime('now')`,
      sha256(req.params.code));
    if (!inv) throw httpError(404, 'That invitation is not valid or has expired.');
    const { platform, community_url, approx_size, evidence_text, evidence_url } = req.body || {};
    if (!platform || !String(evidence_text || evidence_url || '').trim()) {
      throw httpError(400, 'Please include the platform and at least one piece of evidence.');
    }
    const requestId = uid('vrq');
    tx(() => {
      q.run('UPDATE verification_invitations SET used_by = ?, used_at = datetime(\'now\') WHERE id = ?', req.user.id, inv.id);
      q.run('INSERT INTO verification_requests (id, core_id, user_id, invitation_id) VALUES (?,?,?,?)',
        requestId, inv.core_id, req.user.id, inv.id);
      q.run(
        `INSERT INTO verification_evidence (id, request_id, platform, community_url, approx_size, evidence_text, evidence_url)
         VALUES (?,?,?,?,?,?,?)`,
        uid('evd'), requestId, String(platform).slice(0, 40), community_url ? String(community_url).slice(0, 500) : null,
        Number.isFinite(+approx_size) ? Math.max(0, Math.floor(+approx_size)) : null,
        evidence_text ? String(evidence_text).slice(0, 5000) : null,
        evidence_url ? String(evidence_url).slice(0, 500) : null);
      // page shows "Community verification pending" while under review
      q.run(`UPDATE cores SET verification_status = 'pending', updated_at = datetime('now')
             WHERE id = ? AND verification_status = 'unverified'`, inv.core_id);
    });
    audit(req.user.id, 'verification.requested', 'core', inv.core_id, { request_id: requestId }, req.ip);
    res.status(201).json({ ok: true, request_id: requestId, message: 'Thanks — your evidence was submitted. A CORE administrator will review it.' });
  } catch (err) { next(err); }
});

// The representative can check their own request status (never anyone else's).
router.get('/my-requests', requireVerifiedEmail, (req, res) => {
  const rows = q.all(
    `SELECT r.id, r.status, r.created_at, r.reviewed_at, c.slug, c.name
     FROM verification_requests r JOIN cores c ON c.id = r.core_id
     WHERE r.user_id = ? ORDER BY r.created_at DESC`, req.user.id);
  res.json({ requests: rows });
});

export default router;
