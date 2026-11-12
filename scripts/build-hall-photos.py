#!/usr/bin/env python3
"""Prepare public hall photo thumbnails and a manifest for the Quarto website.

Drop original photos into hall-photos-source/{large,small}/.  HEIC conversion uses
macOS `sips`; JPEG/PNG/WebP files work on all platforms.  Originals remain
outside the public asset directory.  Only generated/public photos are linked.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "hall-photos-source"
DEST = ROOT / "assets" / "hall-photos"
HALLS = {"large": "Large Hall", "small": "Small Hall"}
COPY_FORMATS = {".jpg", ".jpeg", ".png", ".webp"}
HEIC_FORMATS = {".heic", ".heif"}


def safe_stem(name: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", name.lower().replace("_", "-")).strip("-") or "photo"


def build() -> list[dict]:
    DEST.mkdir(parents=True, exist_ok=True)
    result = []
    sips = shutil.which("sips")
    for hall, display in HALLS.items():
        src_folder = SOURCE / hall
        dst_folder = DEST / hall
        src_folder.mkdir(parents=True, exist_ok=True)
        dst_folder.mkdir(parents=True, exist_ok=True)
        photos = []
        expected = set()
        for source in sorted(src_folder.iterdir(), key=lambda p: p.name.casefold()):
            if not source.is_file() or source.name.startswith("."):
                continue
            ext = source.suffix.lower()
            if ext not in COPY_FORMATS | HEIC_FORMATS:
                continue
            stem = safe_stem(source.stem)
            # Include source extension in public file name to avoid collisions.
            target_ext = ".jpg" if ext in HEIC_FORMATS else ext
            target = dst_folder / f"{stem}-{ext.lstrip('.')}{target_ext}"
            if ext in HEIC_FORMATS:
                if not sips:
                    print(f"WARNING: Cannot convert {source.name} without macOS sips; "
                          "convert to JPEG or WebP and try again.")
                    continue
                if not target.exists() or source.stat().st_mtime > target.stat().st_mtime:
                    try:
                        subprocess.run([sips, "-s", "format", "jpeg", str(source), "--out", str(target)],
                                       check=True, capture_output=True, text=True)
                    except subprocess.CalledProcessError as error:
                        print(f"WARNING: Could not convert {source}: {error.stderr.strip()}")
                        continue
            else:
                if not target.exists() or source.stat().st_mtime > target.stat().st_mtime:
                    shutil.copy2(source, target)
            expected.add(target.name)
            photos.append({
                "src": f"assets/hall-photos/{hall}/{target.name}",
                "alt": f"{display} — {source.stem.replace('_', ' ').replace('-', ' ')}",
            })
        # Remove only stale generated photos, not manually managed files.
        for obsolete in dst_folder.iterdir():
            if obsolete.is_file() and obsolete.suffix.lower() in COPY_FORMATS and obsolete.name not in expected:
                obsolete.unlink()
        result.append({"id": hall, "name": display, "photos": photos})
    (DEST / "manifest.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Hall photo manifest:", ", ".join(f"{h['name']}={len(h['photos'])}" for h in result))
    return result


if __name__ == "__main__":
    build()
