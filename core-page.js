const app = document.getElementById("wikiApp");
const API = "https://aesthetics.fandom.com/api.php";
const params = new URLSearchParams(location.search);
const requested = String(params.get("name") || "").trim();

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
}

async function api(query) {
  const url = new URL(API);
  Object.entries({ format: "json", formatversion: "2", origin: "*", ...query }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Aesthetics Wiki returned ${response.status}`);
  return response.json();
}

function cleanArticle(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,form,input,button,video,audio,img,picture,source,svg,canvas,table,figure,noscript,.mw-editsection,.portable-infobox,.gallery,.navbox,.toc,.references,.noprint").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      if (node.tagName === "A" && attribute.name === "href") return;
      node.removeAttribute(attribute.name);
    });
  });
  doc.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href.startsWith("/wiki/")) link.href = `https://aesthetics.fandom.com${href}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });
  return doc.body.innerHTML;
}

async function loadIndex() {
  const data = await api({ action: "query", list: "categorymembers", cmtitle: "Category:Core_Suffix", cmnamespace: "0", cmlimit: "500", cmsort: "sortkey", cmdir: "asc" });
  const pages = data?.query?.categorymembers || [];
  document.title = "Core Wiki";
  app.innerHTML = `<section class="wiki-index"><p class="landing-kicker">Core Wiki</p><h1 class="wiki-title">Every core.<br>One index.</h1><p class="wiki-deck">Text-only encyclopedia pages sourced from the Aesthetics Wiki's Core Suffix category.</p><form class="wiki-search" id="wikiSearch"><input id="wikiSearchInput" placeholder="Search a core" autocomplete="off"><button type="submit">Open</button></form><div class="wiki-meta"><span class="wiki-pill">${pages.length} indexed pages</span><span class="wiki-pill">Text only</span></div><div class="wiki-grid">${pages.map((page) => `<a class="wiki-card" href="./core.html?name=${encodeURIComponent(page.title)}">${escapeHtml(page.title)}</a>`).join("")}</div><p class="wiki-attribution">Page list sourced from the <a href="https://aesthetics.fandom.com/wiki/Category:Core_Suffix" target="_blank" rel="noopener noreferrer">Aesthetics Wiki Core Suffix category</a>. Community text is available under CC BY-SA unless otherwise noted.</p></section>`;
  document.getElementById("wikiSearch").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = document.getElementById("wikiSearchInput").value.trim();
    if (value) location.href = `./core.html?name=${encodeURIComponent(value)}`;
  });
}

async function loadArticle(title) {
  const data = await api({ action: "parse", page: title, prop: "text|displaytitle", redirects: "1", disabletoc: "1" });
  if (data?.error || !data?.parse?.text) throw new Error("That Core page was not found on the Aesthetics Wiki.");
  const canonical = data.parse.title || title;
  const source = `https://aesthetics.fandom.com/wiki/${encodeURIComponent(canonical.replace(/ /g, "_"))}`;
  const article = cleanArticle(data.parse.text);
  document.title = `${canonical} - Core Wiki`;
  app.innerHTML = `<article class="wiki-article"><p class="landing-kicker">Core Wiki</p><h1 class="wiki-title">${escapeHtml(canonical)}</h1><div class="wiki-meta"><a class="wiki-action" href="./core.html">All cores</a><a class="wiki-action" href="${source}" target="_blank" rel="noopener noreferrer">Original article</a></div><div class="wiki-content">${article}</div><footer class="wiki-attribution">Text adapted from <a href="${source}" target="_blank" rel="noopener noreferrer">${escapeHtml(canonical)} on the Aesthetics Wiki</a>. Community text is available under the <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">Creative Commons Attribution-ShareAlike 3.0 license</a>, unless otherwise noted. No Fandom media is reproduced here.</footer></article>`;
}

function renderError(error) {
  app.innerHTML = `<section class="wiki-error"><p class="landing-kicker">Core Wiki</p><h1 class="wiki-title">Page unavailable.</h1><p class="wiki-deck">${escapeHtml(error.message || "The page could not be loaded.")}</p><div class="wiki-meta"><a class="wiki-action" href="./core.html">Browse all cores</a><a class="wiki-action" href="./">Return to search</a></div></section>`;
}

try {
  requested ? await loadArticle(requested) : await loadIndex();
} catch (error) {
  console.error(error);
  renderError(error);
}
