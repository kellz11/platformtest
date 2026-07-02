(() => {
  const parts = window.__CORE_GRAPH_PARTS__ || [];
  const nodes = parts.flatMap((part) => part.nodes || []);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map();

  nodes.forEach((node) => {
    const parent = node.parent || "";
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(node);
  });

  const edges = [];
  nodes.forEach((node) => {
    if (node.parent && byId.has(node.parent)) {
      edges.push({ source: node.id, target: node.parent, relationship: "CHILD_OF", weight: 1, notes: "taxonomy hierarchy", status: "retained" });
    }
    (node.related || []).forEach((rawTarget) => {
      const target = String(rawTarget || "").trim();
      if (target && target !== node.id && byId.has(target)) {
        edges.push({ source: node.id, target, relationship: "RELATED_TO", weight: 0.7, notes: "curated related node", status: "retained" });
      }
    });
  });

  const normalize = (value) => String(value || "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")
    .replace(/\bcore\b/g, " ").replace(/\s+/g, " ").trim();

  function scoreNode(node, query) {
    const target = normalize(query);
    if (!target) return 0;
    const name = normalize(node.name);
    const values = [node.id, node.name, ...(node.keywords || []), ...(node.related || [])].map(normalize).filter(Boolean);
    if (name === target || normalize(node.id) === target) return 1000;
    if (values.includes(target)) return 850;
    if (name.startsWith(target) || target.startsWith(name)) return 650;
    const words = target.split(" ");
    const haystack = values.join(" ");
    const matched = words.filter((word) => haystack.includes(word)).length;
    return matched ? 300 + matched * 70 - Math.abs(name.length - target.length) : 0;
  }

  function searchCoreGraph(query, limit = 8) {
    return nodes.map((node) => ({ node, score: scoreNode(node, query) }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || (a.node.curation_rank || 9999) - (b.node.curation_rank || 9999))
      .slice(0, limit);
  }

  function pathFor(node) {
    const path = [];
    const seen = new Set();
    let current = node;
    while (current && !seen.has(current.id)) {
      path.unshift(current);
      seen.add(current.id);
      current = current.parent ? byId.get(current.parent) : null;
    }
    return path;
  }

  function findCorePath(query) {
    const result = searchCoreGraph(query, 1)[0];
    return result ? { node: result.node, path: pathFor(result.node), exact: result.score >= 850, score: result.score } : null;
  }

  function siblingCores(match) {
    if (!match?.node) return [];
    return (children.get(match.node.parent || "") || []).filter((node) => node.id !== match.node.id).map((node) => node.name);
  }

  function relatedCores(query, limit = 7) {
    const match = findCorePath(query);
    if (!match) return searchCoreGraph(query, limit).map((result) => result.node.name);
    const ids = new Set((match.node.related || []).map((id) => String(id).trim()));
    edges.forEach((edge) => {
      if (edge.source === match.node.id) ids.add(edge.target);
      if (edge.target === match.node.id) ids.add(edge.source);
    });
    siblingCores(match).forEach((name) => {
      const sibling = searchCoreGraph(name, 1)[0]?.node;
      if (sibling) ids.add(sibling.id);
    });
    return [...ids].map((id) => byId.get(id)).filter(Boolean).slice(0, limit).map((node) => node.name);
  }

  // Resolve the phrase sent to outside image providers. The Core suffix is a
  // taxonomy label, not a generic search keyword. Known graph nodes can still
  // supply a purpose-built image_query.
  function resolveCoreSearchQuery(query) {
    const clean = String(query || "").replace(/\s+/g, " ").trim();
    if (!clean) return clean;

    const subject = clean.replace(/\s+core$/i, "").trim() || clean;
    const match = findCorePath(subject);
    if (match && match.score >= 650) return match.node.image_query || match.node.name;
    return subject;
  }

  function resolveCoreLabel(query) {
    const clean = String(query || "").replace(/\s+/g, " ").trim();
    if (!clean) return clean;
    const match = findCorePath(clean);
    if (match && match.score >= 850) return match.node.name;
    const subject = clean.replace(/\s+core$/i, "").trim() || clean;
    return `${subject} core`;
  }

  const evidence = nodes.map((node) => {
    const fandomUrl = (node.source_urls || []).find((url) => String(url).includes("aesthetics.fandom.com")) || "";
    const sourceCount = fandomUrl ? 1 : 0;
    return {
      id: node.id, name: node.name, type: node.type, parent: node.parent,
      verification_status: node.verification_status, confidence_score: node.confidence_score,
      evidence_status: node.verification_status === "taxonomy_approved" ? "taxonomy_approved" : (sourceCount ? "source_attached" : "pending_source_validation"),
      source_count: sourceCount,
      fandom_page_status: sourceCount ? "source_attached_needs_page_confirmation" : "not_confirmed_in_current_pass",
      fandom_page_url: fandomUrl,
      fandom_search_url: `https://aesthetics.fandom.com/wiki/Special:Search?query=${encodeURIComponent(node.name)}`,
      google_trends_query_url: `https://trends.google.com/trends/explore?geo=US&q=${encodeURIComponent(node.name)}`,
      google_trends_value: "", google_trends_status: "requires_collector_or_manual_export",
      reddit_query_url: `https://www.reddit.com/search/?q=${encodeURIComponent(node.name)}&type=posts`,
      reddit_posts_value: "", reddit_status: "requires_api_or_scraper",
      youtube_query_url: `https://www.youtube.com/results?search_query=${encodeURIComponent(node.name)}`,
      youtube_results_value: "", youtube_status: "requires_youtube_data_api",
      measurable_signal_count: sourceCount,
      signal_status: node.verification_status === "taxonomy_approved" ? "taxonomy_only" : (sourceCount ? "partial_real_snapshot" : "collector_pending"),
      snapshot_date: "2026-06-16", source_caveat: ""
    };
  });

  window.CORE_GRAPH = { version: "1.0.0", nodes, edges, evidence };
  window.CORE_EVIDENCE = evidence;
  window.searchCoreGraph = searchCoreGraph;
  window.findCorePath = findCorePath;
  window.siblingCores = siblingCores;
  window.relatedCores = relatedCores;
  window.resolveCoreSearchQuery = resolveCoreSearchQuery;
  window.resolveCoreLabel = resolveCoreLabel;
})();