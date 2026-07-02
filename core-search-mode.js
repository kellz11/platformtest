(() => {
  const originalFetch = window.fetch.bind(window);

  function cleanInput(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function stripGenericCoreSuffix(value) {
    const clean = cleanInput(value);
    return clean.replace(/\s+core$/i, "").trim() || clean;
  }

  function matchedNode(value) {
    if (!window.findCorePath) return null;
    const match = window.findCorePath(stripGenericCoreSuffix(value));
    return match && match.score >= 650 ? match : null;
  }

  function providerSearch(value, provider) {
    const clean = cleanInput(value);
    if (!clean) return { query: clean, exactPhrase: false };

    const subject = stripGenericCoreSuffix(clean);
    const match = matchedNode(clean);

    if (match?.node) {
      const node = match.node;
      const keywords = (node.keywords || []).map(cleanInput).filter(Boolean);
      const isAesthetic = node.type === "aesthetic" || node.type === "internet";

      if (isAesthetic && keywords.length) {
        if (provider === "wikimedia") {
          return { query: keywords[0], exactPhrase: false };
        }
        return { query: keywords.slice(0, 2).join(" "), exactPhrase: false };
      }

      const imageQuery = cleanInput(node.image_query || node.name)
        .replace(/\b(?:aesthetic\s+)?moodboard\b/gi, "")
        .replace(/\baesthetic\s+reference\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      return {
        query: imageQuery || node.name || subject,
        exactPhrase: provider === "wikimedia" && (imageQuery || node.name || subject).includes(" ")
      };
    }

    return {
      query: subject,
      exactPhrase: provider === "wikimedia" && subject.includes(" ")
    };
  }

  window.fetch = (resource, options) => {
    try {
      const rawUrl = typeof resource === "string" ? resource : resource.url;
      const url = new URL(rawUrl, window.location.href);

      if (url.hostname === "api.openverse.org" && url.searchParams.has("q")) {
        const resolved = providerSearch(url.searchParams.get("q"), "openverse");
        url.searchParams.set("q", resolved.query);
        resource = typeof resource === "string" ? url.toString() : new Request(url.toString(), resource);
      }

      if (url.hostname === "commons.wikimedia.org" && url.searchParams.has("gsrsearch")) {
        const resolved = providerSearch(url.searchParams.get("gsrsearch"), "wikimedia");
        const query = resolved.exactPhrase ? `"${resolved.query.replace(/["“”]/g, "")}"` : resolved.query;
        url.searchParams.set("gsrsearch", query);
        resource = typeof resource === "string" ? url.toString() : new Request(url.toString(), resource);
      }
    } catch (error) {
      console.warn("Core search normalization skipped", error);
    }

    return originalFetch(resource, options);
  };

  window.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("searchInput");
    if (input) input.placeholder = "Type anything — search within the Core graph";

    const header = document.querySelector(".site-header");
    if (header && !header.querySelector(".wiki-nav-link")) {
      const link = document.createElement("a");
      link.className = "wiki-nav-link";
      link.href = "./core.html";
      link.textContent = "Core Wiki";
      header.appendChild(link);
    }
  });
})();
