import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { q, tx } from '../db.js';
import { uid, audit, httpError } from '../lib/util.js';
import { requireAuth, requireVerifiedEmail, canModerate, canManage } from '../lib/auth.js';
import { rateLimit } from '../lib/ratelimit.js';

const router = Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'var', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' }[file.mimetype];
      cb(ext ? null : new Error('Unsupported image type.'), uid('img') + ext);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

function getCore(slug) {
  const c = q.get('SELECT * FROM cores WHERE slug = ? AND archived = 0', slug);
  if (!c) throw httpError(404, 'Core not found.');
  return c;
}

function notifyAnnouncement(coreId, coreName, postId) {
  const members = q.all('SELECT user_id FROM community_memberships WHERE core_id = ? LIMIT 5000', coreId);
  const payload = JSON.stringify({ core_id: coreId, core_name: coreName, post_id: postId });
  const stmt = 'INSERT INTO notifications (id, user_id, kind, payload) VALUES (?,?,?,?)';
  for (const m of members) q.run(stmt, uid('ntf'), m.user_id, 'announcement', payload);
}

// ── Membership ────────────────────────────────────────────────────────────
router.post('/:slug/join', requireAuth, (req, res, next) => {
  try {
    const core = getCore(req.params.slug);
    q.run('INSERT OR IGNORE INTO community_memberships (core_id, user_id) VALUES (?,?)', core.id, req.user.id);
    const c = q.get('SELECT member_count FROM cores WHERE id = ?', core.id);
    res.json({ ok: true, member_count: c.member_count });
  } catch (err) { next(err); }
});

router.post('/:slug/leave', requireAuth, (req, res, next) => {
  try {
    const core = getCore(req.params.slug);
    q.run('DELETE FROM community_memberships WHERE core_id = ? AND user_id = ?', core.id, req.user.id);
    const c = q.get('SELECT member_count FROM cores WHERE id = ?', core.id);
    res.json({ ok: true, member_count: c.member_count });
  } catch (err) { next(err); }
});

// ── Feed ──────────────────────────────────────────────────────────────────
router.get('/:slug/posts', (req, res, next) => {
  try {
    const core = getCore(req.params.slug);
    const sort = req.query.sort === 'popular' ? 'p.like_count DESC, p.created_at DESC' : 'p.pinned DESC, p.created_at DESC';
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const rows = q.all(
      `SELECT p.id, p.kind, p.body, p.pinned, p.like_count, p.comment_count, p.created_at,
              u.username, pr.display_name, pr.avatar_path,
              (SELECT path FROM media WHERE post_id = p.id LIMIT 1) AS image_path
       FROM posts p JOIN users u ON u.id = p.user_id LEFT JOIN profiles pr ON pr.user_id = u.id
       WHERE p.core_id = ? AND p.deleted_at IS NULL
       ORDER BY ${sort} LIMIT ? OFFSET ?`, core.id, limit, offset);
    const liked = req.user
      ? new Set(q.all(`SELECT target_id FROM likes WHERE user_id = ? AND target_type = 'post'`, req.user.id).map((r) => r.target_id))
      : new Set();
    res.json({ posts: rows.map((p) => ({ ...p, liked_by_viewer: liked.has(p.id), is_own: req.user?.id && q.get('SELECT user_id FROM posts WHERE id=?', p.id).user_id === req.user.id })) });
  } catch (err) { next(err); }
});

