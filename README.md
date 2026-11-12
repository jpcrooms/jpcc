# Johnstone Park Combined Clubrooms — shared Quarto calendar (stage 1.2)

Website: https://jpcrooms.github.io/jpcc/

This version replaces the duplicated event JavaScript in `index.qmd` and
`events.qmd` with **one shared script**, `assets/js/jpcc-events.js`.
It keeps public events and room hire data separate so a two-room booking
calendar can be added without rewriting the event engine.

## Files and responsibilities

| File | What to edit |
| --- | --- |
| `clubs/<your-club>.qmd` | This club's details and recurring event rules (under `jpcc:` in YAML front matter) |
| `events.json` | One-off, public events that should appear on the website calendar |
| `data/rooms.json` | Names and IDs of the building's two rooms |
| `bookings.json` | Future room-hire records (initially empty) |
| `scripts/build-club-data.py` | Build helper: reads the individual club `.qmd` pages |
| `data/clubs.json` | Generated output; **do not edit manually** |
| `assets/js/jpcc-events.js` | Shared recurrence, event listing, calendar and room-conflict engine |

Only change a recurring meeting rule **in the relevant club `.qmd` file**.
The `pre-render` step of `_quarto.yml` uses Python 3 to read *all* `.qmd` files in `clubs/`
(including subfolders) and generates `data/clubs.json` for the browser.
This build step is required because the published browser cannot directly
read Quarto YAML front matter from a `.qmd` source file.

## Add a recurring event to any club

Put this in the club page's YAML front matter (between its `---` markers):

```yaml
jpcc:
  id: example-club
  name: Example Club
  events:
    - id: regular-meeting
      title: Example Club meeting
      frequency: weekly
      weekdays: [mon, thu]
      startDate: '2026-11-01'
      startTime: '18:30'
      endTime: '20:30'
      roomId: room-1  # Optional: omit until the room is confirmed
      location: Johnstone Park Combined Clubrooms
      skipDates: ['2026-12-24']
```

For a **monthly** meeting, replace `frequency` / `weekdays` with:

```yaml
frequency: monthly
weekday: wed
weeks: [2, 4]  # second and fourth Wednesday each month
```

`weeks: [-1]` means the last occurrence of the weekday in the month.
You can specify several recurring event entries in one club's `events:` list.
You can add an `until: '2027-12-31'` ending date. Without `until`, recurrence
continues for as long as the calendar asks for it. `interval: 2` gives every
second week or every second month. All dates are YYYY-MM-DD and times are
**quoted** 24-hour HH:MM, on the same day, in **Australia/Adelaide** local time.
`startTime` is required; `endTime` may be omitted for public events whose
finishing time is unknown. **For room bookings, both `roomId` and `endTime`
are required**; otherwise the site must not assume that a room is occupied.
Supported recurrence types in stage 1: **weekly** and **monthly by weekday**.
For irregular meetings, use one-off events in `events.json` instead.

Each club needs a unique `jpcc.id`, and each schedule needs an `id` unique
within its club. Clubs with no agreed recurrence can set `events: []`.

## Club pages in this archive

Both original club pages have now been provided and incorporated **without
removing their original text or page metadata**:

- `clubs/VK5ALM-radio-club.qmd` — second/fourth Wednesday meeting starts
  at **7 pm**, as stated on the original page. No ending time or room is
  assumed. Its AHARS affiliation, address and welcome text are preserved.
- `clubs/Murray-Bridge-Christadelphians.qmd` — its original page title, empty
  subtitle and TOC setting are preserved. No recurring schedule is claimed;
  its existing 22 November 2026 event remains in `events.json`.

Each page also has a `jpcc:` front-matter section, a club-only upcoming
list, and a reference to the shared script.

## Public one-off event

Edit `events.json` (a JSON array). Example:

```json
{
  "id": "field-day-2027",
  "clubId": "vk5alm",
  "title": "Radio field day",
  "start": "2027-03-07T09:00:00",
  "end": "2027-03-07T15:00:00",
  "roomId": "room-1",
  "extendedProps": {
    "place": "Johnstone Park Combined Clubrooms",
    "url": "https://example.org/event-info"
  }
}
```

This object belongs inside the `events.json` array, separated from other
objects by commas. `roomId` is optional. For *all-day* events use date-only
`start` / `end`: the `end` is exclusive (for 22–23 September use
`"end": "2027-09-24"`). The example URL is a placeholder.

The original Christadelphians event was supplied with a 10:29 a.m. end before
its 10:30 a.m. start, and an `extendedProps.when` text that disagreed with the
date. This release removes the invalid end and conflicting text without
inventing a meeting duration. Please confirm its details.

## Two-room booking preparation (stage 2)

The rooms are currently called `room-1` / `room-2`. Rename their display
names in `data/rooms.json` once the real names are confirmed. A club event
**only occupies a room** when that event has `roomId` set. Meetings held
elsewhere, or with an unassigned room, do not block either room.

`bookings.json` remains an empty array in this stage. It is intentionally
separate from `events.json`. An eventual manual booking record could be:

```json
{
  "id": "hire-2027-03-07-room-2",
  "roomId": "room-2",
  "title": "Private hire",
  "start": "2027-03-07T09:00:00",
  "end": "2027-03-07T12:00:00",
  "status": "confirmed"
}
```

The shared JavaScript already provides `roomOccupancyForRange()` and
`findRoomConflicts()` for the **next** room-availability page. Bookings with
`status: "cancelled"` are ignored. Rooms may be occupied at the same time,
but a single room cannot safely have overlapping confirmed reservations.
**A booking form, approval workflow, live double-booking prevention and
room calendar UI are not implemented yet.** A GitHub Pages website alone
cannot safely accept or lock live reservation requests. Avoid publishing
names, phone numbers, or other private booking details in public JSON.

## Setup and build

The original `_quarto.yml` is included in this release.
**Your existing navbar, Murray Bridge News link, docked sidebar, footer,
red background, page search, website description, output location (`docs`),
Cosmo theme, table of contents, favicon, and other HTML settings have been
preserved.** Only `project.pre-render` and additional `project.resources` entries
were introduced to support the shared calendar. The pre-render script is a
Python 3 file, so Quarto invokes Python to run it; PyYAML must be installed.

The original `_quarto.yml` and both original club `.qmd` files are now
integrated. The build step invokes `python3` explicitly, rather than relying
on executable permission of the `.py` file.

Install Python/PyYAML, and use Quarto as usual:

```bash
python3 -m pip install PyYAML
python3 scripts/build-club-data.py     # optional: Quarto also runs this automatically
quarto preview
# or
quarto render
```

For GitHub Pages, commit the original source files, then publish the rendered
`docs/` site using your existing deployment process. Quarto copies
`events.json`, `bookings.json`, `data/*.json` and the shared script into it.

**Important:** opening `index.html` directly via `file://` typically blocks
fetching local JSON. Use `quarto preview` or a local HTTP server instead.

## Tests

With Node.js 18+ installed:

```bash
node --test tests/jpcc-events.test.js
```

Tests cover both clubs, monthly/weekly recurrence, exclusions and intervals,
recurrence beyond 2035, one-off events, seasonal-neutral Adelaide time labels,
room occupancy, and same-room collision detection.
