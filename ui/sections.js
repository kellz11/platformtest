import { assetUrl, escapeHtml, pageUrl } from './core-data.js';
import { footer, imageThumb, sidebar, topbar } from './shell.js';

const fmt = (value) => new Intl.NumberFormat().format(value || 0);

function sectionHeader(title, count, label, description) {
  return `<div class="section-head"><div><p class="kicker">Core Wiki</p><h1 class="section-page-title">${title}</h1><p class="section-count">${fmt(count)} ${label}</p><p class="section-description">${description}</p></div></div>`;
}

function toolbar(placeholder) {
  return `<div class="section-toolbar"><div class="section-search-wrap"><span>⌕</span><input id="sectionSearch" type="search" placeholder="${placeholder}" autocomplete="off"></div></div>`;
}

export function coresView(stats, recent) {
  const cards = stats.records.map((record) => `<a class="core-tile filterable" data-search="${escapeHtml(record.name.toLowerCase())}" href="${pageUrl(record.name)}">
    ${imageThumb(record.paths[0], 'core-tile-image', record.name)}
    <div class="core-tile-body"><strong>${escapeHtml(record.name)}</strong><span>${fmt(record.paths.length)} graphics</span></div>
  </a>`).join('');
  return `<div class="app-shell">${sidebar('cores', recent)}<main class="content-shell">${topbar()}<section class="main-card section-card">
    ${sectionHeader('All Cores', stats.corePages, 'core pages', 'Browse every indexed core and open its article with the matching local graphic archive.')}
    ${toolbar('Search cores...')}<div class="cores-gallery">${cards}</div><p class="no-results hidden" id="noResults">No cores match that search.</p>
  </section>${footer()}</main></div>`;
}

export function articlesView(stats, recent) {
  const rows = stats.records.map((record) => `<a class="article-row filterable" data-search="${escapeHtml(record.name.toLowerCase())}" href="${pageUrl(record.name)}">
    ${imageThumb(record.paths[0], 'article-row-image', record.name)}
    <div class="article-row-main"><strong>${escapeHtml(record.name)}</strong><span>Core article</span></div>
    <p>Read the ${escapeHtml(record.name)} article and browse its ${fmt(record.paths.length)} local graphics.</p><span class="article-row-tag">${escapeHtml(record.name)}</span>
  </a>`).join('');
  return `<div class="app-shell">${sidebar('articles', recent)}<main class="content-shell">${topbar()}<section class="main-card section-card">
    ${sectionHeader('All Articles', stats.articles, 'articles', 'There is one cleaned article for every Core page in the current index.')}
    ${toolbar('Search articles...')}<div class="article-list">${rows}</div><p class="no-results hidden" id="noResults">No articles match that search.</p>
  </section>${footer()}</main></div>`;
}

export function graphicsView(stats, recent, graphics, visibleCount) {
  const items = graphics.slice(0, visibleCount).map((item) => `<a class="graphic-tile" href="${pageUrl(item.core)}" title="${escapeHtml(item.core)}">
    <img src="${assetUrl(item.path)}" alt="${escapeHtml(item.core)} graphic" loading="lazy" decoding="async"><span>${escapeHtml(item.core)}</span>
  </a>`).join('');
  const more = visibleCount < graphics.length ? '<button class="load-more-btn" id="loadMoreGraphics" type="button">Load more graphics</button>' : '';
  return `<div class="app-shell">${sidebar('graphics', recent)}<main class="content-shell">${topbar()}<section class="main-card section-card">
    ${sectionHeader('Graphic Archive', stats.graphics, 'graphics', 'Explore every local image currently stored across all Core folders.')}
    ${toolbar('Search graphics by core...')}<div class="graphics-grid" id="graphicsGrid">${items}</div><p class="no-results${graphics.length ? ' hidden' : ''}" id="noResults">No graphics match that search.</p><div class="load-more-wrap">${more}</div>
  </section>${footer()}</main></div>`;
}

export function archiveView(stats, recent) {
  const groups = new Map();
  stats.records.forEach((record) => {
    const letter = record.name.charAt(0).toUpperCase();
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(record);
  });
  const sections = [...groups.entries()].map(([letter, records]) => `<section class="archive-group filterable" data-search="${escapeHtml(records.map((record) => record.name.toLowerCase()).join(' '))}">
    <div class="archive-letter">${letter}</div><div class="archive-records">${records.map((record) => `<a class="archive-row" href="${pageUrl(record.name)}"><span>${escapeHtml(record.name)}</span><small>${fmt(record.paths.length)} graphics</small><b>→</b></a>`).join('')}</div>
  </section>`).join('');
  return `<div class="app-shell">${sidebar('archive', recent)}<main class="content-shell">${topbar()}<section class="main-card section-card">
    ${sectionHeader('Archive', stats.corePages, 'archived cores', 'An alphabetical archive of every Core page and its local graphic collection. No invented dates or timelines.')}
    ${toolbar('Search the archive...')}<div class="archive-list">${sections}</div><p class="no-results hidden" id="noResults">No archive entries match that search.</p>
  </section>${footer()}</main></div>`;
}

export function aboutView(stats, recent) {
  const featured = stats.featured;
  return `<div class="app-shell">${sidebar('about', recent)}<main class="content-shell">${topbar()}<section class="main-card section-card about-page">
    <div class="about-intro"><div>${sectionHeader('About Core Wiki', stats.corePages, 'core pages', 'Core Wiki documents internet-culture aesthetics by pairing one article with each Core page and its own local visual archive.')}</div>${featured ? imageThumb(featured.paths[0], 'about-feature-image', featured.name) : ''}</div>
    <div class="about-cards"><article><span>✧</span><h3>Our mission</h3><p>Build a clear, searchable index of internet culture and the visual language behind each core.</p></article><article><span>◫</span><h3>Community driven</h3><p>The archive grows as new cores, articles, and graphics are added and organized.</p></article><article><span>▣</span><h3>Open archive</h3><p>Every Core page keeps its article and matching local graphics together in one place.</p></article></div>
    <section class="about-stats"><div><h3>Current index</h3><p>These numbers are calculated directly from the repository manifest.</p></div><div class="about-stat"><b>${fmt(stats.corePages)}</b><span>Cores</span></div><div class="about-stat"><b>${fmt(stats.articles)}</b><span>Articles</span></div><div class="about-stat"><b>${fmt(stats.graphics)}</b><span>Graphics</span></div></section>
  </section>${footer()}</main></div>`;
}
