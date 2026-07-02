const API = "https://aesthetics.fandom.com/api.php";
const MANIFEST_URL = "./assets/cores/manifest.json";
const app = document.getElementById("app");
const form = document.getElementById("searchForm");
const input = document.getElementById("searchInput");
const clearButton = document.getElementById("clearButton");
const homeButton = document.getElementById("homeButton");

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const normalize = (value) => clean(value)
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/\([^)]*\)/g, "")
  .replace(/[^a-z0-9]+/g, "");

let manifestPromise;

async function api(query) {
  const url = new URL(API);
  Object.entries({ format: "json", formatversion: "2", origin: "*", ...query }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Article service returned ${response.status}`);
  return response.json();
}

async function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(`${MANIFEST_URL}?v=${Date.now()}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("The local gallery manifest could not be loaded.");
        return response.json();
      })
      .then((manifest) => {
        const records = new Map();
        Object.entries(manifest || {}).forEach(([name, paths]) => {
          records.set(normalize(name), {
            name,
            paths: Array.isArray(paths) ? paths.filter(Boolean) : []
          });
        });
        return records;
      });
  }
  return manifestPromise;
}

function pageUrl(title) {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("core", clean(title));
  return `${url.pathname}${url.search}`;
}

function encodedAssetUrl(path) {
  const encodedPath = String(path)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(encodedPath, location.href).href;
}

async function coreIndex() {
  const manifest = await loadManifest();
  if (manifest.size) {
    return [...manifest.values()]
      .map((record) => ({ title: record.name, imageCount: record.paths.length }))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  }

  const pages = [];
  let continuation = "";
  do {
    const query = { action: "query", list: "categorymembers", cmtitle: "Category:Core_Suffix", cmnamespace: "0", cmlimit: "500", cmsort: "sortkey", cmdir: "asc" };
    if (continuation) query.cmcontinue = continuation;
    const data = await api(query);
    pages.push(...(data?.query?.categorymembers || []));
    continuation = data?.continue?.cmcontinue || "";
  } while (continuation);
  return pages;
}

function galleryHeading(doc) {
  return [...doc.querySelectorAll("h2,h3")].find((heading) => /\bgallery\b/i.test(heading.textContent || "") || heading.querySelector("#Gallery,#gallery"));
}

function removeSection(heading) {
  if (!heading) return;
  const level = Number(heading.tagName.slice(1));
  let node = heading.nextElementSibling;
  heading.remove();
  while (node) {
    const next = node.nextElementSibling;
    if (/^H[1-6]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= level) break;
    node.remove();
    node = next;
  }
}

function removeSensitiveNotices(doc) {
  const warning = /sensitive content notice|content warning|reason for warning|following article contains and discusses content|may be distressing to some readers|may be unsettling to some viewers/i;
  const selector = "p,div,section,aside,blockquote,table,li";
  [...doc.querySelectorAll(selector)]
    .filter((node) => {
      const text = clean(node.textContent);
      return text.length > 0 && text.length < 1800 && warning.test(text);
    })
    .sort((a, b) => clean(a.textContent).length - clean(b.textContent).length)
    .forEach((node) => {
      if (!node.isConnected) return;
      const smallerMatch = [...node.querySelectorAll(selector)].some((child) => child !== node && warning.test(clean(child.textContent)));
      if (!smallerMatch || node.matches("p,aside,blockquote,table,li")) node.remove();
    });
}

function unwrap(link) {
  link.replaceWith(...link.childNodes);
}

