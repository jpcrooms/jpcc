#!/usr/bin/env python3
"""Merge upcoming ham contests into events.json.

Club extras (no source, or source other than contest feeds) are kept.
Imported contest rows are replaced on each run.
"""

from __future__ import annotations

import html
import json
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "events.json"
ADELAIDE = ZoneInfo("Australia/Adelaide")
UA = "VK5ALM-club-site/1.0 (+https://github.com/)"
HORIZON_DAYS = 90
MAX_CONTESTS = 40

FEEDS = [
    {
        "source": "wia",
        "url": "https://www.wia.org.au/newsevents/events/ics/calendar.ics",
        "filter": False,
    },
    {
        "source": "wa7bnm",
        "url": (
            "https://calendar.google.com/calendar/ical/"
            "9o3or51jjdsantmsqoadmm949k%40group.calendar.google.com/public/basic.ics"
        ),
        "filter": True,
    },
]

KEYWORDS = (
    "cq ww",
    "cq wpx",
    "arrl",
    "iaru",
    "oceania",
    "remembrance",
    "john moyle",
    "vk shires",
    "trans-tasman",
    "trans tasman",
    "field day",
    "iota contest",
    "wae",
    "all asian",
    "australia day",
    "harry angel",
    "ross hull",
    "vkff",
    "rd contest",
    "oceania dx",
    "commonwealth contest",
)


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", "replace")


def unfold(text: str) -> list[str]:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\n[ \t]", "", text).split("\n")


def unescape(value: str) -> str:
    return (
        value.replace("\\n", " ")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
        .strip()
    )


def parse_ics_time(value: str, params: str) -> datetime | date | None:
    value = value.strip()
    if "VALUE=DATE" in params or (len(value) == 8 and "T" not in value):
        try:
            return date(int(value[0:4]), int(value[4:6]), int(value[6:8]))
        except ValueError:
            return None
    stamp = value
    tz = timezone.utc if stamp.endswith("Z") else None
    stamp = stamp.rstrip("Z")
    try:
        if "T" in stamp:
            dt = datetime.strptime(stamp, "%Y%m%dT%H%M%S")
        else:
            return date(int(stamp[0:4]), int(stamp[4:6]), int(stamp[6:8]))
    except ValueError:
        try:
            dt = datetime.strptime(stamp, "%Y%m%dT%H%M")
        except ValueError:
            return None
    if tz:
        dt = dt.replace(tzinfo=tz)
    return dt


def parse_vevents(text: str) -> list[dict]:
    events = []
    current = None
    for line in unfold(text):
        if line == "BEGIN:VEVENT":
            current = {}
            continue
        if line == "END:VEVENT":
            if current:
                events.append(current)
            current = None
            continue
        if current is None or ":" not in line:
            continue
        meta, value = line.split(":", 1)
        name, _, params = meta.partition(";")
        name = name.upper()
        if name in {"SUMMARY", "DESCRIPTION", "URL", "UID"}:
            current[name.lower()] = unescape(value)
        elif name in {"DTSTART", "DTEND"}:
            current[name.lower()] = parse_ics_time(value, params)
    return events


def interesting(title: str) -> bool:
    low = title.lower()
    return any(key in low for key in KEYWORDS)


def to_event(raw: dict, source: str) -> dict | None:
    start = raw.get("dtstart")
    if start is None:
        return None
    title = html.unescape(raw.get("summary") or "Contest")
    end = raw.get("dtend")
    desc = raw.get("description") or ""
    link = raw.get("url") or ""
    if not link:
        m = re.search(r"https?://[^\s<>\"]+", desc)
        if m:
            link = m.group(0).rstrip(").,")

    if isinstance(start, date) and not isinstance(start, datetime):
        start_s = start.isoformat()
        end_s = end.isoformat() if isinstance(end, date) else None
        when = start.strftime("%d %b %Y")
        start_sort = datetime(start.year, start.month, start.day, tzinfo=ADELAIDE)
    else:
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        local = start.astimezone(ADELAIDE)
        start_s = local.strftime("%Y-%m-%dT%H:%M:%S")
        start_sort = local
        tzname = "ACDT" if local.dst() else "ACST"
        when = local.strftime("%d %b %Y %-I:%M %p ") + tzname
        if isinstance(end, datetime):
            if end.tzinfo is None:
                end = end.replace(tzinfo=timezone.utc)
            end_s = end.astimezone(ADELAIDE).strftime("%Y-%m-%dT%H:%M:%S")
        else:
            end_s = None

    item = {
        "title": title,
        "start": start_s,
        "source": source,
        "extendedProps": {
            "place": "On air",
            "when": when,
            "source": source,
        },
    }
    if end_s:
        item["end"] = end_s
    if link:
        item["extendedProps"]["url"] = link
    item["_sort"] = start_sort
    return item


def load_manual() -> list[dict]:
    if not OUT.exists():
        return []
    try:
        data = json.loads(OUT.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return [
        ev
        for ev in data
        if isinstance(ev, dict) and ev.get("source") not in {"wia", "wa7bnm", "contest"}
    ]


def main() -> int:
    today = datetime.now(ADELAIDE)
    horizon = today + timedelta(days=HORIZON_DAYS)
    imported: list[dict] = []

    for feed in FEEDS:
        try:
            text = fetch(feed["url"])
            raw_events = parse_vevents(text)
        except Exception as exc:
            print(f"{feed['source']}: FAIL {exc}", file=sys.stderr)
            continue
        kept = 0
        for raw in raw_events:
            title = raw.get("summary") or ""
            if feed["filter"] and not interesting(title):
                continue
            item = to_event(raw, feed["source"])
            if not item:
                continue
            start_sort = item["_sort"]
            if start_sort < today - timedelta(hours=12) or start_sort > horizon:
                continue
            imported.append(item)
            kept += 1
        print(f"{feed['source']}: kept {kept} upcoming", file=sys.stderr)

    imported.sort(key=lambda ev: ev["_sort"])
    # de-dupe by title+start
    seen = set()
    unique = []
    for ev in imported:
        key = (ev["title"].lower(), ev["start"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(ev)
    unique = unique[:MAX_CONTESTS]
    for ev in unique:
        ev.pop("_sort", None)

    manual = load_manual()
    OUT.write_text(json.dumps(manual + unique, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(manual)} club + {len(unique)} contests)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())