import { assetUrl, clean, escapeHtml, getStats, loadManifest, normalize } from './core-data.js';
import { loadCore } from './article.js';
import { homeView, coreView } from './views.js';
import { aboutView, coresView, graphicsView, likedView } from './sections.js';
import { graphView, mountCoreGraph } from './graph.js';
import { buildCoreGraph } from './graph-data.js';
import { quizView, wireQuiz } from './quiz.js';
import { coreListItem } from './shell.js';
import { coreAccent } from './accent.js';
import { api, session, loadSession, logout, coreSlug } from './api.js';
import { mountCommunity } from './community.js';
import * as account from './account-ui.js';

const app = document.getElementById('app');
const RECENT_KEY = 'coreWikiRecent';
const FAV_KEY = 'coreWikiFavorites';
const LIKED_KEY = 'coreWikiLikes';
const THEME_KEY = 'coreWikiTheme';
const SIDEBAR_KEY = 'coreWikiSidebar';
const VALID_VIEWS = new Set(['home', 'cores', 'graphics', 'graph', 'about', 'quiz', 'liked', 'login', 'register', 'forgot', 'reset', 'verify', 'checkEmail', 'account', 'claim', 'join']);

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
}

function initTheme() {
  let theme = localStorage.getItem(THEME_KEY);
  if (!theme) {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(theme);
}

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'open');
}

function initSidebar() {
  if (localStorage.getItem(SIDEBAR_KEY) === 'collapsed') document.body.classList.add('sidebar-collapsed');
  // Floating button to bring the sidebar back (the in-sidebar toggle is hidden when collapsed).
  // Lives outside #app so it survives route re-renders.
  if (!document.getElementById('sidebarExpand')) {
    const expand = document.createElement('button');
    expand.id = 'sidebarExpand';
    expand.className = 'sidebar-expand';
    expand.type = 'button';
    expand.setAttribute('aria-label', 'Expand sidebar');
    expand.textContent = '»';
    expand.addEventListener('click', () => setSidebarCollapsed(false));
    document.body.appendChild(expand);
  }
}

// Mobile only: backdrop behind the slide-in nav drawer. Lives outside #app so it
// survives route re-renders; tapping it closes the drawer. (Inert on desktop — CSS
// keeps it display:none above the mobile breakpoint.)
function initMobileNav() {
  if (document.getElementById('navBackdrop')) return;
  const backdrop = document.createElement('div');
  backdrop.id = 'navBackdrop';
  backdrop.className = 'nav-backdrop';
  backdrop.addEventListener('click', () => document.body.classList.remove('nav-open'));
  document.body.appendChild(backdrop);
}

// ── Analytics (GoatCounter — privacy-friendly, no cookies) ──────────────────────
// Set ANALYTICS_CODE to your GoatCounter site code (the "xxx" in xxx.goatcounter.com)
// to enable it. Empty = fully disabled, no script loaded, zero impact.
const ANALYTICS_CODE = '';
let firstRoute = true;

function initAnalytics() {
  if (!ANALYTICS_CODE) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://gc.zgo.at/count.js';
  script.setAttribute('data-goatcounter', `https://${ANALYTICS_CODE}.goatcounter.com/count`);
  document.head.appendChild(script);
}

function track(options) {
  if (window.goatcounter && typeof window.goatcounter.count === 'function') window.goatcounter.count(options);
}

function trackPageview() {
  if (firstRoute) { firstRoute = false; return; } // GoatCounter's own onload counts the first view
  track({ path: location.pathname + location.search });
}

// Lets other modules (e.g. the quiz) log funnel events without importing anything.
window.coreTrack = (name) => track({ path: name, event: true });
let graphicsLimit = 60;
let graphicsQuery = '';
let graphicsTimer;
let graphicsSort = 'az';   // 'az' | 'known' | 'random'
let graphicsOrder = null;  // cached shuffled order for the 'random' sort
let graphCleanup = null;
let appNavs = 0; // in-app navigation depth — drives the back button's visibility

