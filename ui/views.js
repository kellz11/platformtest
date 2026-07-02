import { assetUrl, escapeHtml, pageUrl } from './core-data.js';
import { footer, imageThumb, sidebar, topbar } from './shell.js';

const fmt = (value) => new Intl.NumberFormat().format(value || 0);

function coreCard(record, hidden = false) {
  return `<a class="core-card${hidden ? ' hidden' : ''}" data-core-card data-search="${escapeHtml(record.name.toLowerCase())}" href="${pageUrl(record.name)}">
    ${imageThumb(record.paths[0], 'core-thumb', record.name)}
    <strong class="core-name">${escapeHtml(record.name)}</strong><span class="core-arrow">→</span>
  </a>`;
}

export function homeView(stats, recent) {
  const featured = stats.featured;
  return `<div class="app-shell">
    ${sidebar('home', recent)}
    <main class="content-shell">
      ${topbar()}
      <div class="main-grid">
        <section>
          <div class="main-card hero-card">
            <p class="kicker">Core Wiki</p>
            <h1 class="hero-title">The index of internet culture.</h1>
            <p class="hero-copy">Open any core to see its article and its matching graphic archive together.</p>
            <p class="stat-line">${fmt(stats.corePages)} Core pages</p>
            <div class="core-grid" id="coreGrid">${stats.records.map((record, index) => coreCard(record, index >= 10)).join('')}</div>
            <div class="browse-wrap"><button class="browse-btn" id="browseAll" type="button">◫ Browse all cores</button></div>
          </div>
          ${footer()}
        </section>
        <aside class="side-stack">
          <section class="side-card">
            <div class="side-icon">✧</div><h3 class="side-title">What is Core Wiki?</h3>
            <p class="side-copy">Core Wiki is a collaborative index of internet culture aesthetic cores. Explore. Learn. Archive.</p>
            <div class="metric-list">
              <div class="metric"><span class="metric-badge">◫</span><div><b class="metric-value">${fmt(stats.corePages)}</b><span class="metric-label">Core pages</span></div></div>
              <div class="metric"><span class="metric-badge">☰</span><div><b class="metric-value">${fmt(stats.articles)}</b><span class="metric-label">Articles</span></div></div>
              <div class="metric"><span class="metric-badge">▣</span><div><b class="metric-value">${fmt(stats.graphics)}</b><span class="metric-label">Graphics</span></div></div>
            </div>
          </section>
          ${featured ? `<section class="side-card featured-card">
            <p class="block-label">Featured core</p><h3 class="featured-name">${escapeHtml(featured.name)}</h3>
            ${imageThumb(featured.paths[0], 'featured-image', featured.name)}
            <p class="featured-copy">Explore the ${escapeHtml(featured.name)} aesthetic and its visual archive.</p>
            <a class="featured-btn" href="${pageUrl(featured.name)}"><span>View core</span><span>→</span></a>
          </section>` : ''}
        </aside>
      </div>
    </main>
  </div>`;
}

function gallery(paths) {
  return paths.map((path) => {
    const filename = decodeURIComponent(String(path).split('/').pop() || 'Core gallery image');
    const label = filename.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ');
    return `<figure class="gallery-item"><img src="${assetUrl(path)}" alt="${escapeHtml(label)}" loading="lazy" decoding="async"></figure>`;
  }).join('');
}

export function coreView(core, recent) {
  return `<div class="app-shell">
    ${sidebar('cores', recent)}
    <main class="content-shell">
      ${topbar(core.title)}
      <div class="main-grid">
        <section>
          <div class="main-card hero-card">
            <p class="kicker">Core Wiki</p><h1 class="page-title">${escapeHtml(core.title)}</h1>
            <p class="page-sub">${fmt(core.paths.length)} graphics in the local archive</p>
            <section class="article-card" id="articleCard">
              <p class="article-label">Article</p><div class="article-body" id="articleBody">${core.article}</div>
              <div class="article-fade"></div><button class="article-toggle" id="articleToggle" type="button">Read full article</button>
            </section>
            <h2 class="section-title">Gallery</h2>
            ${core.paths.length ? `<div class="gallery-grid">${gallery(core.paths)}</div>` : '<p class="gallery-empty">No local graphics have been added to this Core folder yet.</p>'}
          </div>
          ${footer()}
        </section>
        <aside class="side-stack">
          <section class="side-card"><div class="side-icon">✧</div><h3 class="side-title">About this core</h3><p class="side-copy">This page combines the cleaned article with the matching local graphics folder.</p><p class="page-side-stat">${fmt(core.paths.length)} local graphics</p><div class="side-gallery-preview">${core.paths.slice(0, 4).map((path) => imageThumb(path, 'mini-thumb')).join('')}</div></section>
          <section class="side-card"><p class="block-label">Related actions</p><button class="featured-btn" data-view="home" type="button"><span>Back to home</span><span>→</span></button></section>
        </aside>
      </div>
    </main>
  </div>`;
}