function routeArticleLinks(doc) {
  [...doc.querySelectorAll("a")].forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (!href) {
      unwrap(link);
      return;
    }

    if (href.startsWith("#")) {
      link.removeAttribute("target");
      link.removeAttribute("rel");
      return;
    }

    let url;
    try {
      url = new URL(href, "https://aesthetics.fandom.com/");
    } catch {
      unwrap(link);
      return;
    }

    const fandomHost = /(^|\.)fandom\.com$/i.test(url.hostname) || /(^|\.)wikia\.com$/i.test(url.hostname);
    if (fandomHost) {
      const match = decodeURIComponent(url.pathname).match(/^\/wiki\/([^?#]+)$/i);
      if (!match) {
        unwrap(link);
        return;
      }

      const title = clean(match[1].replace(/_/g, " "));
      const namespace = title.includes(":") ? title.split(":", 1)[0].toLowerCase() : "";
      const excluded = new Set(["file", "category", "special", "template", "user", "user talk", "talk", "help", "mediawiki", "module", "portal", "blog"]);
      if (!title || excluded.has(namespace)) {
        unwrap(link);
        return;
      }

      link.href = pageUrl(title);
      link.removeAttribute("target");
      link.removeAttribute("rel");
      return;
    }

    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });
}

function cleanArticle(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  removeSection(galleryHeading(doc));
  removeSensitiveNotices(doc);
  doc.querySelectorAll("script,style,iframe,object,embed,form,input,button,video,audio,img,picture,source,svg,canvas,table,figure,noscript,.mw-editsection,.portable-infobox,.gallery,.navbox,.toc,.references,.noprint,sup.reference").forEach((node) => node.remove());
  routeArticleLinks(doc);
  doc.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      if (node.tagName === "A" && ["href", "target", "rel"].includes(attribute.name)) return;
      node.removeAttribute(attribute.name);
    });
  });
  doc.querySelectorAll("p,div,section,aside,blockquote").forEach((node) => {
    if (!clean(node.textContent) && !node.querySelector("a")) node.remove();
  });
  return doc.body.innerHTML;
}

async function parseCore(title) {
  let data = await api({ action: "parse", page: title, prop: "text|displaytitle", redirects: "1", disabletoc: "1" });
  if (data?.error || !data?.parse?.text) {
    const search = await api({ action: "query", list: "search", srsearch: title, srnamespace: "0", srlimit: "1" });
    const match = search?.query?.search?.[0]?.title;
    if (!match) throw new Error("That Core article was not found.");
    data = await api({ action: "parse", page: match, prop: "text|displaytitle", redirects: "1", disabletoc: "1" });
  }
  if (data?.error || !data?.parse?.text) throw new Error("That Core article was not found.");
  return data.parse;
}

function galleryRecord(manifest, requestedTitle, canonicalTitle) {
  return manifest.get(normalize(requestedTitle)) || manifest.get(normalize(canonicalTitle)) || null;
}

function renderLoading(title) {
  document.title = `${title} - Core Wiki`;
  app.innerHTML = `<section class="core-state"><h1>${escapeHtml(title)}</h1><p>Loading the article and gallery...</p></section>`;
}

function renderError(message) {
  app.innerHTML = `<section class="core-state"><h1>Page unavailable.</h1><p>${escapeHtml(message || "The Core page could not be loaded.")}</p><a href="./">Return to the Core index</a></section>`;
}

function galleryCards(paths) {
  return paths.map((path, index) => {
    const filename = decodeURIComponent(String(path).split("/").pop() || "Core gallery image");
    const label = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");
    return `<figure class="core-gallery-card"><img src="${encodedAssetUrl(path)}" alt="${escapeHtml(label)}" loading="${index < 12 ? "eager" : "lazy"}" decoding="async"></figure>`;
  }).join("");
}

function wireArticleToggle() {
  const panel = document.querySelector(".core-article-preview");
  const body = panel?.querySelector(".core-article-preview-body");
  const button = panel?.querySelector(".core-article-toggle");
  if (!panel || !body || !button) return;
  requestAnimationFrame(() => {
    if (body.scrollHeight <= body.clientHeight + 6) button.hidden = true;
  });
  button.addEventListener("click", () => {
    const expanded = panel.classList.toggle("is-expanded");
    body.classList.toggle("is-expanded", expanded);
    button.textContent = expanded ? "Show less" : "Read full article";
  });
}

