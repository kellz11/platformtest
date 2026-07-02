from pathlib import Path
import json
import shutil

root = Path("assets/cores")
manifest_path = root / "manifest.json"
removed_dir = root / "Cannibalcore"

if removed_dir.exists():
    shutil.rmtree(removed_dir)

manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest.pop("Cannibalcore", None)
manifest_path.write_text(
    json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
    encoding="utf-8",
)

print("Cannibalcore removed from assets and manifest.")