router.post('/:slug/posts', requireVerifiedEmail, rateLimit({ name: 'post', max: 15, windowMs: 600_000, key: (r) => r.user?.id || r.ip }),
  upload.single('image'), (req, res, next) => {
  try {
    const core = getCore(req.params.slug);
    if (!q.get('SELECT 1 FROM community_memberships WHERE core_id = ? AND user_id = ?', core.id, req.user.id)) {
      throw httpError(403, 'Join this community to post.');
    }
    const body = String(req.body?.body || '').trim().slice(0, 5000);
    const isAnnouncement = req.body?.announcement === '1' || req.body?.announcement === true;
    if (isAnnouncement && !canManage(req.user, core.id)) throw httpError(403, 'Only community managers can post announcements.');
    if (!body && !req.file) throw httpError(400, 'A post needs text or an image.');
    const postId = uid('pst');
    tx(() => {
      q.run('INSERT INTO posts (id, core_id, user_id, kind, body) VALUES (?,?,?,?,?)',
        postId, core.id, req.user.id, isAnnouncement ? 'announcement' : (req.file ? 'image' : 'text'), body || null);
      if (req.file) {
        q.run('INSERT INTO media (id, post_id, uploader_id, path, mime, bytes) VALUES (?,?,?,?,?,?)',
          uid('med'), postId, req.user.id, `uploads/${req.file.filename}`, req.file.mimetype, req.file.size);
      }
    });
    if (isAnnouncement) notifyAnnouncement(core.id, core.name, postId);
    res.status(201).json({ ok: true, post_id: postId });
  } catch (err) { next(err); }
});

