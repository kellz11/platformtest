# Core graph data

The browser loads `core-graph-01.js` through `core-graph-06.js` in order.

Current baseline:

- 100 curated nodes
- 20 root and root-category nodes
- 99 `CHILD_OF` relationships generated from each node's `parent`
- 276 `RELATED_TO` relationships generated from valid IDs in each node's `related` list
- 375 total graph relationships
- 100 evidence records generated at runtime in `taxonomy.js`

`taxonomy.js` exposes:

- `window.CORE_GRAPH`
- `window.CORE_EVIDENCE`
- `window.searchCoreGraph()`
- `window.findCorePath()`
- `window.siblingCores()`
- `window.relatedCores()`
- `window.resolveCoreSearchQuery()`

The Python tools under `/indexer` can export the browser graph to JSON and collect source-backed candidates from MediaWiki APIs. `/tools/export_workbook.py` rebuilds the Excel seed workbook from repository data.
