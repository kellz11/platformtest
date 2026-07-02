# CORE — Platform Documentation

CORE started as a static, searchable wiki of internet aesthetics. This document covers the community platform built on top of it: accounts, verified communities, onboarding funnels, moderation, and the background wallet system. Everything the static site did before — search, wiki articles, galleries, the graph, the quiz, liked images — still works exactly as it did.

---

## 1. Install & run

Requirements: **Node.js 22+** (the platform uses the built-in `node:sqlite` module — no database server needed).

```bash
npm install                       # express, multer, qrcode
cp .env.example .env              # then edit: at minimum ADMIN_EMAIL / ADMIN_PASSWORD
node --env-file=.env server/seed.js    # creates the DB, imports all cores, creates the admin
node --env-file=.env server/index.js   # serves site + API at http://localhost:8000
```

npm scripts (export env vars or use `node --env-file=.env` as above):

| command | what it does |
|---|---|
| `npm start` | run the platform server |
| `npm run dev` | run with auto-restart on file changes |
| `npm run seed` | create/upgrade the database, import cores from `assets/cores/manifest.json` and the curated relationship graph, create the initial admin |
| `npm test` | run the API integration test suite |

The seed is idempotent — run it again after adding images to the manifest and nothing existing is touched.

### First steps after seeding
1. Sign in at `/?view=login` with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. Open **/admin/** from the avatar menu.
3. During development, verification/invitation emails appear under **Admin → Dev outbox**.

---

## 2. Production deployment

1. Set `NODE_ENV=production`, a real `APP_URL` (e.g. `https://core.example`), and a strong `ADMIN_PASSWORD`.
2. Run behind a TLS-terminating reverse proxy (Caddy/nginx). The app sets `trust proxy`, and session cookies gain the `Secure` flag in production.
3. **Wallets:** set `PRIVY_APP_ID` / `PRIVY_APP_SECRET` (Privy server wallets, Solana). Without a provider configured, production still runs but requires `WALLET_MASTER_KEY` for the local keystore — the managed provider is strongly recommended (see §7).
4. **Email:** wire a real sender in `server/lib/email.js` (`sendMail()` is the single choke point — swap the outbox write for an SMTP/SES/Postmark call). Until then, mail lands in the dev outbox, which is disabled in production.
5. Persist the `var/` directory (SQLite DB, WAL files, uploads, dev keystore) across deploys; back it up.
6. SQLite in WAL mode comfortably serves this workload on one node. If the platform outgrows it, the schema is portable to Postgres.

The old GitHub-Pages/static deployment still works for the wiki-only experience, but none of the platform features (accounts, communities, feeds) function without the Node server.

---

## 3. What was preserved

- All existing pages and behavior: home, Cores, Graphics, graph view, About, quiz, liked images, recently viewed, dark mode, the Fandom article loader, local galleries and the lightbox.
- The visual design: the platform UI (`ui/platform.css`) only *adds* components built from the same tokens (`--panel`, `--line`, radii, Inter) and inherits dark mode automatically.
- Query-param routing (`?core=…`, `?view=…`) still works; the server adds permanent, shareable paths `/core/<slug>` and `/join/<code>` with server-injected SEO/OpenGraph meta.

## 4. Files added / changed

**New backend** — `server/` (Express + `node:sqlite`):
`index.js` (app, static serving, SEO routes, error handling) · `db.js` (connection, migrations) · `seed.js` · `migrations/001_init.sql` (full schema) · `lib/` (`auth.js` sessions & permissions, `email.js`, `ratelimit.js`, `util.js`) · `routes/` (`auth`, `account`, `cores` + search, `community`, `verification`, `referrals`, `admin`) · `wallets/` (`index.js` orchestration, `privy.js` provider, `local.js` dev provider) · `test/api.test.js`.

**New frontend** — `ui/api.js` (API client, session, badges), `ui/account-ui.js` (login/register/verify/reset/claim/join/account views), `ui/community.js` (community panel: feed, composer, comments, likes, reports, manager toolkit), `ui/platform.css`, `admin/` (admin console), `legal/terms.html`, `legal/privacy.html`.

**Modified** — `index.html` (loads `platform.css`), `ui/app.js` (routes for the new views; DB-backed core pages; community panel mount), `ui/shell.js` (sign-in state in the topbar, account menu, footer legal links), `package.json` (scripts + deps).

---

## 5. Architecture

### Accounts & sessions
Email + password (scrypt with per-user salt, constant-time compare). Sessions are opaque 256-bit tokens stored **hashed** (SHA-256) server-side and sent as an `HttpOnly; SameSite=Lax` cookie (30 days, `Secure` in production). Email verification and password reset use single-use, expiring, hashed tokens; resets invalidate all sessions. Login errors are generic and password-reset never confirms whether an email exists.

### Cores & verification
Core pages are database records; **creation is admin-only** (there is deliberately no public "create a core" anywhere in UI or API). Verification is a four-state flow:

```
unverified ──(admin sends invitation, rep submits evidence)──▶ pending
pending ──(admin approves)──▶ verified ──(admin promotes)──▶ official
   └──(admin rejects, no other pending/reps)──▶ unverified
verified/official ──(admin revokes)──▶ unverified (managers removed)
```

Invitations are 24-byte single-use codes, stored hashed, expiring after 14 days; the raw link is shown to the admin exactly once. Evidence (platform, URL, size, proof text/link) is visible only to admins. Approval atomically records the representative, grants the `manager` role, joins them to the community and flips the core to `verified`. Badges on the site are deliberately quiet — a tinted dot and words, not a blue check.

### Permissions
Three layers: site `admin` → community `manager` (edit community profile, pin, announce, add/remove moderators, create invitation links) → community `moderator` (delete posts/comments, resolve reports), each scoped to their own community and enforced server-side on every route (`requireAdmin`, `canManage`, `canModerate`). Community managers cannot touch wiki content beyond their community profile fields, other communities, or site settings.

### Communities
Join/leave, text/image posts (8 MB, image types only, stored outside the web root and served from `/uploads`), pinned posts, announcements (manager-only, notify all members), threaded comments, likes, reports. Member counts are denormalized via DB triggers.

### External onboarding funnels
Managers/admins create referral links → `/join/<code>` renders an official landing page (community identity, badge, welcome message, what CORE is) with a QR code endpoint for print/pinned posts. Clicks are counted; the code is attributed at registration (first touch, one attribution per user); after **email verification** the user is auto-joined to the community and the membership records the link. The admin dashboard reports clicks → signups → joins per link.

### Anti-abuse
Per-route rate limits (login, registration, posting, reporting…), signup fingerprints (IP/user-agent), automatic `rapid_signup` signals (>3 accounts/24 h per IP), account suspension (kills sessions; admins can't be suspended), moderation actions log, and a full audit log of sensitive actions. Flagged accounts are excluded from distributions.

---

## 6. Background wallet system

- On **email verification** (not registration) a Solana wallet is provisioned for the user in the background; a retry sweep runs every 5 minutes for any that failed. Nothing about the flow requires user action and registration copy never mentions crypto.
- **Provider abstraction** (`server/wallets/`): with `PRIVY_APP_ID`/`PRIVY_APP_SECRET` set, Privy server wallets create and custody the keys — key material never exists in this application. Without it, a **development** provider generates ed25519 keypairs locally and stores the secret AES-256-GCM-encrypted in `WALLET_KEYSTORE_FILE`, a file **outside the application database**; the app DB stores only `(user_id, public_address, provider, status)`.
- **Disclosure:** `/terms` and `/privacy` (linked from the required registration checkbox and the footer) state that an account may include a platform-managed digital wallet used for potential community rewards, that no purchase or deposit is ever required, and how the address is used.
- **Visibility:** the wallet appears in exactly one place — **Account settings → Advanced → Digital wallet** (address, status, copy button, plain-language explanation). It is never shown on public profiles or anywhere else, and the API only ever returns it to its owner.
- **Distributions:** admins create eligibility batches from criteria (account age, community membership, minimum posts, representatives-only). Suspended, email-unverified and abuse-flagged accounts are always excluded. Exports are CSVs of **public addresses only**. A recipient appears at most once per batch (composite PK) and a batch can be marked executed exactly once with its transaction signature — double distribution is prevented at the database level. Actual token transfers happen outside this application by design.

---

## 7. Security notes & known limitations

- **Dev wallet keystore is not production custody.** The local provider exists so the full flow is testable; real deployments should use the managed provider. If the local provider must be used, `WALLET_MASTER_KEY` is mandatory and the keystore file needs the same protection as any secret store.
- **Email sending is a stub** (DB outbox + console) until a provider is wired into `server/lib/email.js`.
- **Rate limiting is in-memory** (per process). Fine for one node; use a shared store if you scale horizontally.
- Search is SQL `LIKE`-based — good for this catalog size, not full-text ranking.
- No CSRF tokens: the API is same-origin with `SameSite=Lax` cookies and JSON bodies, which covers the current threat model; add tokens if cross-site embedding is ever needed.
- Image uploads are extension/MIME-checked and size-capped but not re-encoded; consider server-side re-encoding (e.g. sharp) before large-scale public use.
- The Fandom article panel still loads from `aesthetics.fandom.com` client-side (preserved behavior) and is subject to that site's availability.
- Out of scope, per the brief: token trading, NFT features, DMs, and public core creation.

## 8. Test results

`npm test` — 5/5 passing (Node's built-in test runner, real HTTP against a temp database):
1. **Verified community journey** — admin creates a core → invitation → representative registers, verifies email, submits evidence → admin approves → badge changes, manager can pin/announce, non-managers can't.
2. **External funnel** — manager creates a referral link → landing data → signup with attribution → auto-join on email verification → analytics show click/signup/join.
3. **Background wallet** — wallet exists after email verification (not before); address visible only to its owner under account settings; **no private key material anywhere in the app DB**; distribution export contains public addresses only.
4. **Community life** — join, post (text+image), comment, like, report, moderator resolves; moderator powers stop at their own community.
5. **Hardening** — auth validation, generic login errors, suspended-account lockout, permission denials, rate limits.

## 9. Suggested next phase

Real email provider + SPF/DKIM; Privy production keys; image re-encoding; notification UI (the data model already records notifications); member directories and community search filters; Postgres migration if traffic warrants it.
