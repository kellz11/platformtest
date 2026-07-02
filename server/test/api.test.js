// Acceptance tests for the four flows required by the spec, plus permission
// and wallet-security checks. Runs against an in-process server with a temp DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'core-test-'));
process.env.DATABASE_FILE = path.join(tmp, 'test.db');
process.env.WALLET_KEYSTORE_FILE = path.join(tmp, 'keystore.jsonl');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'admin-password-123';
process.env.ADMIN_USERNAME = 'core_admin';

const { seed } = await import('../seed.js');
const { createApp } = await import('../index.js');
const { q } = await import('../db.js');

seed({ quiet: true });
const app = createApp();
const server = app.listen(0);
const PORT = server.address().port;
const BASE = `http://localhost:${PORT}`;

// tiny client with cookie jars per identity
function client() {
  let cookie = '';
  return {
    async req(method, url, body, extra = {}) {
      const res = await fetch(BASE + url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra.headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      let json = null;
      const text = await res.text();
      try { json = JSON.parse(text); } catch { json = { _raw: text }; }
      return { status: res.status, body: json, text };
    },
    get(u) { return this.req('GET', u); },
    post(u, b) { return this.req('POST', u, b); },
    patch(u, b) { return this.req('PATCH', u, b); },
    del(u, b) { return this.req('DELETE', u, b); },
  };
}

async function registerAndVerify(c, n) {
  const r = await c.post('/api/auth/register', {
    email: `${n}@test.local`, password: 'password-123', username: n, accept_terms: true,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const mail = q.get('SELECT body FROM email_outbox WHERE to_email = ? ORDER BY id DESC', `${n}@test.local`);
  const token = mail.body.match(/token=([\w-]+)/)[1];
  const v = await c.post('/api/auth/verify-email', { token });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return v.body;
}

const admin = client();

test.before(async () => {
  const r = await admin.post('/api/auth/login', { email: 'admin@test.local', password: 'admin-password-123' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'admin');
});

test.after(() => server.close());

// ════ 1. Verified-community acceptance test ════════════════════════════════
test('verified-community workflow', async () => {
  // 1. Admin creates a core
  const created = await admin.post('/api/admin/cores', { name: 'Testwavecore', definition: 'A test aesthetic.' });
  assert.equal(created.status, 201);
  const slug = created.body.slug;

  // 2. Page initially unverified
  let page = await admin.get(`/api/cores/${slug}`);
  assert.equal(page.body.core.verification_status, 'unverified');

  // 3. Admin records the existing external community
  const ext = await admin.post(`/api/admin/cores/${slug}/external-communities`, {
    platform: 'facebook', url: 'https://facebook.com/groups/testwave', approx_size: 250000,
  });
  assert.equal(ext.status, 201);

  // 4. Admin sends a secure invitation
  const inv = await admin.post(`/api/admin/cores/${slug}/verification-invitations`, {
    invitee_email: 'rep@test.local', note: 'FB group owner',
  });
  assert.equal(inv.status, 201);
  const code = inv.body.url.match(/code=([\w-]+)/)[1];

  // 5. Representative creates an account (and verifies email)
  const rep = client();
  await registerAndVerify(rep, 'rep_user');

  // 6. Representative submits verification evidence
  const claim = await rep.post(`/api/verification/invitations/${code}/claim`, {
    platform: 'facebook', community_url: 'https://facebook.com/groups/testwave',
    approx_size: 250000, evidence_text: 'Pinned verification code CORE-XYZ posted as group admin.',
    evidence_url: 'https://facebook.com/groups/testwave/posts/1',
  });
  assert.equal(claim.status, 201, JSON.stringify(claim.body));

  // 7. Page shows pending verification
  page = await rep.get(`/api/cores/${slug}`);
  assert.equal(page.body.core.verification_status, 'pending');

  // Sensitive evidence must NOT appear in public core payload
  assert.ok(!JSON.stringify(page.body).includes('CORE-XYZ'));

  // 8. Admin approves
  const pending = await admin.get('/api/admin/verification-requests?status=pending');
  const reqId = pending.body.requests.find((r) => r.core_slug === slug).id;
  const detail = await admin.get(`/api/admin/verification-requests/${reqId}`);
  assert.ok(detail.body.evidence[0].evidence_text.includes('CORE-XYZ')); // admin can review evidence
  const review = await admin.post(`/api/admin/verification-requests/${reqId}/review`, { approve: true, notes: 'Confirmed via FB post.' });
  assert.equal(review.status, 200);

  // 9. Page shows verified status
  page = await rep.get(`/api/cores/${slug}`);
  assert.equal(page.body.core.verification_status, 'verified');
  assert.equal(page.body.core.viewer.role, 'manager');

  // 10. Management permissions apply ONLY to that community
  const other = q.get(`SELECT slug FROM cores WHERE slug != ? LIMIT 1`, slug);
  const denied = await rep.patch(`/api/community/${other.slug}/profile`, { definition: 'hijack' });
  assert.equal(denied.status, 403);
  const allowed = await rep.patch(`/api/community/${slug}/profile`, { definition: 'Updated by the verified rep.' });
  assert.equal(allowed.status, 200);

  // representative cannot self-grant platform admin or approve verifications
  const adminDenied = await rep.get('/api/admin/verification-requests');
  assert.equal(adminDenied.status, 403);
});

// ════ 2. External-funnel acceptance test ═══════════════════════════════════
test('external-funnel workflow', async () => {
  const slug = 'testwavecore';
  const rep = client();
  await rep.post('/api/auth/login', { email: 'rep_user@test.local', password: 'password-123' });

  // 1. Verified manager creates an invitation link
  const link = await rep.post(`/api/referrals/cores/${slug}/links`, {
    label: 'Facebook pinned post', source: 'facebook', welcome_message: 'Welcome home, Testwave fam!',
  });
  assert.equal(link.status, 201);
  const code = link.body.code;

  // 2–3. A new visitor opens the link and sees the correct official community
  const visitor = client();
  const landing = await visitor.get(`/api/referrals/join/${code}`);
  assert.equal(landing.status, 200);
  assert.equal(landing.body.link.core.slug, slug);
  assert.equal(landing.body.link.core.verification_status, 'verified');
  assert.equal(landing.body.link.welcome_message, 'Welcome home, Testwave fam!');

  // QR code works
  const qr = await fetch(`${BASE}/api/referrals/join/${code}/qr.svg`);
  assert.equal(qr.status, 200);
  assert.ok((await qr.text()).startsWith('<svg'));

  // /join/<code> serves the SPA with CSP-safe route data (meta tag, no inline script)
  const html = await (await fetch(`${BASE}/join/${code}`)).text();
  assert.ok(html.includes('name="core-route"'));
  assert.ok(html.includes('&quot;type&quot;:&quot;join&quot;'));
  assert.ok(!html.includes('__CORE_ROUTE__='), 'no inline script injection (blocked by CSP)');

  // 4. Visitor creates an account with the join code
  const r = await visitor.post('/api/auth/register', {
    email: 'newfan@test.local', password: 'password-123', username: 'newfan', accept_terms: true, join_code: code,
  });
  assert.equal(r.status, 201);
  const mail = q.get('SELECT body FROM email_outbox WHERE to_email = ?', 'newfan@test.local');
  const token = mail.body.match(/token=([\w-]+)/)[1];

  // 5. After verification the visitor automatically joins that community
  const v = await visitor.post('/api/auth/verify-email', { token });
  assert.equal(v.body.joined_core.slug, slug);

  // 6. Referral source recorded
  const links = await rep.get(`/api/referrals/cores/${slug}/links`);
  const mine = links.body.links.find((l) => l.code === code);
  assert.equal(mine.signups, 1);
  assert.equal(mine.joins, 1);
  assert.ok(mine.clicks >= 1);

  // 7. The new member can post and participate
  const post = await visitor.req('POST', `/api/community/${slug}/posts`, undefined, {
    headers: { 'Content-Type': 'application/json' },
  });
  const post2 = await visitor.post(`/api/community/${slug}/posts`, { body: 'So glad this community has a real home now!' });
  assert.equal(post2.status, 201, JSON.stringify(post2.body));
});

// ════ 3. Background-wallet acceptance test ═════════════════════════════════
test('background-wallet workflow', async () => {
  // 1–2. New user registers + verifies → wallet provisioned automatically
  const c = client();
  await registerAndVerify(c, 'wallet_user');

  const u = q.get('SELECT id FROM users WHERE username = ?', 'wallet_user');
  const w = q.get('SELECT * FROM wallet_associations WHERE user_id = ?', u.id);
  assert.ok(w, 'wallet was provisioned');
  // 4. Public address associated with the correct internal user id
  assert.match(w.public_address, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/); // base58 Solana format

  // 3. The registration/verification responses never mentioned wallets/crypto
  //    (no crypto terminology in the onboarding flow)
  const reg = await client().post('/api/auth/register', {
    email: 'quiet@test.local', password: 'password-123', username: 'quietuser', accept_terms: true,
  });
  const onboardingText = JSON.stringify(reg.body).toLowerCase();
  for (const word of ['wallet', 'solana', 'crypto', 'token', 'seed phrase', 'blockchain']) {
    assert.ok(!onboardingText.includes(word), `onboarding mentions "${word}"`);
  }

  // 5. Address accessible under advanced account settings (owner only)
  const mine = await c.get('/api/account/wallet');
  assert.equal(mine.status, 200);
  assert.equal(mine.body.wallet.public_address, w.public_address);

  // 6. Another user cannot access it
  const other = client();
  await registerAndVerify(other, 'nosy_user');
  const theirs = await other.get('/api/account/wallet');
  assert.notEqual(theirs.body.wallet.public_address, w.public_address);
  // no API exposes another user's wallet
  const profile = await other.get('/api/account/users/wallet_user');
  assert.ok(!JSON.stringify(profile.body).includes(w.public_address));

  // 7. No private key in the database or API responses
  const dbDump = q.all('SELECT * FROM wallet_associations');
  const dump = JSON.stringify(dbDump) + JSON.stringify(mine.body);
  assert.ok(!/pkcs8|ciphertext|private[_ ]?key|secret[_ ]?key|seed[_ ]?phrase/i.test(dump));
  const walletCols = Object.keys(dbDump[0]);
  assert.deepEqual(walletCols.sort(), ['created_at', 'provider', 'provider_ref', 'public_address', 'status', 'user_id']);
  // keystore lives outside the DB and is encrypted
  const keystore = fs.readFileSync(process.env.WALLET_KEYSTORE_FILE, 'utf8');
  assert.ok(keystore.includes('ciphertext'));
  assert.ok(!keystore.includes('BEGIN PRIVATE KEY'));

  // 8. Admin can export approved public addresses without touching keys
  const batch = await admin.post('/api/admin/distributions', { label: 'Early adopters', criteria: {} });
  assert.equal(batch.status, 201);
  assert.ok(batch.body.recipient_count >= 1);
  const csv = await fetch(`${BASE}/api/admin/distributions/${batch.body.batch_id}/export`, {
    headers: { Cookie: (await adminCookie()) },
  });
  const csvText = await csv.text();
  assert.ok(csvText.startsWith('user_id,public_address,status'));
  assert.ok(!/pkcs8|ciphertext|private[_ ]?key/i.test(csvText));

  // double-inclusion prevented: same user cannot appear twice in a batch
  const rows = csvText.trim().split('\n').slice(1).map((l) => l.split(',')[0]);
  assert.equal(rows.length, new Set(rows).size);

  // non-admin cannot export
  const denied = await c.get(`/api/admin/distributions/${batch.body.batch_id}/export`);
  assert.equal(denied.status, 403);

  // 9. Terms + privacy disclose wallet provisioning
  const terms = await (await fetch(`${BASE}/terms`)).text();
  const privacy = await (await fetch(`${BASE}/privacy`)).text();
  assert.ok(terms.includes('not</strong> required to purchase cryptocurrency'));
  assert.ok(privacy.toLowerCase().includes('public'));
  assert.ok(privacy.includes('never enters CORE'));
});

async function adminCookie() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.local', password: 'admin-password-123' }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

// ════ 4. Community acceptance test ═════════════════════════════════════════
test('community workflow', async () => {
  const slug = 'dreamcore';
  const alice = client(); await registerAndVerify(alice, 'alice');
  const bob = client(); await registerAndVerify(bob, 'bob');

  // 1–2. Join updates member count
  const before = (await alice.get(`/api/cores/${slug}`)).body.core.member_count;
  const join = await alice.post(`/api/community/${slug}/join`);
  assert.equal(join.body.member_count, before + 1);
  await bob.post(`/api/community/${slug}/join`);

  // 3. Alice posts
  const post = await alice.post(`/api/community/${slug}/posts`, { body: 'Dreamcore forever.' });
  assert.equal(post.status, 201);
  const postId = post.body.post_id;

  // 4. Bob comments; 5. Alice replies
  const comment = await bob.post(`/api/community/${slug}/posts/${postId}/comments`, { body: 'Agreed!' });
  assert.equal(comment.status, 201);
  const reply = await alice.post(`/api/community/${slug}/posts/${postId}/comments`, { body: 'Welcome!', parent_id: comment.body.comment_id });
  assert.equal(reply.status, 201);

  // 6. Likes on posts and comments
  const like = await bob.post(`/api/community/${slug}/posts/${postId}/like`);
  assert.equal(like.body.like_count, 1);
  const clike = await alice.post(`/api/community/${slug}/comments/${comment.body.comment_id}/like`);
  assert.equal(clike.body.like_count, 1);

  // 7. Users can remove only their own content
  const denied = await bob.del(`/api/community/${slug}/posts/${postId}`);
  assert.equal(denied.status, 403);
  const ownDelete = await bob.del(`/api/community/${slug}/comments/${comment.body.comment_id}`);
  assert.equal(ownDelete.status, 200);

  // 8. Moderators can moderate ONLY their assigned communities
  const rep = client();
  await rep.post('/api/auth/login', { email: 'rep_user@test.local', password: 'password-123' });
  const wrongCore = await rep.del(`/api/community/${slug}/posts/${postId}`); // rep manages testwavecore, not dreamcore
  assert.equal(wrongCore.status, 403);

  // 9. Reports visible to authorized moderators/admins only
  const report = await bob.post(`/api/community/${slug}/report`, { target_type: 'post', target_id: postId, reason: 'Testing the report queue.' });
  assert.equal(report.status, 201);
  const reportsDenied = await bob.get(`/api/community/${slug}/reports`);
  assert.equal(reportsDenied.status, 403);
  const reportsAdmin = await admin.get(`/api/community/${slug}/reports`);
  assert.equal(reportsAdmin.status, 200);
  assert.ok(reportsAdmin.body.reports.some((r) => r.target_id === postId));

  // every post belongs to a specific core (no universal feed leak)
  const otherFeed = await alice.get('/api/community/testwavecore/posts');
  assert.ok(!otherFeed.body.posts.some((p) => p.id === postId));

  // posting requires membership
  const outsider = client(); await registerAndVerify(outsider, 'outsider');
  const noPost = await outsider.post(`/api/community/${slug}/posts`, { body: 'drive-by' });
  assert.equal(noPost.status, 403);
});

// ════ Extra security checks ════════════════════════════════════════════════
test('auth & permission hardening', async () => {
  // no public core creation — regular users cannot create cores at all
  const c = client(); await registerAndVerify(c, 'plainuser');
  const create = await c.post('/api/admin/cores', { name: 'Fakecore' });
  assert.equal(create.status, 403);

  // unauthenticated requests rejected
  const anon = client();
  assert.equal((await anon.post('/api/community/dreamcore/join')).status, 401);
  assert.equal((await anon.get('/api/account/wallet')).status, 401);
  assert.equal((await anon.get('/api/admin/users')).status, 401);

  // password reset works and invalidates sessions
  await c.post('/api/auth/forgot-password', { email: 'plainuser@test.local' });
  const mail = q.get(`SELECT body FROM email_outbox WHERE to_email = 'plainuser@test.local' AND subject LIKE '%Reset%'`);
  const token = mail.body.match(/token=([\w-]+)/)[1];
  const reset = await client().post('/api/auth/reset-password', { token, password: 'new-password-456' });
  assert.equal(reset.status, 200);
  assert.equal((await c.get('/api/account/settings')).status, 401); // old session dead
  const relogin = await c.post('/api/auth/login', { email: 'plainuser@test.local', password: 'new-password-456' });
  assert.equal(relogin.status, 200);

  // search distinguishes verified communities
  const s = await c.get('/api/search?q=testwave');
  assert.equal(s.body.cores[0].result_type, 'verified_community');

  // public profile never leaks email
  const prof = await c.get('/api/account/users/alice');
  assert.ok(!JSON.stringify(prof.body).includes('@test.local'));

  // suspension blocks login
  const target = q.get(`SELECT id FROM users WHERE username = 'outsider'`);
  await admin.post(`/api/admin/users/${target.id}/suspend`, { reason: 'test' });
  const suspLogin = await client().post('/api/auth/login', { email: 'outsider@test.local', password: 'password-123' });
  assert.equal(suspLogin.status, 403);

  // audit log recorded sensitive actions
  const log = await admin.get('/api/admin/audit-log');
  const actions = log.body.log.map((l) => l.action);
  for (const a of ['core.created', 'verification.approved', 'distribution.exported', 'user.suspended']) {
    assert.ok(actions.includes(a), `audit log missing ${a}`);
  }
});
