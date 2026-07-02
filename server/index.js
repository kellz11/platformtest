import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, q } from './db.js';
import { attachUser } from './lib/auth.js';
import { rateLimit } from './lib/ratelimit.js';
import { provisionMissingWallets } from './wallets/index.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import coreRoutes, { searchRouter } from './routes/cores.js';
import communityRoutes from './routes/community.js';
import verificationRoutes from './routes/verification.js';
import referralRoutes from './routes/referrals.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, 'var', 'uploads');

export function createApp() {
  openDb();
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use(attachUser);

  // ── API ─────────────────────────────────────────────────────────────────
  app.use('/api', rateLimit({ name: 'api', max: 300, windowMs: 60_000 }));
  app.use('/api/auth', authRoutes);
  app.use('/api/account', accountRoutes);
  app.use('/api/cores', coreRoutes);
  app.use('/api/search', searchRouter);
  app.use('/api/community', communityRoutes);
  app.use('/api/verification', verificationRoutes);
  app.use('/api/referrals', referralRoutes);
  app.use('/api/admin', adminRoutes);
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // ── SEO-friendly permanent URLs (serve the SPA shell with injected meta) ─
  const indexHtml = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  app.get('/core/:slug', (req, res) => {
    const core = q.get('SELECT * FROM cores WHERE slug = ? AND archived = 0', req.params.slug);
    if (!core) return res.status(404).send(indexHtml());
    const badge = { verified: ' — Verified community', official: ' — Official CORE community' }[core.verification_status] || '';
    const meta = `
<title>${esc(core.name)} — CORE</title>
<meta name="description" content="${esc(core.definition || `${core.name} on CORE, the index of internet culture.`)}">
<meta property="og:title" content="${esc(core.name + badge)}">
<meta property="og:description" content="${esc(core.definition || '')}">
${core.profile_image ? `<meta property="og:image" content="${esc('/' + core.profile_image)}">` : ''}
<link rel="canonical" href="/core/${esc(core.slug)}">
<meta name="core-route" content="${esc(JSON.stringify({ type: 'core', slug: core.slug, name: core.name }))}">`;
    res.send(injectMeta(indexHtml(), meta));
  });

  app.get('/join/:code', (req, res) => {
    const link = q.get(
      `SELECT l.id, c.name, c.slug, c.definition FROM referral_links l JOIN cores c ON c.id = l.core_id
       WHERE l.id = ? AND l.active = 1 AND c.archived = 0`, req.params.code);
    const meta = link ? `
<title>Join ${esc(link.name)} on CORE</title>
<meta property="og:title" content="Join the ${esc(link.name)} community on CORE">
<meta property="og:description" content="${esc(link.definition || 'The official home of ' + link.name + ' on CORE.')}">
<meta name="core-route" content="${esc(JSON.stringify({ type: 'join', code: link.id, slug: link.slug }))}">` : '';
    res.send(injectMeta(indexHtml(), meta));
  });

  function injectMeta(html, meta) {
    // strip the static <title> and conflicting og tags so the injected ones win
    return html
      .replace(/<title>.*?<\/title>/s, '')
      .replace(/<meta property="og:(?:title|description|url)"[^>]*>\n?/g, '')
      .replace('</head>', `${meta}\n</head>`);
  }

  // ── Legal pages (wallet disclosure lives here) ──────────────────────────
  app.get(['/terms', '/privacy'], (req, res) => {
    res.sendFile(path.join(ROOT, 'legal', req.path === '/terms' ? 'terms.html' : 'privacy.html'));
  });

  // ── Static site (existing frontend, preserved) ──────────────────────────
  // never serve server code, runtime state, node_modules or env files
  app.use(['/server', '/var', '/node_modules', '/.env', '/.git', '/package.json', '/package-lock.json'],
    (_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
  app.use(express.static(ROOT, { index: 'index.html' }));

  // ── Errors ──────────────────────────────────────────────────────────────
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side.' : err.message });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createApp();
  const port = process.env.PORT || 8000;
  app.listen(port, () => {
    console.log(`CORE platform running at http://localhost:${port}`);
    if (!process.env.PRIVY_APP_ID) console.log('⚠ Wallet provider: local-dev (set PRIVY_APP_ID/PRIVY_APP_SECRET for production).');
    if (!process.env.WALLET_MASTER_KEY && !process.env.PRIVY_APP_ID) console.log('⚠ WALLET_MASTER_KEY not set — using an insecure dev-only key.');
  });
  // wallet retry sweep every 5 minutes
  setInterval(() => provisionMissingWallets().catch(() => {}), 300_000).unref();
}
