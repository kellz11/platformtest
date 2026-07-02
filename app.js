const $ = (id) => document.getElementById(id);
const app = $("app");
const form = $("searchForm");
const input = $("searchInput");
const clearButton = $("clearButton");
const searchButton = $("searchButton");
const homeButton = $("homeButton");
const quickSearches = $("quickSearches");
const skeletonTemplate = $("skeletonTemplate");

const QUICK = ["dreamcore", "hopecore", "corecore", "weirdcore", "nostalgia", "sports", "fashion", "gaming", "nature", "nightlife"];
const LANDING = [
  ["dreamcore", "dreams, memory, and liminal imagery"],
  ["1990s basketball", "players, teams, arenas, and style"],
  ["y2k internet", "early web graphics and technology"],
  ["gucci", "fashion, campaigns, and visual identity"],
  ["playstation 2", "games, hardware, and nostalgia"],
  ["new york nightlife", "places, people, and atmosphere"]
];

const state = {
  query: "",
  cursors: { openverse: null, wikimedia: null },
  done: { openverse: false, wikimedia: false },
  seen: new Set(),
  total: 0,
  loading: false,
  requestId: 0,
  controller: null,
  grid: null,
  loadMore: null
};

function button(label, className, action) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.addEventListener("click", action);
  return element;
}

function search(query, options = {}) {
  const clean = String(query || "").replace(/\s+/g, " ").trim();
  if (!clean) return input.focus();

  input.value = clean;
  updateClear();
  setActiveQuick(clean);

  if (options.history !== false) {
    const url = new URL(location.href);
    url.searchParams.set("q", clean);
    history.pushState({ q: clean }, "", url);
  }

  state.query = clean;
  state.cursors = { openverse: null, wikimedia: null };
  state.done = { openverse: false, wikimedia: false };
  state.seen.clear();
  state.total = 0;
  state.requestId += 1;
  state.controller?.abort();
  state.controller = new AbortController();
  state.loading = false;
  document.title = `${clean.toLowerCase()} — core`;
  renderLoading(clean);
  fetchResults(true, state.requestId);
  scrollTo({ top: 0, behavior: "auto" });
}

async function fetchResults(fresh, requestId) {
  if (state.loading || (!fresh && allDone())) return;
  state.loading = true;
  setBusy(true);
  updateLoadMore();

  const jobs = [];
  const names = [];
  if (!state.done.openverse) {
    names.push("openverse");
    jobs.push(openverse(state.query, state.cursors.openverse, state.controller.signal));
  }
  if (!state.done.wikimedia) {
    names.push("wikimedia");
    jobs.push(wikimedia(state.query, state.cursors.wikimedia, state.controller.signal));
  }

  try {
    const settled = await Promise.allSettled(jobs);
    if (requestId !== state.requestId) return;

    const buckets = [];
    let failures = 0;
    settled.forEach((result, index) => {
      const name = names[index];
      if (result.status === "fulfilled") {
        buckets.push(result.value.items);
        state.cursors[name] = result.value.cursor;
        state.done[name] = result.value.exhausted;
      } else {
        failures += 1;
        buckets.push([]);
        console.warn(`${name} failed`, result.reason);
      }
    });

    if (jobs.length && failures === jobs.length) throw new Error("The image sources could not be reached. Check your connection and retry.");
    if (fresh) renderResults(failures > 0);
    appendImages(dedupe(interleave(buckets)));
    updateMeta(failures > 0);
    if (fresh && state.total === 0) renderEmpty();
  } catch (error) {
    if (error.name !== "AbortError" && requestId === state.requestId) renderError(error.message);
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      setBusy(false);
      updateLoadMore();
    }
  }
}

async function openverse(query, cursor, signal) {
  const page = cursor ? Number(cursor) || 1 : 1;
  const params = new URLSearchParams({ q: query, page_size: "30", page: String(page), mature: "false" });
  const response = await timedFetch(`https://api.openverse.org/v1/images/?${params}`, signal);
  if (!response.ok) throw new Error(`Openverse returned ${response.status}`);
  const data = await response.json();
  const items = (data.results || []).map((image) => ({
    id: `openverse:${image.id}`,
    source: "Openverse",
    title: image.title || "Untitled",
    description: [image.creator ? `by ${image.creator}` : "", image.license || ""].filter(Boolean).join(" · "),
    link: image.foreign_landing_url || image.url,
    image: image.thumbnail || image.url,
    width: image.width || null,
    height: image.height || null,
    alt: image.title || query
  })).filter(validImage);
  const more = data.page_count ? page < data.page_count : items.length === 30;
  return { items, cursor: more ? String(page + 1) : null, exhausted: !more };
}

