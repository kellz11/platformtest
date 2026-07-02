// Seeds the database from the existing static site's data:
//   • assets/cores/manifest.json  → one core per gallery folder
//   • ui/graph-data.js clusters   → descriptions, keywords, themes, relationships
//   • ADMIN_EMAIL / ADMIN_PASSWORD env → initial platform administrator
// Idempotent: safe to run repeatedly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, q, tx } from './db.js';
import { uid, slugify } from './lib/util.js';
import { hashPassword } from './lib/auth.js';
import { buildCoreGraph } from '../ui/graph-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export function seed({ quiet = false } = {}) {
  openDb();
  const log = (...a) => { if (!quiet) console.log(...a); };

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'cores', 'manifest.json'), 'utf8'));
  const records = Object.entries(manifest)
    .filter(([name]) => name.toLowerCase() !== 'cannibalcore') // removed core, preserved behavior
    .map(([name, paths]) => ({ name, paths: Array.isArray(paths) ? paths : [] }));

  const graph = buildCoreGraph(records);
  const nodeByName = new Map(graph.nodes.map((n) => [n.name, n]));

  let created = 0;
  tx(() => {
    for (const record of records) {
      const slug = slugify(record.name);
      if (q.get('SELECT 1 FROM cores WHERE slug = ?', slug)) continue;
      const node = nodeByName.get(record.name);
      q.run(
        `INSERT INTO cores (id, slug, name, definition, keywords, themes, profile_image, cover_image, gallery_dir)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        uid('cor'), slug, record.name,
        node?.description || null,
        JSON.stringify(node?.keywords || []),
        JSON.stringify(node?.emotions || []),
        record.paths[0] || null,
        record.paths[1] || record.paths[0] || null,
        `assets/cores/${record.name}`);
      created++;
    }

    // relationships from the curated graph
    const idBySlug = new Map(q.all('SELECT id, slug FROM cores').map((r) => [r.slug, r.id]));
    const kindMap = {
      category_parent: ['child', 'parent'],     // hub → member: member is child of hub
      visual_overlap: ['overlapping', 'overlapping'],
      emotional_overlap: ['similar', 'similar'],
      historical_influence: ['influences', 'influenced_by'],
      search_overlap: ['related', 'related'],
      sibling: ['related', 'related'],
    };
    for (const edge of graph.edges) {
      const a = idBySlug.get(slugify(edge.from));
      const b = idBySlug.get(slugify(edge.to));
      if (!a || !b || a === b) continue;
      const [kindAB, kindBA] = kindMap[edge.relationship] || ['related', 'related'];
      // for category_parent: from = hub (parent), to = member (child)
      if (edge.relationship === 'category_parent') {
        q.run('INSERT OR IGNORE INTO core_relationships (core_id, target_id, kind, notes) VALUES (?,?,?,?)', a, b, 'child', edge.reason || null);
        q.run('INSERT OR IGNORE INTO core_relationships (core_id, target_id, kind, notes) VALUES (?,?,?,?)', b, a, 'parent', edge.reason || null);
      } else {
        q.run('INSERT OR IGNORE INTO core_relationships (core_id, target_id, kind, notes) VALUES (?,?,?,?)', a, b, kindAB, edge.reason || null);
        q.run('INSERT OR IGNORE INTO core_relationships (core_id, target_id, kind, notes) VALUES (?,?,?,?)', b, a, kindBA, edge.reason || null);
      }
    }
  });
  log(`Seeded ${created} cores (${records.length} total in manifest).`);

  // initial administrator
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword && !q.get('SELECT 1 FROM users WHERE email = ?', adminEmail)) {
    const id = uid('usr');
    tx(() => {
      q.run(`INSERT INTO users (id, email, username, role, email_verified_at) VALUES (?,?,?,?,datetime('now'))`,
        id, adminEmail, process.env.ADMIN_USERNAME || 'core_admin', 'admin');
      q.run('INSERT INTO profiles (user_id, display_name) VALUES (?,?)', id, 'CORE Admin');
      q.run(`INSERT INTO auth_identities (id, user_id, provider, password_hash) VALUES (?,?,?,?)`,
        uid('aid'), id, 'password', hashPassword(adminPassword));
    });
    log(`Created admin account ${adminEmail}.`);
  } else if (!adminEmail) {
    log('No ADMIN_EMAIL set — skipped admin creation (set ADMIN_EMAIL and ADMIN_PASSWORD in .env).');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) seed();
