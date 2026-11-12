# Hall photographs

Place photographs in **large/** and **small/** according to the hall shown.
Any filename is fine (e.g. `Front view.heic`, `Kitchen.jpeg`).

Run `python3 scripts/build-hall-photos.py` or `quarto render`.

- On a **Mac**, `.heic` and `.heif` files are converted to `.jpg` by macOS `sips`.
- On other platforms, convert them to JPEG/WebP/PNG first.
- JPEG, PNG and WebP are copied to the public `assets/hall-photos/` directory.
- A JSON manifest is rebuilt automatically. The Room Hire page will display
  clickable thumbnails for every photo found, with a full-size image link.
- Original photos stay in this folder; only the converted photos and manifest
  are published as website assets.
- No photographs have been included in this release: the gallery stays a
  plain informational placeholder until you add yours.

For conversion by hand on macOS:

```bash
sips -s format jpeg "My Hall Photo.heic" --out "My Hall Photo.jpg"
```

Do not place personal/identifying photos online without appropriate permission.