async function wikimedia(query, cursor, signal) {
  const offset = cursor ? Number(cursor) || 0 : 0;
  const params = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", origin: "*", generator: "search",
    gsrsearch: query, gsrnamespace: "6", gsrlimit: "30", gsroffset: String(offset),
    prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "900"
  });
  const response = await timedFetch(`https://commons.wikimedia.org/w/api.php?${params}`, signal);
  if (!response.ok) throw new Error(`Wikimedia returned ${response.status}`);
  const data = await response.json();
  const items = (data?.query?.pages || []).map(wikimediaImage).filter(Boolean);
  const next = data?.continue?.gsroffset;
  return { items, cursor: Number.isFinite(next) ? String(next) : null, exhausted: !Number.isFinite(next) };
}

function wikimediaImage(page) {
  const info = page?.imageinfo?.[0];
  if (!info?.url || !info?.mime?.startsWith("image/")) return null;
  const meta = info.extmetadata || {};
  const title = String(page.title || "Untitled").replace(/^File:/i, "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_/g, " ");
  const creator = cleanHtml(meta.Artist?.value || meta.Credit?.value || "");
  const license = cleanHtml(meta.LicenseShortName?.value || "");
  return {
    id: `wikimedia:${page.pageid}`,
    source: "Wikimedia Commons",
    title,
    description: [creator ? `by ${creator}` : "", license].filter(Boolean).join(" · "),
    link: info.descriptionurl || info.url,
    image: info.thumburl || info.url,
    width: info.thumbwidth || info.width || null,
    height: info.thumbheight || info.height || null,
    alt: cleanHtml(meta.ImageDescription?.value || "") || title
  };
}

function timedFetch(url, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  return fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } }).finally(() => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  });
}

