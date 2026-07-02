(() => {
  const originalFetch = window.fetch.bind(window);
  const manifestPromise = originalFetch(`./assets/cores/manifest.json?v=${Date.now()}`, { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .catch(() => null);

  const normalize = (value) => String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "");

  let indexPromise;

  async function galleryIndex() {
    if (!indexPromise) {
      indexPromise = manifestPromise.then((manifest) => {
        if (!manifest || typeof manifest !== "object") return null;
        const byCore = new Map();
        const byFile = new Map();

        Object.entries(manifest).forEach(([core, paths]) => {
          const record = { core, paths: Array.isArray(paths) ? paths : [] };
          byCore.set(normalize(core), record);
          record.paths.forEach((path) => {
            const filename = String(path).split("/").pop();
            if (filename) byFile.set(filename.toLowerCase(), path);
          });
        });

        return { byCore, byFile };
      });
    }
    return indexPromise;
  }

  function jsonResponse(payload) {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  function imageMime(path) {
    const extension = String(path).split(".").pop().toLowerCase();
    if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
    if (extension === "png") return "image/png";
    if (extension === "gif") return "image/gif";
    if (extension === "avif") return "image/avif";
    return "image/webp";
  }

  window.fetch = async (resource, options) => {
    try {
      const rawUrl = typeof resource === "string" ? resource : resource.url;
      const url = new URL(rawUrl, location.href);
      const isAestheticsApi = url.hostname === "aesthetics.fandom.com" && url.pathname.endsWith("/api.php");

      if (isAestheticsApi) {
        const index = await galleryIndex();
        if (index) {
          const action = url.searchParams.get("action");
          const prop = url.searchParams.get("prop") || "";

          if (action === "parse" && prop.split("|").includes("images")) {
            const title = url.searchParams.get("page") || "";
            const record = index.byCore.get(normalize(title));
            if (record?.paths.length) {
              const filenames = record.paths.map((path) => String(path).split("/").pop()).filter(Boolean);
              return jsonResponse({ parse: { title: record.core, images: filenames } });
            }
          }

          if (action === "query" && prop.split("|").includes("imageinfo") && url.searchParams.has("titles")) {
            const requested = url.searchParams.get("titles").split("|");
            const pages = [];

            requested.forEach((title, indexNumber) => {
              const filename = title.replace(/^File:/i, "");
              const path = index.byFile.get(filename.toLowerCase());
              if (!path) return;
              const absolute = new URL(path, location.href).toString();
              pages.push({
                pageid: indexNumber + 1,
                ns: 6,
                title: `File:${filename}`,
                imageinfo: [{
                  url: absolute,
                  thumburl: absolute,
                  descriptionurl: absolute,
                  mime: imageMime(path)
                }]
              });
            });

            if (pages.length) return jsonResponse({ query: { pages } });
          }
        }
      }
    } catch (error) {
      console.warn("Local Core gallery lookup skipped", error);
    }

    return originalFetch(resource, options);
  };
})();
