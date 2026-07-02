#!/usr/bin/env python3
"""Seed-based Core graph indexer for MediaWiki sources."""
from __future__ import annotations

import argparse
import json
import os
import re
import time
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import quote

import requests

SOURCES = [
    ("aesthetics_fandom", "https://aesthetics.fandom.com/api.php", 1.0),
    ("wikipedia_en", "https://en.wikipedia.org/w/api.php", 0.75),
]


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def title_similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, slugify(left), slugify(right)).ratio()


def extract_keywords(title: str, description: str) -> list[str]:
    words = re.findall(r"[a-z0-9]{3,}", f"{title} {description}".lower())
    stop = {"the", "and", "with", "from", "that", "this", "into", "core", "aesthetic"}
    return list(dict.fromkeys(word for word in words if word not in stop))[:24]


def mediawiki_search(api_url: str, query: str, limit: int = 5) -> list[dict]:
    response = requests.get(api_url, params={
        "action": "query", "list": "search", "srsearch": query,
        "srlimit": limit, "format": "json", "origin": "*"
    }, timeout=25)
    response.raise_for_status()
    return response.json().get("query", {}).get("search", [])


def mediawiki_page(api_url: str, title: str) -> dict:
    response = requests.get(api_url, params={
        "action": "query", "prop": "extracts|pageimages|info", "titles": title,
        "exintro": 1, "explaintext": 1, "piprop": "original", "inprop": "url",
        "format": "json", "origin": "*"
    }, timeout=25)
    response.raise_for_status()
    pages = response.json().get("query", {}).get("pages", {})
    return next(iter(pages.values()), {})


def load_seeds(project_dir: Path) -> list[dict]:
    candidates = [
        project_dir / "inputs" / "core_graph_curated_100.json",
        project_dir.parent / "data" / "core_graph_curated_100.json",
    ]
    for path in candidates:
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            return data.get("nodes", data if isinstance(data, list) else [])
    raise FileNotFoundError("Place core_graph_curated_100.json in indexer/inputs or data/")


def run(project_dir: Path, limit_seeds: int | None = None) -> None:
    seeds = load_seeds(project_dir)
    if limit_seeds:
        seeds = seeds[:limit_seeds]
    accepted, review, log = [], [], []
    user_agent = f"CoreCultureIndexer/1.0 ({os.getenv('CORE_INDEXER_CONTACT_EMAIL', 'contact-not-set')})"
    session = requests.Session()
    session.headers.update({"User-Agent": user_agent})

    for seed in seeds:
        for source_id, api_url, source_weight in SOURCES:
            try:
                results = mediawiki_search(api_url, seed["name"])
                for item in results:
                    page = mediawiki_page(api_url, item["title"])
                    description = page.get("extract", "").strip()
                    score = title_similarity(seed["name"], item["title"]) * source_weight
                    record = {
                        "id": slugify(item["title"]), "name": item["title"],
                        "description": description, "keywords": extract_keywords(item["title"], description),
                        "source_id": source_id, "source_url": page.get("fullurl", ""),
                        "image_url": page.get("original", {}).get("source", ""),
                        "seed_id": seed["id"], "confidence": round(score, 4),
                        "verification_status": "source_backed" if score >= 0.82 else "candidate_review"
                    }
                    (accepted if score >= 0.82 and len(description) >= 40 else review).append(record)
                log.append({"seed_id": seed["id"], "source": source_id, "status": "ok", "results": len(results)})
            except Exception as exc:
                log.append({"seed_id": seed["id"], "source": source_id, "status": "error", "error": str(exc)})
            time.sleep(0.35)

    output = project_dir / "outputs"
    output.mkdir(parents=True, exist_ok=True)
    (output / "accepted_nodes.json").write_text(json.dumps(accepted, indent=2), encoding="utf-8")
    (output / "review_queue.json").write_text(json.dumps(review, indent=2), encoding="utf-8")
    (output / "indexer_run_log.json").write_text(json.dumps(log, indent=2), encoding="utf-8")
    print(f"accepted={len(accepted)} review={len(review)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-dir", default=".")
    parser.add_argument("--limit-seeds", type=int)
    args = parser.parse_args()
    run(Path(args.project_dir).resolve(), args.limit_seeds)


if __name__ == "__main__":
    main()