function renderHome({ historyChange = false } = {}) {
  state.requestId += 1;
  state.controller?.abort();
  state.loading = false;
  state.query = "";
  state.total = 0;
  state.seen.clear();
  input.value = "";
  updateClear();
  setActiveQuick("");
  setBusy(false);
  document.title = "core — visual culture search";

  if (historyChange) {
    const url = new URL(location.href);
    url.searchParams.delete("q");
    history.pushState({}, "", url);
  }

  app.innerHTML = `<section class="landing"><p class="landing-kicker">the visual index of internet culture</p><h1>Search anything.<br>Find its core.</h1><p class="landing-copy">Explore aesthetics, people, brands, places, eras, sports, media, and ideas through one visual search.</p><div class="landing-grid" id="landingGrid"></div></section>`;
  const grid = $("landingGrid");
  LANDING.forEach(([label, copy]) => {
    const card = button("", "landing-card", () => search(label));
    card.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(copy)}</span>`;
    grid.appendChild(card);
  });
}

function renderLoading(query) {
  app.innerHTML = `<section class="results-shell"><div class="results-header"><div><h1 class="results-title">${escapeHtml(query)}</h1><p class="results-meta">Searching visual culture…</p></div></div><div class="image-grid" id="loadingGrid"></div></section>`;
  const grid = $("loadingGrid");
  for (let i = 0; i < 18; i += 1) grid.appendChild(skeletonTemplate.content.cloneNode(true));
}

function renderResults(partial) {
  app.innerHTML = "";
  const shell = document.createElement("section");
  shell.className = "results-shell";
  shell.innerHTML = `<div class="results-header"><div><h1 class="results-title">${escapeHtml(state.query)}</h1><p class="results-meta" id="resultsMeta">Loading images…</p></div><p class="partial-warning" id="partialWarning" ${partial ? "" : "hidden"}>One image source did not respond. Showing the results that loaded.</p></div>`;
  const related = relatedSearches(state.query);
  if (related) shell.appendChild(related);
  const grid = document.createElement("div");
  grid.className = "image-grid";
  grid.id = "imageGrid";
  const wrap = document.createElement("div");
  wrap.className = "load-more-wrap";
  const load = button("Load more", "load-more-button", () => fetchResults(false, state.requestId));
  wrap.appendChild(load);
  shell.append(grid, wrap);
  app.appendChild(shell);
  state.grid = grid;
  state.loadMore = load;
}

function appendImages(items) {
  if (!state.grid) return;
  items.forEach((item) => {
    const key = item.id || item.image;
    if (!key || state.seen.has(key)) return;
    state.seen.add(key);
    const card = document.createElement("article");
    card.className = "image-card";
    const link = document.createElement("a");
    link.className = "image-link";
    link.href = item.link || item.image;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const image = document.createElement("img");
    image.src = item.image;
    image.alt = item.alt || item.title || state.query;
    image.loading = "lazy";
    image.decoding = "async";
    if (item.width && item.height) { image.width = item.width; image.height = item.height; }
    image.addEventListener("error", () => { card.remove(); state.total = Math.max(0, state.total - 1); updateMeta(); }, { once: true });
    link.appendChild(image);
    const caption = document.createElement("div");
    caption.className = "image-caption";
    caption.innerHTML = `<p class="image-title">${escapeHtml(item.title || state.query)}</p><p class="image-source">${escapeHtml([item.source, item.description].filter(Boolean).join(" · "))}</p>`;
    card.append(link, caption);
    state.grid.appendChild(card);
    state.total += 1;
  });
}

function relatedSearches(query) {
  const labels = [];
  if (window.findCorePath && window.siblingCores) {
    const match = window.findCorePath(query);
    if (match) labels.push(...window.siblingCores(match));
  }
  const lower = query.toLowerCase();
  labels.push(`${query} aesthetic`, `${query} photography`, lower.includes("core") ? query.replace(/core/ig, "").trim() : `${query} core`, /\b(80s|90s|2000s|y2k)\b/.test(lower) ? `${query} nostalgia` : `${query} vintage`);
  const unique = [...new Set(labels.map((x) => String(x).trim()).filter(Boolean))].filter((x) => x.toLowerCase() !== lower).slice(0, 7);
  if (!unique.length) return null;
  const block = document.createElement("div");
  block.className = "related-block";
  block.innerHTML = `<span class="related-label">Related</span>`;
  unique.forEach((label) => block.appendChild(button(label.toLowerCase(), "related-chip", () => search(label))));
  return block;
}

function renderEmpty() {
  app.innerHTML = `<section class="state-panel"><h2>No images found for “${escapeHtml(state.query)}”</h2><p>Try a broader phrase, remove extra words, or choose one of the searches above.</p></section>`;
  app.querySelector("section").appendChild(button("Search again", "primary-button", () => { input.focus(); input.select(); }));
}

function renderError(message) {
  app.innerHTML = `<section class="state-panel"><h2>The image search did not load</h2><p>${escapeHtml(message || "Check the connection and try again.")}</p></section>`;
  app.querySelector("section").appendChild(button("Retry search", "retry-button", () => search(state.query, { history: false })));
}

function updateMeta(partial) {
  const meta = $("resultsMeta");
  if (meta) meta.textContent = `${state.total.toLocaleString()} image${state.total === 1 ? "" : "s"}${allDone() ? "" : " loaded"}`;
  const warning = $("partialWarning");
  if (warning && typeof partial === "boolean") warning.hidden = !partial;
}

function updateLoadMore() {
  if (!state.loadMore) return;
  state.loadMore.parentElement.hidden = allDone() || state.total === 0;
  state.loadMore.disabled = state.loading;
  state.loadMore.textContent = state.loading ? "Loading…" : "Load more";
}

function setBusy(value) {
  searchButton.disabled = value;
  searchButton.textContent = value ? "Searching…" : "Search";
  form.setAttribute("aria-busy", String(value));
}

function updateClear() { clearButton.hidden = input.value.length === 0; }
function allDone() { return state.done.openverse && state.done.wikimedia; }
function validImage(item) { return item && typeof item.image === "string" && /^https?:\/\//i.test(item.image); }
function cleanHtml(value) { const box = document.createElement("textarea"); box.innerHTML = String(value).replace(/<[^>]*>/g, " "); return box.value.replace(/\s+/g, " ").trim(); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function interleave(groups) { const out = []; const max = Math.max(0, ...groups.map((group) => group.length)); for (let i = 0; i < max; i += 1) groups.forEach((group) => { if (group[i]) out.push(group[i]); }); return out; }
function dedupe(items) { const seen = new Set(); return items.filter((item) => { if (!validImage(item)) return false; let key = item.image; try { const url = new URL(item.image); key = `${url.hostname}${url.pathname}`.toLowerCase(); } catch {} if (seen.has(key)) return false; seen.add(key); return true; }); }

function buildQuick() {
  QUICK.forEach((label) => {
    const item = button(label, "quick-chip", () => search(label));
    item.dataset.query = label.toLowerCase();
    quickSearches.appendChild(item);
  });
}
function setActiveQuick(query) { quickSearches.querySelectorAll(".quick-chip").forEach((item) => item.setAttribute("aria-current", item.dataset.query === query.toLowerCase() ? "true" : "false")); }

form.addEventListener("submit", (event) => { event.preventDefault(); search(input.value); });
input.addEventListener("input", updateClear);
clearButton.addEventListener("click", () => { input.value = ""; updateClear(); input.focus(); });
homeButton.addEventListener("click", () => renderHome({ historyChange: true }));
addEventListener("popstate", () => { const query = new URL(location.href).searchParams.get("q"); query ? search(query, { history: false }) : renderHome(); });

buildQuick();
const initial = new URL(location.href).searchParams.get("q");
initial ? search(initial, { history: false }) : renderHome();
