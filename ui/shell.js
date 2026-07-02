import { assetUrl, escapeHtml, pageUrl } from './core-data.js';
import { session } from './api.js';

const fmt = (value) => new Intl.NumberFormat().format(value || 0);

// ── CORE token / socials ──────────────────────────────────────────────────────
// The token's Solana contract address. Powers the "copy CA" button in the profile
// menu (shows a shortened form, copies the full address). Empty = placeholder.
const CONTRACT = '4FdojUmXeaFMBG6yUaoufAC5Bz7u9AwnSAMizkx5pump';
const shortCa = (ca) => (ca.length > 16 ? `${ca.slice(0, 5)}…${ca.slice(-5)}` : ca);

function navItem(view, label, icon, activeView) {
  const active = view === activeView ? ' is-active' : '';
  return `<button class="nav-item${active}" data-view="${view}" type="button"><span class="nav-icon">${icon}</span><span>${label}</span></button>`;
}

function thumb(path, className, alt = '') {
  return path
    ? `<img class="${className}" src="${assetUrl(path)}" alt="${escapeHtml(alt)}">`
    : `<span class="${className}"></span>`;
}

export function coreListItem(record) {
  return `<a class="recent-item" href="${pageUrl(record.name)}">
    ${thumb(record.path, 'recent-thumb', record.name)}
    <div><div class="recent-name">${escapeHtml(record.name)}</div><div class="recent-meta">${fmt(record.count)} graphics</div></div>
  </a>`;
}

export function sidebar(activeView = 'home', recent = []) {
  return `<aside class="sidebar">
    <div class="sidebar-top">
      <button class="wordmark" data-view="home" type="button">core</button>
      <button class="collapse-btn" type="button" aria-label="Collapse sidebar">«</button>
    </div>
    <nav class="nav-group" aria-label="Core Wiki navigation">
      ${navItem('home', 'Home', '⌂', activeView)}
      ${navItem('cores', 'Cores', '◫', activeView)}
      ${navItem('graphics', 'Graphics', '▣', activeView)}
      ${navItem('liked', 'Liked', '♥', activeView)}
      ${navItem('quiz', 'Find Your Core', '◈', activeView)}
      <button class="nav-item" data-random type="button"><span class="nav-icon">⚄</span><span>Random core</span></button>
      ${navItem('about', 'About', 'ⓘ', activeView)}
    </nav>
    <section class="saved-block recent-block hidden" id="savedBlock"></section>
    <section class="recent-block">
      <p class="block-label">Recently viewed</p>
      <div class="recent-list">
        ${recent.length ? recent.map(coreListItem).join('') : '<div class="recent-meta">No recently viewed cores yet.</div>'}
      </div>
    </section>
    <a class="contribute-card" href="https://t.me/CoreCommunityPort" target="_blank" rel="noopener">
      <div><p class="contribute-title">Submit a core</p><p class="contribute-copy">Send an image + the core name on our Telegram.</p></div><span>→</span>
    </a>
  </aside>`;
}

export function topbar(value = '') {
  const caRow = CONTRACT
    ? `<button class="profile-ca" id="copyCaBtn" type="button" data-ca="${escapeHtml(CONTRACT)}" title="Copy contract address"><span class="profile-ca-text">${escapeHtml(shortCa(CONTRACT))}</span><span>⧉</span></button>`
    : `<div class="profile-ca is-empty"><span class="profile-ca-text">Contract address — add in shell.js</span></div>`;
  return `<div class="topbar">
    <button class="topbar-back hidden" id="topbarBack" type="button" aria-label="Go back">←</button>
    <button class="menu-toggle" id="menuToggle" type="button" aria-label="Open menu">☰</button>
    <form class="search-wrap" id="searchForm">
      <input class="search-input" id="searchInput" name="core" type="search" autocomplete="off" spellcheck="false" placeholder="Search the Core Wiki" value="${escapeHtml(value)}">
      <div class="search-actions"><button class="icon-btn hidden" id="clearButton" type="button">×</button><button class="search-submit" type="submit">Open</button></div>
      <div class="search-suggest hidden" id="searchSuggest"></div>
    </form>
    <div class="icon-strip">
      <button class="icon-btn" id="themeToggle" type="button" aria-label="Toggle dark mode">☼</button>
      ${session.user ? `<div class="profile-wrap">
        <button class="avatar" id="profileToggle" type="button" aria-haspopup="true" aria-expanded="false">${escapeHtml((session.user.display_name || session.user.username || '?')[0].toUpperCase())}</button>
        <div class="profile-menu hidden" id="profileMenu">
          <p class="profile-menu-label">@${escapeHtml(session.user.username)}${session.user.email_verified ? '' : ' · email unverified'}</p>
          <button class="profile-link" data-view="account" type="button"><span>Account settings</span><span>→</span></button>
          ${session.user.role === 'admin' ? '<a class="profile-link" href="/admin/"><span>Admin area</span><span>→</span></a>' : ''}
          <button class="profile-link" id="logoutLink" type="button"><span>Sign out</span><span>→</span></button>
          <p class="profile-menu-label">CORE on Solana</p>
          ${caRow}
          <a class="profile-link" href="https://t.me/CoreCommunityPort" target="_blank" rel="noopener"><span>Telegram</span><span>→</span></a>
          <a class="profile-link" href="https://linktr.ee/corecore_on_sol" target="_blank" rel="noopener"><span>All links</span><span>→</span></a>
        </div>
      </div>` : `<button class="signin-btn" data-view="login" type="button">Sign in</button>
      <div class="profile-wrap">
        <button class="avatar" id="profileToggle" type="button" aria-haspopup="true" aria-expanded="false">☰</button>
        <div class="profile-menu hidden" id="profileMenu">
          <button class="profile-link" data-view="register" type="button"><span>Create account</span><span>→</span></button>
          <button class="profile-link" data-view="login" type="button"><span>Sign in</span><span>→</span></button>
          <p class="profile-menu-label">CORE on Solana</p>
          ${caRow}
          <a class="profile-link" href="https://t.me/CoreCommunityPort" target="_blank" rel="noopener"><span>Telegram</span><span>→</span></a>
          <a class="profile-link" href="https://linktr.ee/corecore_on_sol" target="_blank" rel="noopener"><span>All links</span><span>→</span></a>
        </div>
      </div>`}
    </div>
  </div>`;
}

export function footer() {
  return '<div class="footer-line"><span>© 2026 Core Wiki. All rights reserved.</span><div class="footer-links"><a href="/privacy">Privacy</a> <a href="/terms">Terms</a> <a href="https://t.me/CoreCommunityPort" target="_blank" rel="noopener">Contact</a></div></div>';
}

export function imageThumb(path, className, alt = '') {
  return thumb(path, className, alt);
}
