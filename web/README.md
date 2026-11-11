# Johnstone Park Combined Club Rooms — Quarto site


`https://jpcrooms.github.io/jpcc/`


## Calendar

Club evwntsare generated automatically by `events.qmd`:

- 2nd and 4th Wednesday of each month
- 7:00 p.m. to 9:00 p.m. Adelaide time
- Combined Clubs, Johnstone Park, 12 Thomas Street, Murray Bridge

Do **not** put ordinary club meetings in `events.json`. Those dates look after themselves.

### Add an extra event

Edit `events.json` in the project root. It starts as an empty list:

```json
[]
```

Add one-off events such as a show stand or field day. Keep valid JSON: commas between objects, no comma after the last one.

```json
[
  {
    "title": "Murray Bridge Show stand",
    "start": "2026-09-22",
    "end": "2026-09-24",
    "extendedProps": {
      "place": "Murray Bridge Showgrounds",
      "when": "22-23 September 2026"
    }
  },
  {
    "title": "Field day",
    "start": "2026-10-10T09:00:00",
    "end": "2026-10-10T15:00:00",
    "extendedProps": {
      "place": "Johnstone Park, Murray Bridge",
      "when": "10 October 2026 9:00 a.m. Adelaide"
    }
  }
]
```

Notes:

- Date-only values (`2026-09-22`) are all-day events. FullCalendar treats `end` as exclusive, so a two-day show on 22-23 Sep uses `"end": "2026-09-24"`.
- Timed events use `YYYY-MM-DDTHH:MM:SS` with no `Z` on the end. Times are Adelaide.
- `extendedProps.when` is what the click popup shows. If you omit it, the popup falls back to the start string.
- After editing, rebuild and publish so GitHub Pages picks up the new `events.json`.

## Publish on GitHub Pages

```bash
# once Quarto is installed: https://quarto.org/docs/get-started/
cd vk5alm-quarto
quarto publish gh-pages
```

Or render locally and push the `docs/` folder:

```bash
quarto render
```

Then in the GitHub repo: Settings → Pages → Deploy from branch `main` / `/docs`.

`_quarto.yml` already lists `events.json` under `project.resources`, so the extras file is copied into the built site.

## Local preview

```bash
quarto preview
```
