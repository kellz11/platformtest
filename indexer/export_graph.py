#!/usr/bin/env python3
"""Export the browser graph parts into one JSON file for the Python indexer."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parts = sorted((root / "data").glob("core-graph-*.js"))
nodes = []
edges = []
for path in parts:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"\.push\((.*)\);\s*$", text, re.S)
    if not match:
        continue
    payload = json.loads(match.group(1))
    nodes.extend(payload.get("nodes", []))
    edges.extend(payload.get("edges", []))

by_id = {node["id"]: node for node in nodes}
for node in nodes:
    if node.get("parent") in by_id:
        edges.append({"source": node["id"], "target": node["parent"], "relationship": "CHILD_OF", "weight": 1.0})
    for target in node.get("related", []):
        target = str(target).strip()
        if target in by_id and target != node["id"]:
            edges.append({"source": node["id"], "target": target, "relationship": "RELATED_TO", "weight": 0.7})

out = Path(__file__).resolve().parent / "inputs" / "core_graph_curated_100.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({"nodes": nodes, "edges": edges}, indent=2), encoding="utf-8")
print(f"exported {len(nodes)} nodes and {len(edges)} edges to {out}")