function getRecentNames() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}

function remember(title) {
  const next = [title, ...getRecentNames().filter((item) => normalize(item) !== normalize(title))].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

async function recentRecords() {
  const manifest = await loadManifest();
  return getRecentNames().map((name) => {
    const record = manifest.get(normalize(name));
    return record ? { name: record.name, count: record.paths.length, path: record.paths[0] || '' } : null;
  }).filter(Boolean);
}

// ── Favorites (localStorage, no backend — saved per browser, like Recently viewed) ──
function getFavorites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
  catch { return []; }
}

function isFavorite(name) {
  return getFavorites().some((item) => normalize(item) === normalize(name));
}

function toggleFavorite(name) {
  const favs = getFavorites();
  const index = favs.findIndex((item) => normalize(item) === normalize(name));
  if (index >= 0) favs.splice(index, 1);
  else favs.unshift(name);
  localStorage.setItem(FAV_KEY, JSON.stringify(favs.slice(0, 50)));
}

async function savedRecords() {
  const manifest = await loadManifest();
  return getFavorites().map((name) => {
    const record = manifest.get(normalize(name));
    return record ? { name: record.name, count: record.paths.length, path: record.paths[0] || '' } : null;
  }).filter(Boolean);
}

// Fills the sidebar "Saved" block from localStorage; hides it when empty. Runs each render.
async function populateSaved() {
  const block = document.getElementById('savedBlock');
  if (!block) return;
  const saved = await savedRecords();
  if (!saved.length) { block.classList.add('hidden'); block.innerHTML = ''; return; }
  block.classList.remove('hidden');
  block.innerHTML = `<p class="block-label">Saved</p><div class="recent-list">${saved.map(coreListItem).join('')}</div>`;
}

// ── Gallery lightbox + image likes ──────────────────────────────────────────────
const HEART_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>';
const SHARE_GLYPH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 15V3"/><path d="m8 7 4-4 4 4"/></svg>';

function getLikes() {
  try { return JSON.parse(localStorage.getItem(LIKED_KEY) || '[]'); }
  catch { return []; }
}
function isLiked(path) { return getLikes().some((item) => item.path === path); }
function toggleLike(path, core) {
  const likes = getLikes();
  const index = likes.findIndex((item) => item.path === path);
  if (index >= 0) likes.splice(index, 1);
  else likes.unshift({ path, core });
  localStorage.setItem(LIKED_KEY, JSON.stringify(likes.slice(0, 300)));
}

