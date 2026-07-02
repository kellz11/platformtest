import { Router } from 'express';
import { q } from '../db.js';
import { parseJsonArray, httpError } from '../lib/util.js';
import { coreRole } from '../lib/auth.js';

const router = Router();

export function corePublic(c, userId) {
  const relationships = q.all(
    `SELECT r.kind, t.slug, t.name, t.verification_status FROM core_relationships r
     JOIN cores t ON t.id = r.target_id WHERE r.core_id = ? AND t.archived = 0`, c.id);
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    definition: c.definition,
    description: c.description,
    history: c.history,
    cultural_context: c.cultural_context,
    visual_characteristics: parseJsonArray(c.visual_characteristics),
    themes: parseJsonArray(c.themes),
    keywords: parseJsonArray(c.keywords),
    cover_image: c.cover_image,
    profile_image: c.profile_image,
    gallery_dir: c.gallery_dir,
    verification_status: c.verification_status,
    member_count: c.member_count,
    aliases: q.all('SELECT alias FROM core_aliases WHERE core_id = ?', c.id).map((r) => r.alias),
    tags: q.all('SELECT tag FROM core_tags WHERE core_id = ?', c.id).map((r) => r.tag),
    relationships,
    external_communities: q.all(
      'SELECT platform, url, label, approx_size FROM external_communities WHERE core_id = ? AND is_public = 1', c.id),
    moderators: q.all(
      `SELECT u.username, p.display_name, r.role FROM community_roles r
       JOIN users u ON u.id = r.user_id LEFT JOIN profiles p ON p.user_id = u.id WHERE r.core_id = ?`, c.id),
    viewer: userId ? {
      is_member: !!q.get('SELECT 1 FROM community_memberships WHERE core_id = ? AND user_id = ?', c.id, userId),
      role: coreRole(userId, c.id),
    } : null,
  };
}

router.get('/', (req, res) => {
  const rows = q.all(
    `SELECT slug, name, definition, verification_status, member_count, profile_image, gallery_dir
     FROM cores WHERE archived = 0 ORDER BY name COLLATE NOCASE`);
  res.json({ cores: rows });
});

router.get('/:slug', (req, res, next) => {
  try {
    const c = q.get('SELECT * FROM cores WHERE slug = ? AND archived = 0', req.params.slug);
    if (!c) throw httpError(404, 'Core not found.');
    res.json({ core: corePublic(c, req.user?.id) });
  } catch (err) { next(err); }
});

// ── Search (cores + aliases + keywords + verified communities + users + posts) ──
// mounted separately at /api/search in server/index.js
export const searchRouter = Router();
searchRouter.get('/', (req, res) => {
  const raw = String(req.query.q || '').trim().slice(0, 80);
  if (!raw) return res.json({ cores: [], users: [], posts: [] });
  const like = `%${raw.replace(/[%_]/g, ' ')}%`;
  const cores = q.all(
    `SELECT DISTINCT c.slug, c.name, c.definition, c.verification_status, c.member_count, c.gallery_dir
     FROM cores c
     LEFT JOIN core_aliases a ON a.core_id = c.id
     LEFT JOIN core_tags t ON t.core_id = c.id
     WHERE c.archived = 0 AND (
       c.name LIKE ? OR c.definition LIKE ? OR c.description LIKE ? OR c.keywords LIKE ?
       OR a.alias LIKE ? OR t.tag LIKE ?)
     ORDER BY (c.verification_status IN ('verified','official')) DESC, c.member_count DESC, c.name LIMIT 25`,
    like, like, like, like, like, like);
  const users = q.all(
    `SELECT u.username, p.display_name, p.avatar_path FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.status = 'active' AND (u.username LIKE ? OR p.display_name LIKE ?) LIMIT 10`, like, like);
  const posts = q.all(
    `SELECT p.id, substr(p.body, 1, 160) AS excerpt, p.created_at, c.slug AS core_slug, c.name AS core_name, u.username
     FROM posts p JOIN cores c ON c.id = p.core_id JOIN users u ON u.id = p.user_id
     WHERE p.deleted_at IS NULL AND p.body LIKE ? ORDER BY p.created_at DESC LIMIT 10`, like);
  res.json({
    cores: cores.map((c) => ({ ...c, result_type: ['verified', 'official'].includes(c.verification_status) ? 'verified_community' : 'wiki_page' })),
    users, posts,
  });
});

export default router;
