# Core Culture Indexer v1

This package turns the curated Core graph into an automatic, source-backed index.

## What it does

- Searches Aesthetics Wiki / Fandom and English Wikipedia through their structured MediaWiki APIs.
- Starts from the existing Curated 100 instead of crawling unrelated pages blindly.
- Extracts titles, introductory descriptions, source URLs, and available lead images.
- Normalizes IDs and deduplicates aliases.
- Assigns a parent category with transparent keyword rules.
- Auto-accepts only strong matches.
- Sends uncertain matches to `outputs/review_queue.csv`.
- Generates `CHILD_OF` and `SHARES_TAG` relationships.
- Preserves provenance for every accepted external node.
- Does not use YouTube and does not generate filler nodes.

## Run it

```bash
cd indexer
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export CORE_INDEXER_CONTACT_EMAIL="your@email.com"
python src/core_indexer.py --project-dir .
```

## Outputs

- `core_graph_indexed.json`
- `core_graph_indexed_nodes.csv`
- `core_graph_indexed_edges.csv`
- `review_queue.csv`
- `indexer_run_log.csv`

Weak search results are never labeled as verified. Strong matches become `source_backed`; borderline matches go to `candidate_review`.