const imageLabel = (path) => decodeURIComponent(String(path).split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ');

async function shareImage(item) {
  const rel = assetUrl(item.path);
  const abs = new URL(rel, location.href).href;
  const title = item.core ? `${item.core} — Core Wiki` : 'Core Wiki';
  if (navigator.share) {
    try {
      const blob = await fetch(rel).then((response) => response.blob());
      const file = new File([blob], item.path.split('/').pop() || 'core.jpg', { type: blob.type || 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return 'shared'; }
      await navigator.share({ title, url: abs });
      return 'shared';
    } catch (error) {
      if (error && error.name === 'AbortError') return null; // user cancelled the share sheet
      // otherwise fall through to the copy fallback
    }
  }
  try { await navigator.clipboard.writeText(abs); return 'copied'; }
  catch { return null; }
}

let lightboxEl = null;
// items: [{ path, core }]. Opens a fullscreen viewer at startIndex.
// onClose runs after the viewer closes (e.g. to refresh heart states in a grid).
function openLightbox(items, startIndex, onClose) {
  if (lightboxEl || !items.length) return;
  let i = startIndex;
  const count = items.length;

  lightboxEl = document.createElement('div');
  lightboxEl.className = 'lightbox';
  lightboxEl.innerHTML = `
    <div class="lightbox-backdrop" data-close></div>
    <button class="lightbox-close" data-close type="button" aria-label="Close">✕</button>
    <button class="lightbox-nav lightbox-prev" type="button" aria-label="Previous image">‹</button>
    <figure class="lightbox-stage">
      <img class="lightbox-img" alt="">
      <figcaption class="lightbox-caption"></figcaption>
    </figure>
    <button class="lightbox-nav lightbox-next" type="button" aria-label="Next image">›</button>
    <div class="lightbox-actions">
      <button class="lightbox-action" id="lbLike" type="button">${HEART_ICON}<span>Like</span></button>
      <button class="lightbox-action" id="lbDownload" type="button">${DOWNLOAD_ICON}<span>Download</span></button>
      <button class="lightbox-action" id="lbShare" type="button">${SHARE_GLYPH}<span>Share</span></button>
    </div>`;
  document.body.appendChild(lightboxEl);
  document.body.style.overflow = 'hidden';

  const img = lightboxEl.querySelector('.lightbox-img');
  const caption = lightboxEl.querySelector('.lightbox-caption');
  const likeBtn = lightboxEl.querySelector('#lbLike');
  const shareBtn = lightboxEl.querySelector('#lbShare');

  const render = () => {
    const item = items[i];
    img.src = assetUrl(item.path);
    img.alt = item.core ? `${item.core} graphic` : 'Core graphic';
    const label = imageLabel(item.path);
    caption.innerHTML = item.core
      ? `<button class="lightbox-core" type="button">${escapeHtml(item.core)}</button>${label ? ` · ${escapeHtml(label)}` : ''}`
      : escapeHtml(label);
    const liked = isLiked(item.path);
    likeBtn.classList.toggle('is-liked', liked);
    likeBtn.querySelector('span').textContent = liked ? 'Liked' : 'Like';
  };

  const close = () => {
    lightboxEl?.remove();
    lightboxEl = null;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    onClose?.();
    if (currentView() === 'liked') renderLiked().catch(renderError); // likes may have changed
  };
  const prev = () => { i = (i - 1 + count) % count; render(); };
  const next = () => { i = (i + 1) % count; render(); };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowLeft') prev();
    else if (event.key === 'ArrowRight') next();
  };

  lightboxEl.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  lightboxEl.querySelector('.lightbox-prev').addEventListener('click', prev);
  lightboxEl.querySelector('.lightbox-next').addEventListener('click', next);
  document.addEventListener('keydown', onKey);

  // The core name in the caption is a link back to that core's page.
  lightboxEl.addEventListener('click', (event) => {
    if (event.target.closest('.lightbox-core')) {
      const core = items[i].core;
      close();
      if (core) navigateCore(core);
    }
  });

  likeBtn.addEventListener('click', () => { toggleLike(items[i].path, items[i].core); render(); });

  lightboxEl.querySelector('#lbDownload').addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = assetUrl(items[i].path);
    link.download = `${imageLabel(items[i].path) || 'core-image'}.${items[i].path.split('.').pop() || 'jpg'}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  shareBtn.addEventListener('click', async () => {
    const span = shareBtn.querySelector('span');
    const status = await shareImage(items[i]);
    if (status === 'copied') { span.textContent = 'Link copied'; setTimeout(() => { span.textContent = 'Share'; }, 1600); }
  });

  if (count <= 1) {
    lightboxEl.querySelector('.lightbox-prev').classList.add('hidden');
    lightboxEl.querySelector('.lightbox-next').classList.add('hidden');
  }
  render();
}

async function renderLiked() {
  const recent = await recentRecords();
  const likes = getLikes();
  document.title = 'Liked - Core Wiki';
  app.innerHTML = likedView(likes, recent);
  wireCommon();
  const grid = document.getElementById('likedGrid');
  grid?.addEventListener('click', (event) => {
    const tile = event.target.closest('[data-like-index]');
    if (tile) openLightbox(likes, Number(tile.dataset.likeIndex));
  });
}

function currentView() {
  const params = new URL(location.href).searchParams;
  if (params.get('core')) return 'core';
  const view = params.get('view') || 'home';
  return VALID_VIEWS.has(view) ? view : 'home';
}

function stopGraph() {
  if (typeof graphCleanup === 'function') graphCleanup();
  graphCleanup = null;
}

function goView(view) {
  document.body.classList.remove('nav-open'); // close mobile drawer on navigation
  appNavs += 1;
  const target = VALID_VIEWS.has(view) ? view : 'home';
  const url = new URL(location.href);
  url.pathname = url.pathname.replace(/^\/(core|join)\/.*$/, '/');
  url.search = '';
  if (target !== 'home') url.searchParams.set('view', target);
  history.pushState({ view: target }, '', url);
  renderRoute().catch(renderError);
}

function navigateCore(title) {
  const value = clean(title);
  if (!value) return;
  document.body.classList.remove('nav-open'); // close mobile drawer on navigation
  appNavs += 1;
  const url = new URL(location.href);
  url.pathname = url.pathname.replace(/^\/(core|join)\/.*$/, '/');
  url.search = '';
  url.searchParams.set('core', value);
  history.pushState({ core: value }, '', url);
  renderCore(value).catch(renderError);
}

async function navigateRandomCore() {
  const manifest = await loadManifest();
  const records = [...manifest.values()];
  if (!records.length) return;
  const pick = records[Math.floor(Math.random() * records.length)];
  navigateCore(pick.name);
}

// Related cores = a core's neighbours in the aesthetic graph (hub, siblings, curated edges).
let coreGraphCache = null;
function relatedCoreRecords(name, manifest) {
  if (!coreGraphCache) coreGraphCache = buildCoreGraph([...manifest.values()]);
  const id = normalize(name);
  const byId = new Map([...manifest.values()].map((record) => [normalize(record.name), record]));
  const out = [];
  const seen = new Set([id]);
  for (const edge of coreGraphCache.edges) {
    const other = edge.from === id ? edge.to : (edge.to === id ? edge.from : null);
    if (!other || seen.has(other)) continue;
    seen.add(other);
    const record = byId.get(other);
    if (record) out.push({ name: record.name, path: record.paths[0] || '' });
    if (out.length >= 4) break;
  }
  return out;
}

// ── Forgiving search (fuzzy resolution against the manifest) ────────────────────
function fuzzyMatch(query, text) {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let i = 0;
  for (let c = 0; c < t.length && i < q.length; c += 1) {
    if (t[c] === q[i]) i += 1;
  }
  return i === q.length;
}

// Wires the topbar search: a dropdown of fuzzy matches + forgiving submit, so
// "dream", "dream core" and "dreamcore" all resolve to Dreamcore. Re-runs each render.
function wireSearch() {
  const form = document.getElementById('searchForm');
  const input = document.getElementById('searchInput');
  const clear = document.getElementById('clearButton');
  const suggest = document.getElementById('searchSuggest');
  if (!input) return;

  const refreshClear = () => clear?.classList.toggle('hidden', !input.value);
  refreshClear();

  let names = [];
  loadManifest().then((manifest) => { names = [...manifest.values()].map((record) => record.name); }).catch(() => {});

  let matches = [];
  let active = -1;

  // Rank: exact (after stripping spaces/case) > prefix > substring > subsequence.
  const rank = (query) => {
    const nq = normalize(query);
    if (!nq) return [];
    return names
      .map((name) => {
        const nn = normalize(name);
        let score = -1;
        if (nn === nq) score = 0;
        else if (nn.startsWith(nq)) score = 1;
        else if (nn.includes(nq)) score = 2;
        else if (fuzzyMatch(nq, nn)) score = 3;
        return { name, score, len: name.length };
      })
      .filter((item) => item.score >= 0)
      .sort((a, b) => a.score - b.score || a.len - b.len || a.name.localeCompare(b.name))
      .slice(0, 7);
  };

  const renderSuggest = () => {
    if (!suggest) return;
    if (!matches.length) { suggest.classList.add('hidden'); suggest.innerHTML = ''; return; }
    suggest.classList.remove('hidden');
    suggest.innerHTML = matches.map((m, i) => `<button class="search-suggest-item${i === active ? ' is-active' : ''}" data-name="${escapeHtml(m.name)}" type="button">${escapeHtml(m.name)}</button>`).join('');
    suggest.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  };

  const update = () => { matches = rank(input.value); active = -1; renderSuggest(); };
  const go = (name) => { matches = []; renderSuggest(); navigateCore(name); };

  input.addEventListener('input', () => { refreshClear(); update(); });
  input.addEventListener('focus', () => { if (input.value) update(); });
  input.addEventListener('keydown', (event) => {
    if (!matches.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); active = Math.min(active + 1, matches.length - 1); renderSuggest(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); active = Math.max(active - 1, 0); renderSuggest(); }
    else if (event.key === 'Escape') { suggest?.classList.add('hidden'); }
  });
  input.addEventListener('blur', () => { setTimeout(() => suggest?.classList.add('hidden'), 130); });

  clear?.addEventListener('click', () => { input.value = ''; refreshClear(); update(); input.focus(); });

  // mousedown fires before the input's blur, so the suggestion click always registers.
  suggest?.addEventListener('mousedown', (event) => {
    const item = event.target.closest('.search-suggest-item');
    if (item) { event.preventDefault(); go(item.dataset.name); }
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (active >= 0 && matches[active]) { go(matches[active].name); return; }
    const best = rank(input.value)[0];
    if (best) go(best.name);
    else if (input.value.trim()) navigateCore(input.value);
  });
}

function wireCommon() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => goView(button.dataset.view));
  });

  document.querySelectorAll('[data-random]').forEach((button) => {
    button.addEventListener('click', () => navigateRandomCore().catch(renderError));
  });

  wireThemeToggle();
  wireProfileMenu();

  document.getElementById('logoutLink')?.addEventListener('click', async () => {
    await logout();
    goView('home');
  });

  const collapse = document.querySelector('.collapse-btn');
  collapse?.addEventListener('click', () => setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed')));

  const menuToggle = document.getElementById('menuToggle');
  menuToggle?.addEventListener('click', () => document.body.classList.toggle('nav-open'));

  const back = document.getElementById('topbarBack');
  if (back) {
    back.classList.toggle('hidden', appNavs <= 0);
    back.addEventListener('click', () => history.back());
  }

  const favBtn = document.getElementById('favBtn');
  if (favBtn) {
    const coreName = favBtn.dataset.core;
    const syncFav = () => {
      const on = isFavorite(coreName);
      favBtn.classList.toggle('is-saved', on);
      favBtn.setAttribute('aria-pressed', String(on));
      favBtn.querySelector('.fav-star').textContent = on ? '★' : '☆';
      favBtn.querySelector('.fav-label').textContent = on ? 'Saved' : 'Save';
    };
    syncFav();
    favBtn.addEventListener('click', () => { toggleFavorite(coreName); syncFav(); populateSaved(); });
  }

  populateSaved();

  wireSearch();

  document.querySelectorAll('img').forEach((image) => {
    image.addEventListener('error', () => image.remove(), { once: true });
  });
}

// The topbar is rebuilt on every render, so these re-attach each time.
function wireThemeToggle() {
  const button = document.getElementById('themeToggle');
  if (!button) return;
  const setIcon = () => { button.textContent = document.documentElement.dataset.theme === 'dark' ? '☾' : '☼'; };
  setIcon();
  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
    setIcon();
  });
}

function wireProfileMenu() {
  const toggle = document.getElementById('profileToggle');
  const menu = document.getElementById('profileMenu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = menu.classList.toggle('hidden') === false;
    toggle.setAttribute('aria-expanded', String(open));
  });

  const copyBtn = document.getElementById('copyCaBtn');
  copyBtn?.addEventListener('click', async (event) => {
    event.stopPropagation();
    const label = copyBtn.querySelector('.profile-ca-text');
    const original = label.textContent;
    try {
      await navigator.clipboard.writeText(copyBtn.dataset.ca || '');
      label.textContent = 'Copied!';
      setTimeout(() => { label.textContent = original; }, 1500);
    } catch { /* clipboard unavailable */ }
  });
}

// Close the profile menu on any outside click. Attached once — it looks the
// menu up fresh each time, so it survives re-renders without stacking listeners.
document.addEventListener('click', (event) => {
  const menu = document.getElementById('profileMenu');
  const toggle = document.getElementById('profileToggle');
  if (menu && !menu.classList.contains('hidden') && !menu.contains(event.target) && event.target !== toggle) {
    menu.classList.add('hidden');
    toggle?.setAttribute('aria-expanded', 'false');
  }
});

// Intercept in-app core links (?core=…) so they navigate without a full page reload.
// Keeps SPA state alive (the back button's history depth) and makes every core link
// — home grid, recent, saved, related — instant. Plain left-clicks only.
document.addEventListener('click', (event) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href]');
  if (!link || link.target === '_blank') return;
  let url;
  try { url = new URL(link.href, location.href); } catch { return; }
  if (url.origin !== location.origin) return;
  const core = url.searchParams.get('core');
  if (!core) return;
  event.preventDefault();
  navigateCore(core);
});

function wireSimpleFilter() {
  const input = document.getElementById('sectionSearch');
  const empty = document.getElementById('noResults');
  if (!input) return;

  input.addEventListener('input', () => {
    const needle = input.value.toLowerCase().trim();
    let visible = 0;
    document.querySelectorAll('.filterable').forEach((item) => {
      const haystack = (item.dataset.search || '').toLowerCase();
      const show = !needle || haystack.includes(needle);
      item.classList.toggle('hidden', !show);
      if (show) visible += 1;
    });
    empty?.classList.toggle('hidden', visible > 0);
  });
}

function flattenGraphics(records) {
  return records.flatMap((record) => record.paths.map((path) => ({ core: record.name, path })));
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function renderGraphics(preserveFocus = false) {
  const [stats, recent] = await Promise.all([getStats(), recentRecords()]);
  const all = flattenGraphics(stats.records);

  let ordered;
  if (graphicsSort === 'known') {
    // "Most images" — proxy for popularity: cores with the largest local archive first.
    const countByCore = new Map(stats.records.map((record) => [record.name, record.paths.length]));
    ordered = [...all].sort((a, b) => (countByCore.get(b.core) - countByCore.get(a.core)) || a.core.localeCompare(b.core));
  } else if (graphicsSort === 'random') {
    if (!graphicsOrder) graphicsOrder = shuffle(all);
    ordered = graphicsOrder;
  } else {
    ordered = all; // 'az' — already core-alphabetical from getStats
  }

  const needle = graphicsQuery.toLowerCase().trim();
  const filtered = needle ? ordered.filter((item) => item.core.toLowerCase().includes(needle) || item.path.toLowerCase().includes(needle)) : ordered;
  app.innerHTML = graphicsView(stats, recent, filtered, graphicsLimit, graphicsSort);
  wireCommon();

  document.getElementById('graphicsSort')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-sort]');
    if (!button) return;
    graphicsSort = button.dataset.sort;
    graphicsOrder = null; // clears the cache (and forces a fresh shuffle when 'random')
    graphicsLimit = 60;
    renderGraphics().catch(renderError);
  });

  document.getElementById('graphicsGrid')?.addEventListener('click', (event) => {
    const tile = event.target.closest('[data-graphic-index]');
    if (tile) openLightbox(filtered, Number(tile.dataset.graphicIndex));
  });

  const sectionInput = document.getElementById('sectionSearch');
  if (sectionInput) {
    sectionInput.value = graphicsQuery;
    sectionInput.addEventListener('input', () => {
      graphicsQuery = sectionInput.value;
      graphicsLimit = 60;
      clearTimeout(graphicsTimer);
      graphicsTimer = setTimeout(() => renderGraphics(true).catch(renderError), 120);
    });
    if (preserveFocus) {
      sectionInput.focus();
      sectionInput.setSelectionRange(sectionInput.value.length, sectionInput.value.length);
    }
  }

  document.getElementById('loadMoreGraphics')?.addEventListener('click', () => {
    graphicsLimit += 60;
    renderGraphics().catch(renderError);
  });
}

function wireArticle() {
  const card = document.getElementById('articleCard');
  const body = document.getElementById('articleBody');
  const button = document.getElementById('articleToggle');
  if (!card || !body || !button) return;

  requestAnimationFrame(() => {
    if (body.scrollHeight <= body.clientHeight + 8) button.classList.add('hidden');
  });
  button.addEventListener('click', () => {
    const expanded = body.classList.toggle('is-expanded');
    card.classList.toggle('is-expanded', expanded);
    button.textContent = expanded ? 'Show less' : 'Read full article';
  });
}

async function renderHome() {
  document.title = 'Core Wiki';
  const [stats, recent] = await Promise.all([getStats(), recentRecords()]);
  app.innerHTML = homeView(stats, recent);
  wireCommon();
  document.getElementById('browseAll')?.addEventListener('click', (event) => {
    document.querySelectorAll('[data-core-card]').forEach((card) => card.classList.remove('hidden'));
    event.currentTarget.classList.add('hidden');
  });
}

async function renderGraph() {
  const [stats, recent] = await Promise.all([getStats(), recentRecords()]);
  document.title = 'Core Graph - Core Wiki';
  app.innerHTML = graphView(stats, recent);
  wireCommon();
  graphCleanup = mountCoreGraph(stats.records);
}

async function renderQuiz() {
  const [stats, recent] = await Promise.all([getStats(), recentRecords()]);
  document.title = 'Find Your Core — Core Wiki';
  app.innerHTML = quizView(stats, recent);
  wireCommon();
  wireQuiz();
}

async function renderSection(view) {
  if (view === 'graphics') return renderGraphics();
  if (view === 'graph') return renderGraph();
  if (view === 'quiz') return renderQuiz();
  if (view === 'liked') return renderLiked();
  const [stats, recent] = await Promise.all([getStats(), recentRecords()]);
  const builders = { cores: coresView, about: aboutView };
  const builder = builders[view] || coresView;
  document.title = `${view.charAt(0).toUpperCase() + view.slice(1)} - Core Wiki`;
  app.innerHTML = builder(stats, recent);
  wireCommon();
  wireSimpleFilter();
}

async function renderCore(title) {
  const core = await loadCore(title);
  remember(core.title);
  document.title = `${core.title} - Core Wiki`;
  const [recent, manifest] = await Promise.all([recentRecords(), loadManifest()]);
  const related = relatedCoreRecords(core.title, manifest);
  // Database record for this core (definition, verification status, community)
  try { core.db = (await api(`/cores/${coreSlug(core.title)}`)).core; } catch { core.db = null; }
  app.innerHTML = coreView(core, recent, related);
  wireCommon();
  wireArticle();

  // Community panel (join, feed, verification state, manager tools)
  const communityEl = document.getElementById('communityPanel');
  if (communityEl && core.db) mountCommunity(communityEl, core.db.slug, goView).catch(() => {});

  // Gallery: heart to like in-place, click the image to open the lightbox.
  const galleryGrid = document.querySelector('.gallery-grid');
  if (galleryGrid) {
    const items = core.paths.map((path) => ({ path, core: core.title }));
    const figures = [...galleryGrid.querySelectorAll('.gallery-item')];
    const syncHeart = (figure) => figure.querySelector('.gallery-like')?.classList.toggle('is-liked', isLiked(figure.dataset.path));
    figures.forEach(syncHeart);
    galleryGrid.addEventListener('click', (event) => {
      const likeBtn = event.target.closest('.gallery-like');
      if (likeBtn) {
        const figure = likeBtn.closest('.gallery-item');
        toggleLike(figure.dataset.path, core.title);
        syncHeart(figure);
        return;
      }
      const figure = event.target.closest('.gallery-item');
      if (!figure) return;
      const index = figures.indexOf(figure);
      if (index >= 0) openLightbox(items, index, () => figures.forEach(syncHeart));
    });
  }

  // Tint the page with a colour (or gradient) pulled from the core's own images.
  coreAccent(core.title, core.paths).then((accent) => {
    const hero = document.querySelector('.core-hero');
    if (accent && hero) {
      hero.style.setProperty('--accent', accent.accent);
      hero.style.setProperty('--accent-soft', accent.soft);
      hero.style.setProperty('--accent-grad', accent.grad);
      hero.style.setProperty('--accent-wash', accent.wash);
      hero.style.setProperty('--accent-wash-dark', accent.washDark);
    }
  });
}

const PLATFORM_VIEWS = {
  login: [account.loginView, () => account.wireLogin(goView, () => renderRoute().catch(renderError))],
  register: [(recent) => account.registerView(recent, platformJoinContext), () => account.wireRegister(goView)],
  checkEmail: [account.checkEmailView, () => account.wireCheckEmail()],
  verify: [account.verifyView, () => account.wireVerify(goView, navigateCore)],
  forgot: [account.forgotView, () => account.wireForgot()],
  reset: [account.resetView, () => account.wireReset(goView)],
  account: [account.accountView, () => account.wireAccount(goView)],
  claim: [account.claimView, () => account.wireClaim(goView, navigateCore)],
  join: [account.joinView, () => account.wireJoin(goView, navigateCore)],
};
let platformJoinContext = null; // set by the /join landing so register can show the community banner

async function renderPlatform(view) {
  const recent = await recentRecords();
  const [builder, wire] = PLATFORM_VIEWS[view];
  document.title = 'Core Wiki';
  app.innerHTML = builder(recent);
  wireCommon();
  await wire();
}

async function renderRoute() {
  stopGraph();
  app.innerHTML = '<div class="loading-wrap">Loading Core Wiki...</div>';
  trackPageview();
  const params = new URL(location.href).searchParams;
  // Server-injected permanent routes (/core/<slug>, /join/<code>) — only when the
  // URL carries no explicit SPA route of its own. The route arrives in a CSP-safe
  // <meta name="core-route"> tag; the pathname is a fallback for direct loads.
  const injected = readInjectedRoute();
  if (injected && !routeConsumed && !params.get('core') && !params.get('view') && !params.get('join')) {
    routeConsumed = true;
    if (injected.type === 'core') return renderCore(injected.name || injected.slug);
    if (injected.type === 'join') return renderPlatform('join');
  }
  routeConsumed = true;
  if (params.get('join')) return renderPlatform('join');
  const core = params.get('core');
  if (core) return renderCore(core);
  const view = currentView();
  if (PLATFORM_VIEWS[view]) return renderPlatform(view);
  return view === 'home' ? renderHome() : renderSection(view);
}
let routeConsumed = false;

function readInjectedRoute() {
  if (window.__CORE_ROUTE__) return window.__CORE_ROUTE__;
  let route = null;
  const meta = document.querySelector('meta[name="core-route"]');
  if (meta?.content) {
    try { route = JSON.parse(meta.content); } catch { route = null; }
  }
  if (!route) {
    const match = location.pathname.match(/^\/(core|join)\/([^/]+)\/?$/);
    if (match) route = match[1] === 'core' ? { type: 'core', slug: match[2] } : { type: 'join', code: match[2] };
  }
  if (route) window.__CORE_ROUTE__ = route; // downstream views (join landing) read this
  return route;
}

function renderError(error) {
  stopGraph();
  const message = escapeHtml(String(error?.message || 'The page could not be loaded.'));
  app.innerHTML = `<div class="error-wrap"><div><h2>Page unavailable</h2><p>${message}</p><p><a href="./">Return home</a></p></div></div>`;
}

initTheme();
initSidebar();
initMobileNav();
initAnalytics();
window.addEventListener('popstate', () => { appNavs = Math.max(0, appNavs - 1); renderRoute().catch(renderError); });
loadSession().finally(() => renderRoute().catch(renderError));
