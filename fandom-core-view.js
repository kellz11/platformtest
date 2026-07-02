(() => {
  const API = "https://aesthetics.fandom.com/api.php";
  const previousFetch = window.fetch.bind(window);
  const cache = new Map();

  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const norm = (value) => clean(value).toLowerCase();
  const fileKey = (value) => clean(value).replace(/_/g, " ").toLowerCase();

  function api(query) {
    const url = new URL(API);
    Object.entries({ format: "json", formatversion: "2", origin: "*", ...query }).forEach(([key, value]) => url.searchParams.set(key, value));
    return previousFetch(url.toString()).then((response) => {
      if (!response.ok) throw new Error(`Aesthetics Wiki returned ${response.status}`);
      return response.json();
    });
  }

  function fileTitleFrom(element) {
    const direct = element.getAttribute?.("data-image-name") || element.getAttribute?.("data-file-name") || "";
    if (direct && /\.(?:jpe?g|png|gif|webp|svg)$/i.test(direct)) return /^File:/i.test(direct) ? direct : `File:${direct}`;

    const href = element.getAttribute?.("href") || "";
    try {
      const match = decodeURIComponent(href).match(/\/wiki\/(File:[^?#]+)/i);
      if (match) return match[1].replace(/_/g, " ");
    } catch {}

    if (element.tagName === "IMG") {
      const alt = element.getAttribute("alt") || "";
      if (/\.(?:jpe?g|png|gif|webp|svg)$/i.test(alt)) return /^File:/i.test(alt) ? alt : `File:${alt}`;
    }
    return "";
  }

  function galleryHeading(doc) {
    return [...doc.querySelectorAll("h2,h3")].find((heading) => /\bgallery\b/i.test(heading.textContent || "") || heading.querySelector("#Gallery,#gallery"));
  }

  function collectGallery(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const found = new Map();
    const heading = galleryHeading(doc);
    if (!heading) return { doc, files: found };

    const level = Number(heading.tagName.slice(1));
    let node = heading.nextElementSibling;
    while (node) {
      if (/^H[1-6]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= level) break;
      [node, ...node.querySelectorAll("[data-image-name],[data-file-name],a[href],img")].forEach((element) => {
        const title = fileTitleFrom(element);
        if (!title) return;
        const item = element.closest?.(".gallery-item,.wikia-gallery-item,figure,li") || element.parentElement;
        const captionNode = item?.querySelector?.("figcaption,.gallerytext,.lightbox-caption,.caption");
        const caption = clean(captionNode?.textContent || "");
        if (!found.has(fileKey(title))) found.set(fileKey(title), { title, caption });
      });
      node = node.nextElementSibling;
    }
    return { doc, files: found };
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

  function cleanArticle(doc) {
    removeSection(galleryHeading(doc));
    doc.querySelectorAll("script,style,iframe,object,embed,form,input,button,video,audio,img,picture,source,svg,canvas,table,figure,noscript,.mw-editsection,.portable-infobox,.gallery,.navbox,.toc,.references,.noprint,sup.reference").forEach((node) => node.remove());
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

  async function imageInfo(files) {
    const entries = [...files.values()];
    const captions = new Map(entries.map((entry) => [fileKey(entry.title), entry.caption]));
    const images = [];
    for (let start = 0; start < entries.length; start += 50) {
      const batch = entries.slice(start, start + 50).map((entry) => entry.title);
      const data = await api({ action: "query", prop: "imageinfo", titles: batch.join("|"), iiprop: "url|size|mime|extmetadata", iiurlwidth: "1200" });
      for (const page of data?.query?.pages || []) {
        const info = page?.imageinfo?.[0];
        if (!info?.url || !String(info.mime || "").startsWith("image/")) continue;
        const caption = captions.get(fileKey(page.title)) || "";
        images.push({
          id: `fandom:${page.pageid}`,
          title: caption || page.title.replace(/^File:/i, "").replace(/\.[a-z0-9]+$/i, ""),
          creator: "Aesthetics Wiki gallery",
          license: "",
          foreign_landing_url: info.descriptionurl || info.url,
          thumbnail: info.thumburl || info.url,
          url: info.url,
          width: info.thumbwidth || info.width || null,
          height: info.thumbheight || info.height || null
        });
      }
    }
    for (let index = images.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [images[index], images[swap]] = [images[swap], images[index]];
    }
    return images;
  }

  async function loadRecord(query) {
    const key = norm(query);
    if (!key) return null;
    if (cache.has(key)) return cache.get(key);

    const promise = (async () => {
      const data = await api({ action: "parse", page: clean(query), prop: "text|displaytitle", redirects: "1", disabletoc: "1" });
      if (data?.error || !data?.parse?.text) return null;
      const canonical = data.parse.title || clean(query);
      const source = `https://aesthetics.fandom.com/wiki/${encodeURIComponent(canonical.replace(/ /g, "_"))}`;
      const collected = collectGallery(data.parse.text);
      const article = cleanArticle(collected.doc);
      const images = collected.files.size ? await imageInfo(collected.files) : [];
      return { canonical, source, article, images };
    })().catch(() => null);

    cache.set(key, promise);
    return promise;
  }

  function jsonResponse(payload) {
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  window.fetch = async (resource, options) => {
    try {
      const raw = typeof resource === "string" ? resource : resource.url;
      const url = new URL(raw, location.href);

      if (url.hostname === "api.openverse.org" && url.searchParams.has("q")) {
        const query = url.searchParams.get("q");
        const record = await loadRecord(query);
        if (record?.images?.length) {
          const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
          const size = Math.max(1, Number(url.searchParams.get("page_size")) || 30);
          const start = (page - 1) * size;
          return jsonResponse({ results: record.images.slice(start, start + size), page_count: Math.ceil(record.images.length / size) });
        }
      }

      if (url.hostname === "commons.wikimedia.org" && url.searchParams.has("gsrsearch")) {
        const query = url.searchParams.get("gsrsearch").replace(/["“”]/g, "");
        const record = await loadRecord(query);
        if (record?.images?.length) return jsonResponse({ query: { pages: [] } });
      }
    } catch (error) {
      console.warn("Fandom Core view skipped", error);
    }
    return previousFetch(resource, options);
  };

  function injectArticle(shell, record) {
    if (!record?.article || shell.querySelector(".core-article-panel")) return;
    const header = shell.querySelector(".results-header");
    if (!header) return;

    const panel = document.createElement("section");
    panel.className = "core-article-panel";
    panel.innerHTML = `<div class="core-article-bar"><p class="core-article-label">Core Wiki article</p><a class="core-article-source" href="${record.source}" target="_blank" rel="noopener noreferrer">Original source</a></div><div class="core-article-body">${record.article}</div><div class="core-article-fade"></div><button class="core-article-toggle" type="button">Read full article</button>`;
    header.insertAdjacentElement("afterend", panel);

    const body = panel.querySelector(".core-article-body");
    const toggle = panel.querySelector(".core-article-toggle");
    requestAnimationFrame(() => {
      if (body.scrollHeight <= body.clientHeight + 8) panel.classList.add("is-short");
    });
    toggle.addEventListener("click", () => {
      const expanded = panel.classList.toggle("is-expanded");
      body.classList.toggle("is-expanded", expanded);
      toggle.textContent = expanded ? "Show less" : "Read full article";
    });
  }

  function markGalleryCards() {
    document.querySelectorAll('.image-card .image-link[href*="aesthetics.fandom.com"],.image-card .image-link[href*="static.wikia"]').forEach((link) => {
      const card = link.closest(".image-card");
      if (!card) return;
      card.dataset.fandomGallery = "true";
      const source = card.querySelector(".image-source");
      if (source) source.textContent = "Aesthetics Wiki · Gallery image";
    });
  }

  async function enhanceCurrentResults() {
    const shell = document.querySelector(".results-shell");
    if (!shell) return;
    const title = clean(shell.querySelector(".results-title")?.textContent || new URL(location.href).searchParams.get("q"));
    if (!title) return;
    const record = await loadRecord(title);
    if (!document.body.contains(shell)) return;
    injectArticle(shell, record);
    markGalleryCards();
  }

  const observer = new MutationObserver(() => {
    markGalleryCards();
    enhanceCurrentResults();
  });

  window.addEventListener("DOMContentLoaded", () => {
    const app = document.getElementById("app");
    if (app) observer.observe(app, { childList: true, subtree: true });
    enhanceCurrentResults();
  });
})();
