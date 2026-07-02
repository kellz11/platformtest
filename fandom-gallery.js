(() => {
  const API = "https://aesthetics.fandom.com/api.php";
  const requested = String(new URLSearchParams(location.search).get("name") || "").trim();
  if (!requested) return;

  function api(query) {
    const url = new URL(API);
    Object.entries({ format: "json", formatversion: "2", origin: "*", ...query }).forEach(([key, value]) => url.searchParams.set(key, value));
    return fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Aesthetics Wiki returned ${response.status}`);
      return response.json();
    });
  }

  function fileTitleFromHref(href) {
    if (!href) return "";
    try {
      const decoded = decodeURIComponent(href);
      const match = decoded.match(/\/wiki\/(File:[^?#]+)/i);
      return match ? match[1].replace(/_/g, " ") : "";
    } catch {
      return "";
    }
  }

  function addGalleryFiles(container, found) {
    container.querySelectorAll("a[href], img").forEach((element) => {
      let title = "";
      if (element.tagName === "A") title = fileTitleFromHref(element.getAttribute("href"));
      if (!title && element.tagName === "IMG") {
        const raw = element.getAttribute("data-image-name") || element.getAttribute("alt") || "";
        if (/\.(?:jpe?g|png|gif|webp|svg)$/i.test(raw)) title = /^File:/i.test(raw) ? raw : `File:${raw}`;
      }
      if (!title) return;
      const item = element.closest(".gallery-item, .wikia-gallery-item, figure, li, div") || element.parentElement;
      const captionNode = item?.querySelector?.("figcaption, .gallerytext, .lightbox-caption, .title, .caption");
      const caption = String(captionNode?.textContent || "").replace(/\s+/g, " ").trim();
      if (!found.has(title)) found.set(title, caption);
    });
  }

  function extractGalleryFiles(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const found = new Map();

    const galleryHeading = [...doc.querySelectorAll("h2,h3")].find((heading) => /gallery/i.test(heading.textContent || "") || heading.querySelector("#Gallery,#gallery"));
    if (galleryHeading) {
      const level = Number(galleryHeading.tagName.slice(1));
      let node = galleryHeading.nextElementSibling;
      while (node) {
        if (/^H[1-6]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= level) break;
        addGalleryFiles(node, found);
        node = node.nextElementSibling;
      }
    }

    if (!found.size) {
      doc.querySelectorAll(".gallery, .wikia-gallery, [class*='gallery']").forEach((gallery) => addGalleryFiles(gallery, found));
    }

    return found;
  }

  async function fetchImageInfo(fileMap) {
    const titles = [...fileMap.keys()];
    const images = [];

    for (let start = 0; start < titles.length; start += 50) {
      const batch = titles.slice(start, start + 50);
      const data = await api({
        action: "query",
        prop: "imageinfo",
        titles: batch.join("|"),
        iiprop: "url|size|mime|extmetadata",
        iiurlwidth: "1200"
      });

      for (const page of data?.query?.pages || []) {
        const info = page?.imageinfo?.[0];
        if (!info?.url || !String(info.mime || "").startsWith("image/")) continue;
        images.push({
          title: page.title,
          image: info.thumburl || info.url,
          source: info.descriptionurl || info.url,
          width: info.thumbwidth || info.width || null,
          height: info.thumbheight || info.height || null,
          caption: fileMap.get(page.title) || ""
        });
      }
    }

    return images;
  }

  function renderGallery(article, title, images) {
    if (!images.length || article.querySelector(".wiki-fandom-gallery")) return;

    const section = document.createElement("section");
    section.className = "wiki-fandom-gallery";
    section.innerHTML = `<div class="wiki-gallery-heading"><h2>Gallery</h2><p>${images.length} images from the original ${escapeText(title)} article</p></div><div class="wiki-gallery-grid"></div>`;
    const grid = section.querySelector(".wiki-gallery-grid");

    images.forEach((item) => {
      const card = document.createElement("figure");
      card.className = "wiki-gallery-card";
      const link = document.createElement("a");
      link.href = item.source;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const image = document.createElement("img");
      image.src = item.image;
      image.alt = item.caption || item.title.replace(/^File:/i, "").replace(/\.[a-z0-9]+$/i, "");
      image.loading = "lazy";
      image.decoding = "async";
      if (item.width && item.height) {
        image.width = item.width;
        image.height = item.height;
      }
      link.appendChild(image);
      card.appendChild(link);
      if (item.caption) {
        const caption = document.createElement("figcaption");
        caption.textContent = item.caption;
        card.appendChild(caption);
      }
      grid.appendChild(card);
    });

    const attribution = article.querySelector(".wiki-attribution");
    article.insertBefore(section, attribution || null);
  }

  function escapeText(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  async function loadGallery(article) {
    const data = await api({ action: "parse", page: requested, prop: "text|displaytitle", redirects: "1", disabletoc: "1" });
    if (!data?.parse?.text) return;
    const files = extractGalleryFiles(data.parse.text);
    if (!files.size) return;
    const images = await fetchImageInfo(files);
    renderGallery(article, data.parse.title || requested, images);
  }

  function start() {
    const existing = document.querySelector(".wiki-article");
    if (existing) {
      loadGallery(existing).catch((error) => console.warn("Fandom gallery could not load", error));
      return;
    }

    const observer = new MutationObserver(() => {
      const article = document.querySelector(".wiki-article");
      if (!article) return;
      observer.disconnect();
      loadGallery(article).catch((error) => console.warn("Fandom gallery could not load", error));
    });
    observer.observe(document.getElementById("wikiApp"), { childList: true, subtree: true });
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start, { once: true }) : start();
})();
