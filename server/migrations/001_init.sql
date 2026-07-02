-- CORE platform schema (migration 001)

-- ── Identity ──────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  email_verified_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE profiles (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name  TEXT,
  bio           TEXT,
  avatar_path   TEXT,
  is_private    INTEGER NOT NULL DEFAULT 0,      -- hide followed cores/posts from public profile
  show_wallet   INTEGER NOT NULL DEFAULT 0       -- user opt-in to display wallet publicly (default: never shown)
);

-- password / magic-link identities (extensible to oauth later)
CREATE TABLE auth_identities (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'password' CHECK (provider IN ('password','magic_link')),
  password_hash TEXT,                            -- scrypt hash, null for magic_link
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, provider)
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,                -- random 256-bit token (hashed)
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  ip            TEXT,
  user_agent    TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- email verification / password reset / magic link tokens
CREATE TABLE auth_tokens (
  id            TEXT PRIMARY KEY,                -- hashed token
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose       TEXT NOT NULL CHECK (purpose IN ('verify_email','reset_password','magic_link')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  used_at       TEXT
);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id, purpose);

-- dev/prod outgoing mail (dev mode: rows double as a viewable outbox)
CREATE TABLE email_outbox (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email      TEXT NOT NULL,
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at       TEXT
);

-- ── Wallets (background Solana infrastructure) ────────────────────────────
-- Only the PUBLIC address + provider reference live here. Never key material.
CREATE TABLE wallet_associations (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL,                  -- 'privy' | 'local-dev' | ...
  provider_ref   TEXT,                           -- provider-side wallet id
  public_address TEXT NOT NULL UNIQUE,           -- base58 Solana address
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Cores (wiki) ──────────────────────────────────────────────────────────
CREATE TABLE cores (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,           -- /core/<slug>
  name           TEXT NOT NULL UNIQUE,
  definition     TEXT,                           -- short definition
  description    TEXT,                           -- detailed description
  history        TEXT,                           -- origin and history
  cultural_context TEXT,
  visual_characteristics TEXT,                   -- JSON array
  themes         TEXT,                           -- JSON array
  keywords       TEXT,                           -- JSON array
  cover_image    TEXT,
  profile_image  TEXT,
  gallery_dir    TEXT,                           -- maps to assets/cores/<Name>
  verification_status TEXT NOT NULL DEFAULT 'unverified'
                 CHECK (verification_status IN ('unverified','pending','verified','official')),
  archived       INTEGER NOT NULL DEFAULT 0,
  member_count   INTEGER NOT NULL DEFAULT 0,     -- denormalized, maintained by triggers below
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_cores_status ON cores(verification_status);

CREATE TABLE core_aliases (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  core_id  TEXT NOT NULL REFERENCES cores(id) ON DELETE CASCADE,
  alias    TEXT NOT NULL COLLATE NOCASE,
  UNIQUE (core_id, alias)
);
CREATE INDEX idx_aliases_alias ON core_aliases(alias);

CREATE TABLE core_tags (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  core_id  TEXT NOT NULL REFERENCES cores(id) ON DELETE CASCADE,
  tag      TEXT NOT NULL COLLATE NOCASE,
  UNIQUE (core_id, tag)
);
CREATE INDEX idx_tags_tag ON core_tags(tag);

CREATE TABLE core_relationships (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  core_id   TEXT NOT NULL REFERENCES cores(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES cores(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL CHECK (kind IN
            ('parent','child','related','similar','opposing','overlapping','influenced_by','influences')),
  notes     TEXT,
  UNIQUE (core_id, target_id, kind)
);
CREATE INDEX idx_rel_core ON core_relationships(core_id);
CREATE INDEX idx_rel_target ON core_relationships(target_id);

CREATE TABLE external_communities (
  id           TEXT PRIMARY KEY,
  core_id      TEXT NOT NULL REFERENCES cores(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,                    -- facebook | tumblr | reddit | discord | tiktok | instagram | x | website | other
  url          TEXT NOT NULL,
  label        TEXT,
  approx_size  INTEGER,
  is_public    INTEGER NOT NULL DEFAULT 1,       -- show as external link on the core page
  added_by     TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_extcomm_core ON external_communities(core_id);

-- ── Verification ──────────────────────────────────────────────────────────
CREATE TABLE verification_invitations (
  id           TEXT PRIMARY KEY,                 -- opaque id
  core_id      TEXT NOT NULL REFERENCES cores(id) ON DELETE CASCADE,
  code_hash    TEXT NOT NULL UNIQUE,             -- hash of secure invite code
  invitee_email TEXT,
  note         TEXT,
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  used_by      TEXT REFERENCES users(id),
  used_at      TEXT,
  revoked_at   TEXT
);

CREATE TABLE verification_requests (
  id            TEXT PRIMARY KEY,
  core_id       TEXT NOT NULL REFERENCES cores(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitation_id TEXT REFERENCES verification_invitations(id),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked')),
  review_notes  TEXT,                            -- admin-only
  reviewed_by   TEXT REFERENCES users(id),
  reviewed_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_vreq_core ON verification_requests(core_id, status);

-- sensitive: never exposed by public endpoints
CREATE TABLE verification_evidence (
  id           TEXT PRIMARY KEY,
  request_id   TEXT NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,
  community_url TEXT,
  approx_size  INTEGER,
  evidence_text TEXT,                            -- description / proof text / verification code proof
  evidence_url TEXT,                             -- link to a post containing the verification code, etc.
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE verified_representatives (
  id           TEXT PRIMARY KEY,
  core_id      TEXT NOT NULL REFERENCES cores(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id   TEXT REFERENCES verification_requests(id),
  approved_by  TEXT NOT NULL REFERENCES users(id),
  approved_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_verified_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at   TEXT,
  UNIQUE (core_id, user_id)
);

-- ── Community membership & roles ──────────────────────────────────────────
CREATE TABLE community_memberships (
  core_id    TEXT NOT NULL REFERENCES cores(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  TEXT NOT NULL DEFAULT (datetime('now')),
  referral_link_id TEXT,                         -- attribution snapshot
  PRIMARY KEY (core_id, user_id)
);
CREATE INDEX idx_memberships_user ON community_memberships(user_id);

CREATE TRIGGER trg_membership_ins AFTER INSERT ON community_memberships BEGIN
  UPDATE cores SET member_count = member_count + 1 WHERE id = NEW.core_id;
END;
CREATE TRIGGER trg_membership_del AFTER DELETE ON community_memberships BEGIN
  UPDATE cores SET member_count = member_count - 1 WHERE id = OLD.core_id;
END;

-- manager: verified representative; moderator: appointed by manager
CREATE TABLE community_roles (
  core_id    TEXT NOT NULL REFERENCES cores(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('manager','moderator')),
  granted_by TEXT REFERENCES users(id),
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (core_id, user_id, role)
);
CREATE INDEX idx_roles_user ON community_roles(user_id);

-- ── Referral funnels ──────────────────────────────────────────────────────
CREATE TABLE referral_links (
  id          TEXT PRIMARY KEY,                  -- short code used in /join/<code>
  core_id     TEXT NOT NULL REFERENCES cores(id) ON DELETE CASCADE,
  created_by  TEXT NOT NULL REFERENCES users(id),
  label       TEXT,                              -- e.g. "Facebook group pinned post"
  source      TEXT,                              -- facebook | tumblr | reddit | ...
  welcome_message TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  clicks      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reflinks_core ON referral_links(core_id);

CREATE TABLE referral_attributions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id     TEXT NOT NULL REFERENCES referral_links(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id)                               -- first-touch attribution
);

-- ── Content ───────────────────────────────────────────────────────────────
CREATE TABLE posts (
  id          TEXT PRIMARY KEY,
  core_id     TEXT NOT NULL REFERENCES cores(id) ON DELETE CASCADE,  -- every post belongs to a core
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','image','announcement')),
  body        TEXT,
  pinned      INTEGER NOT NULL DEFAULT 0,
  like_count  INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT,
  deleted_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_posts_core ON posts(core_id, pinned DESC, created_at DESC);
CREATE INDEX idx_posts_user ON posts(user_id);

CREATE TABLE media (
  id          TEXT PRIMARY KEY,
  post_id     TEXT REFERENCES posts(id) ON DELETE CASCADE,
  uploader_id TEXT NOT NULL REFERENCES users(id),
  path        TEXT NOT NULL,                     -- under uploads/
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_media_post ON media(post_id);

-- comments and replies (parent_id null = top-level comment)
CREATE TABLE comments (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES comments(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  like_count  INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT,
  deleted_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_comments_post ON comments(post_id, created_at);

CREATE TABLE likes (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','comment')),
  target_id   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, target_type, target_id)
);
CREATE INDEX idx_likes_target ON likes(target_type, target_id);

CREATE TABLE reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  core_id     TEXT NOT NULL REFERENCES cores(id) ON DELETE CASCADE,  -- routing to the right moderators
  target_type TEXT NOT NULL CHECK (target_type IN ('post','comment','user')),
  target_id   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  resolved_by TEXT REFERENCES users(id),
  resolved_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reports_core ON reports(core_id, status);

CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                     -- announcement | reply | like | verification | system
  payload     TEXT NOT NULL,                     -- JSON
  read_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE moderation_actions (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT NOT NULL REFERENCES users(id),
  core_id     TEXT REFERENCES cores(id),
  action      TEXT NOT NULL,                     -- delete_post | delete_comment | pin | unpin | resolve_report | suspend_user | ...
  target_type TEXT,
  target_id   TEXT,
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_modactions_core ON moderation_actions(core_id);

-- ── Administration / audit / distributions ────────────────────────────────
CREATE TABLE audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    TEXT REFERENCES users(id),
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      TEXT,                              -- JSON, must never contain secrets
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_action ON audit_logs(action);

CREATE TABLE distribution_batches (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  criteria    TEXT NOT NULL,                     -- JSON snapshot of eligibility criteria used
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','exported','executed','cancelled')),
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  exported_at TEXT,
  executed_at TEXT,
  tx_signature TEXT                              -- recorded after on-chain execution
);

CREATE TABLE distribution_recipients (
  batch_id    TEXT NOT NULL REFERENCES distribution_batches(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  public_address TEXT NOT NULL,
  amount      TEXT,                              -- string to avoid float issues; unit decided later
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','excluded')),
  tx_signature TEXT,
  PRIMARY KEY (batch_id, user_id)                -- prevents double inclusion per batch
);
CREATE UNIQUE INDEX idx_distrib_addr ON distribution_recipients(batch_id, public_address);

-- ── Anti-abuse signals ────────────────────────────────────────────────────
CREATE TABLE abuse_signals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                     -- duplicate_ip | rapid_signup | suspicious_referral | rate_limited | manual_flag
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_abuse_user ON abuse_signals(user_id);

-- signup fingerprints for duplicate detection (hashed ip + ua)
CREATE TABLE signup_fingerprints (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ip_hash     TEXT,
  ua_hash     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_fingerprint_ip ON signup_fingerprints(ip_hash);