// delete own content, or moderate if role allows
router.delete('/:slug/posts/:postId', requireAuth, (req, res, next) => {
  try {
    const core = getCore(req.params.slug);
    const post = q.get('SELECT * FROM posts WHERE id = ? AND core_id = ? AND deleted_at IS NULL', req.params.postId, core.id);
    if (!post) throw httpError(404, 'Post not found.');
    const own = post.user_id === req.user.id;
    if (!own && !canModerate(req.user, core.id)) throw httpError(403, 'You can only delete your own posts.');
    q.run('UPDATE posts SET deleted_at = datetime(\'now\'), deleted_by = ? WHERE id = ?', req.user.id, post.id);
    if (!own) {
      q.run('INSERT INTO moderation_actions (id, actor_id, core_id, action, target_type, target_id) VALUES (?,?,?,?,?,?)',
        uid('mod'), req.user.id, core.id, 'delete_post', 'post', post.id);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:slug/posts/:postId/pin', requireAuth, (req, res, next) => {
  try {
    const core = getCore(req.params.slug);
    if (!canManage(req.user, core.id)) throw httpError(403, 'Only community managers can pin posts.');
    const pinned = req.body?.pinned === false ? 0 : 1;
    const r = q.run('UPDATE posts SET pinned = ? WHERE id = ? AND core_id = ? AND deleted_at IS NULL', pinned, req.params.postId, core.id);
    if (!r.changes) throw httpError(404, 'Post not found.');
    q.run('INSERT INTO moderation_actions (id, actor_id, core_id, action, target_type, target_id) VALUES (?,?,?,?,?,?)',
      uid('mod'), req.user.id, core.id, pinned ? 'pin' : 'unpin', 'post', req.params.postId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Comments & replies ────────────────────────────────────────────────────
router.get('/:slug/posts/:postId/comments', (req, res, next) => {
  try {
    const core = getCore(req.params.slug);
    const rows = q.all(
      `SELECT c.id, c.parent_id, c.body, c.like_count, c.created_at, c.deleted_at,
              u.username, pr.display_name
       FROM comments c JOIN users u ON u.id = c.user_id LEFT JOIN profiles pr ON pr.user_id = u.id
       WHERE c.post_id = ? ORDER BY c.created_at`, req.params.postId);
    const liked = req.user
      ? new Set(q.all(`SELECT target_id FROM likes WHERE user_id = ? AND target_type = 'comment'`, req.user.id).map((r) => r.target_id))
      : new Set();
    res.json({
      comments: rows.map((c) => c.deleted_at
        ? { id: c.id, parent_id: c.parent_id, deleted: true }
        : { ...c, deleted: false, liked_by_viewer: liked.has(c.id) }),
      viewer_can_moderate: canModerate(req.user, core.id),
    });
  } catch (err) { next(err); }
});

router.post('/:slug/posts/:postId/comments', requireVerifiedEmail, rateLimit({ name: 'comment', max: 30, windowMs: 600_000, key: (r) => r.user?.id || r.ip }), (req, res, next) => {
  try {
    const core = getCore(req.params.slug);
    const post = q.get('SELECT id, user_id FROM posts WHERE id = ? AND core_id = ? AND deleted_at IS NULL', req.params.postId, core.id);
    if (!post) throw httpError(404, 'Post not found.');
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    if (!body) throw httpError(400, 'Comment cannot be empty.');
    const parentId = req.body?.parent_id || null;
    if (parentId && !q.get('SELECT 1 FROM comments WHERE id = ? AND post_id = ?', parentId, post.id)) {
      throw httpError(400, 'Parent comment not found.');
    }
    const id = uid('cmt');
    tx(() => {
      q.run('INSERT INTO comments (id, post_id, user_id, parent_id, body) VALUES (?,?,?,?,?)', id, post.id, req.user.id, parentId, body);
      q.run('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', post.id);
    });
    if (post.user_id !== req.user.id) {
      q.run('INSERT INTO notifications (id, user_id, kind, payload) VALUES (?,?,?,?)',
        uid('ntf'), post.user_id, 'reply', JSON.stringify({ post_id: post.id, comment_id: id, by: req.user.username, core_slug: core.slug }));
    }
    res.status(201).json({ ok: true, comment_id: id });
  } catch (err) { next(err); }
});

router.delete('/:slug/comments/:commentId', requireAuth, (req, res, next) => {
  try {
    const core = getCore(req.params.slug);
    const c = q.get(
      `SELECT c.* FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ? AND p.core_id = ? AND c.deleted_at IS NULL`,
      req.params.commentId, core.id);
    if (!c) throw httpError(404, 'Comment not found.');
    const own = c.user_id === req.user.id;
    if (!own && !canModerate(req.user, core.id)) throw httpError(403, 'You can only delete your own comments.');
    q.run('UPDATE comments SET deleted_at = datetime(\'now\'), deleted_by = ? WHERE id = ?', req.user.id, c.id);
    if (!own) q.run('INSERT INTO moderation_actions (id, actor_id, core_id, action, target_type, target_id) VALUES (?,?,?,?,?,?)',
      uid('mod'), req.user.id, core.id, 'delete_comment', 'comment', c.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Likes (posts + comments) ──────────────────────────────────────────────
function toggleLike(req, res, next, type, table) {
  try {
    const core = getCore(req.params.slug);
    const idCol = type === 'post' ? req.params.postId : req.params.commentId;
    const exists = type === 'post'
      ? q.get('SELECT 1 FROM posts WHERE id = ? AND core_id = ? AND deleted_at IS NULL', idCol, core.id)
      : q.get('SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ? AND p.core_id = ? AND c.deleted_at IS NULL', idCol, core.id);
    if (!exists) throw httpError(404, 'Not found.');
    const had = q.get('SELECT 1 FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?', req.user.id, type, idCol);
    tx(() => {
      if (had) {
        q.run('DELETE FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?', req.user.id, type, idCol);
        q.run(`UPDATE ${table} SET like_count = like_count - 1 WHERE id = ?`, idCol);
      } else {
        q.run('INSERT INTO likes (user_id, target_type, target_id) VALUES (?,?,?)', req.user.id, type, idCol);
        q.run(`UPDATE ${table} SET like_count = like_count + 1 WHERE id = ?`, idCol);
      }
    });
    const row = q.get(`SELECT like_count FROM ${table} WHERE id = ?`, idCol);
    res.json({ ok: true, liked: !had, like_count: row.like_count });
  } catch (err) { next(err); }
}
router.post('/:slug/posts/:postId/like', requireAuth, (req, res, next) => toggleLike(req, res, next, 'post', 'posts'));
router.post('/:slug/comments/:commentId/like', requireAuth, (req, res, next) => toggleLike(req, res, next, 'comment', 'comments'));

// ── Reports ───────────────────────────────────────────────────────────────
router.post('/:slug/report', requireAuth, rateLimit({ name: 'report', max: 10, windowMs: 3600_000, key: (r) => r.user?.id || r.ip }), (req, res, next) => {
  try {
    const core = getCore(req.params.slug);
    const { target_type, target_id, reason } = req.body || {};
    if (!['post', 'comment', 'user'].includes(target_type)) throw httpError(400, 'Invalid report target.');
    if (!reason || String(reason).trim().length < 3) throw httpError(400, 'Please describe the problem.');
    q.run('INSERT INTO reports (id, reporter_id, core_id, target_type, target_id, reason) VALUES (?,?,?,?,?,?)',
      uid('rpt'), req.user.id, core.id, target_type, String(target_id || ''), String(reason).trim().slice(0, 1000));
    res.status(201).json({ ok: true, message: 'Report submitted. Community moderators will review it.' });
  } catch (err) { next(err); }
});

// reports queue — visible only to that community's moderators/managers + admins
router.get('/:slug/reports', requireAuth, (req, res, next) => {
  try {
    const core = getCore(req.params.slug);
    if (!canModerate(req.user, core.id)) throw httpError(403, 'Moderator access required.');
    const rows = q.all(
      `SELECT r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at, u.username AS reporter
       FROM reports r JOIN users u ON u.id = r.reporter_id
       WHERE r.core_id = ? ORDER BY r.status = 'open' DESC, r.created_at DESC LIMIT 100`, core.id);
    res.json({ reports: rows });
  } catch (err) { next(err); }
});

router.post('/:slug/reports/:reportId/resolve', requireAuth, (req, res, next) => {
  try {
    const core = getCore(req.params.slug);
    if (!canModerate(req.user, core.id)) throw httpError(403, 'Moderator access required.');
    const status = req.body?.dismiss ? 'dismissed' : 'resolved';
    const r = q.run(
      `UPDATE reports SET status = ?, resolved_by = ?, resolved_at = datetime('now') WHERE id = ? AND core_id = ? AND status = 'open'`,
      status, req.user.id, req.params.reportId, core.id);
    if (!r.changes) throw httpError(404, 'Report not found or already handled.');
    q.run('INSERT INTO moderation_actions (id, actor_id, core_id, action, target_type, target_id) VALUES (?,?,?,?,?,?)',
      uid('mod'), req.user.id, core.id, 'resolve_report', 'report', req.params.reportId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Community moderator management (managers only) ────────────────────────
router.post('/:slug/moderators', requireAuth, (req, res, next) => {
  try {
    const core = getCore(req.params.slug);
    if (!canManage(req.user, core.id)) throw httpError(403, 'Only community managers can manage moderators.');
    const target = q.get('SELECT id FROM users WHERE username = ? AND status = \'active\'', req.body?.username || '');
    if (!target) throw httpError(404, 'User not found.');
    if (req.body?.remove) {
      q.run(`DELETE FROM community_roles WHERE core_id = ? AND user_id = ? AND role = 'moderator'`, core.id, target.id);
    } else {
      q.run(`INSERT OR IGNORE INTO community_roles (core_id, user_id, role, granted_by) VALUES (?,?,?,?)`,
        core.id, target.id, 'moderator', req.user.id);
    }
    audit(req.user.id, req.body?.remove ? 'community.moderator_removed' : 'community.moderator_added', 'core', core.id, { user: req.body?.username });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Community profile edits (managers only, limited fields) ───────────────
router.patch('/:slug/profile', requireAuth, (req, res, next) => {
  try {
    const core = getCore(req.params.slug);
    if (!canManage(req.user, core.id)) throw httpError(403, 'Only community managers can edit the community profile.');
    const { definition, description } = req.body || {};
    q.run('UPDATE cores SET definition = COALESCE(?, definition), description = COALESCE(?, description), updated_at = datetime(\'now\') WHERE id = ?',
      definition !== undefined ? String(definition).slice(0, 300) : null,
      description !== undefined ? String(description).slice(0, 10000) : null,
      core.id);
    audit(req.user.id, 'community.profile_edited', 'core', core.id, null, req.ip);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