function wireGalleryErrors() {
  document.querySelectorAll(".core-gallery-card img").forEach((image) => {
    image.addEventListener("error", () => image.closest(".core-gallery-card")?.remove(), { once: true });
  });
}

async function renderCore(title) {
  renderLoading(title);
  const [parsed, manifest] = await Promise.all([parseCore(title), loadManifest()]);
  const canonical = parsed.title || title;
  const record = galleryRecord(manifest, title, canonical);
  const paths = record?.paths || [];
  const article = cleanArticle(parsed.text);
  const displayTitle = record?.name || canonical;

  input.value = displayTitle;
  clearButton.hidden = false;
  document.title = `${displayTitle} - Core Wiki`;
  app.innerHTML = `<section class="core-wiki-shell"><div class="core-page-head"><h1 class="core-page-title">${escapeHtml(displayTitle)}</h1></div><section class="core-article-preview"><div class="core-article-preview-bar"><p class="core-article-preview-label">Article</p></div><div class="core-article-preview-body">${article}</div><div class="core-article-preview-fade"></div><button class="core-article-toggle" type="button">Read full article</button></section><div class="core-gallery-meta"><h2>Gallery</h2></div>${paths.length ? `<div class="core-gallery-grid">${galleryCards(paths)}</div>` : `<p class="core-gallery-empty">No local graphics have been added to this Core folder yet.</p>`}</section>`;
  wireArticleToggle();
  wireGalleryErrors();
}

async function renderHome() {
  document.title = "Core Wiki";
  input.value = "";
  clearButton.hidden = true;
  app.innerHTML = `<section class="core-state"><h1>Core Wiki</h1><p>Loading the Core index...</p></section>`;
  const pages = await coreIndex();
  app.innerHTML = `<section class="core-wiki-shell"><div class="core-home"><p class="landing-kicker">Core Wiki</p><h1>The index of<br>internet culture.</h1><p class="core-home-copy">Open any core to see its article and its matching graphic archive together.</p><p class="core-index-meta">${pages.length} Core pages</p><div class="core-index-grid">${pages.map((page) => `<a class="core-index-card" data-title="${escapeHtml(page.title.toLowerCase())}" href="${pageUrl(page.title)}">${escapeHtml(page.title)}</a>`).join("")}</div></div></section>`;
}

function navigate(title) {
  const value = clean(title);
  if (!value) return;
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("core", value);
  history.pushState({ core: value }, "", url);
  renderCore(value).catch((error) => renderError(error.message));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  navigate(input.value);
});
input.addEventListener("input", () => {
  clearButton.hidden = !input.value;
  if (!new URL(location.href).searchParams.get("core")) {
    const needle = input.value.toLowerCase().trim();
    document.querySelectorAll(".core-index-card").forEach((card) => {
      card.hidden = Boolean(needle) && !card.dataset.title.includes(needle);
    });
  }
});
clearButton.addEventListener("click", () => {
  input.value = "";
  clearButton.hidden = true;
  input.dispatchEvent(new Event("input"));
  input.focus();
});
homeButton.addEventListener("click", () => {
  history.pushState({}, "", location.pathname);
  renderHome().catch((error) => renderError(error.message));
});
addEventListener("popstate", () => {
  const title = new URL(location.href).searchParams.get("core") || new URL(location.href).searchParams.get("q") || new URL(location.href).searchParams.get("name");
  title ? renderCore(title).catch((error) => renderError(error.message)) : renderHome().catch((error) => renderError(error.message));
});

const initial = new URL(location.href).searchParams.get("core") || new URL(location.href).searchParams.get("q") || new URL(location.href).searchParams.get("name");
initial ? renderCore(initial).catch((error) => renderError(error.message)) : renderHome().catch((error) => renderError(error.message));
