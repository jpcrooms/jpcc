# Johnstone Park Combined Clubrooms — shared Quarto calendar (stage 1.3)

Website: https://jpcrooms.github.io/jpcc/

This version replaces the duplicated event JavaScript in `index.qmd` and
`events.qmd` with **one shared script**, `assets/js/jpcc-events.js`.
It keeps public events and room hire data separate so a two-room booking
calendar can be added without rewriting the event engine. Stage 1.3 adds a room-hire enquiry form.

## Files and responsibilities

| File | What to edit |
| --- | --- |
| `clubs/<your-club>.qmd` | This club's details and recurring event rules (under `jpcc:` in YAML front matter) |
| `events.json` | One-off, public events that should appear on the website calendar |
| `data/rooms.json` | Names and IDs of the building's two rooms |
| `bookings.json` | Manually confirmed room-hire records (currently empty; **not** automatically populated by form submissions) |
| `room-hire.qmd` | Public hall descriptions and the Formspree enquiry form |
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

## Room hire enquiry form (stage 1.3)

The new **Room Hire** navbar/sidebar link opens `room-hire.qmd`. The form submits
with a native HTML POST to **https://formspree.io/f/meagqraw**. Formspree must be
activated and configured under the organisation's Formspree account. **Do not
put credentials in the website files.**

It accepts contact name, email, optional telephone and organisation, hall,
start/finish dates and times (including overnight), expected attendance, one-off or
recurring hire request, event purpose and additional information. For recurring
hire, the visitor is prompted to give the pattern and end date. JavaScript
in the existing shared `assets/js/jpcc-events.js` adjusts the capacity limit
according to the hall, checks that finish is later than start (including overnight hire),
and asks for a recurring description. Native HTML fields still work without
JavaScript. The Formspree service handles the actual submission and response.

Hall mapping in `data/rooms.json`:

- `room-1` = **Large Hall**, up to **80 seated**
- `room-2` = **Small Hall**, up to **25 seated**

Included facilities: kitchen, wheelchair-accessible entrances, accessible
toilets and accessible parking. Standard hire rates apply and an additional
cleaning fee may be charged if needed; **no prices are assumed**.

**Important:** a Formspree submission is an enquiry only. It does not check
live availability, write to `bookings.json`, approve a booking, charge a fee or
lock either hall. Confirm availability manually before accepting hire. Do not
copy submitted contact data into any public site JSON. The visitor's details
are transmitted to Formspree, so make sure your organisation is comfortable
with its privacy/data-handling practices and configure the Formspree inbox.

After deployment, send **one genuine test enquiry** from the live website and
confirm it appears in your Formspree dashboard / notification inbox. The
working files and tests do **not** submit anything to Formspree.

## Two-room booking preparation (stage 2)

The rooms use IDs `room-1` (Large Hall) and `room-2` (Small Hall), as assigned
in stage 1.3. These IDs stay stable for calendar data. A club event
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
**The public enquiry form exists**, but an approval workflow, live double-booking
prevention and the separate room-availability calendar are not implemented yet. A GitHub Pages website alone
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

The original `_quarto.yml` and both original club `.qmd` files are integrated.
The new Room Hire menu link is included in the navbar and Shortcuts sidebar. The build step invokes `python3` explicitly, rather than relying
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
room occupancy, same-room collision detection and form validation wiring.
