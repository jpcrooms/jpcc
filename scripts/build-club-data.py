#!/usr/bin/env python3
"""Collect jpcc club event rules from the YAML front matter of clubs/*.qmd.

The browser loads the generated JSON, not Quarto source files.  This script runs
at Quarto pre-render, so edits to any club page appear in the site-wide calendar.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("Missing PyYAML. Install it with: python -m pip install PyYAML")

ROOT = Path(__file__).resolve().parent.parent
ROOMS_FILE = ROOT / "data" / "rooms.json"
OUT_FILE = ROOT / "data" / "clubs.json"
WEEKDAYS = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}
TIME = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
IDENT = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def fail(path: Path, message: str) -> None:
    raise ValueError(f"{path.relative_to(ROOT)}: {message}")


def source_meta(path: Path) -> dict:
    content = path.read_text(encoding="utf-8-sig")
    match = re.match(r"\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\Z)", content, re.S)
    if not match:
        return {}
    metadata = yaml.safe_load(match.group(1)) or {}
    if not isinstance(metadata, dict):
        fail(path, "front matter must be a YAML object")
    return metadata


def iso_date(value, path: Path, key: str) -> str:
    value = str(value)
    try:
        date = dt.date.fromisoformat(value)
    except ValueError:
        fail(path, f"{key} must be a YYYY-MM-DD date")
    if date.isoformat() != value:
        fail(path, f"{key} must be a YYYY-MM-DD date")
    return value


def validate_rule(raw: dict, club_id: str, path: Path, rooms: set[str], position: int) -> dict:
    if not isinstance(raw, dict):
        fail(path, f"event #{position} must be a YAML object")
    rule = dict(raw)
    rule_id = rule.get("id", f"meeting-{position}")
    if not isinstance(rule_id, str) or not IDENT.fullmatch(rule_id):
        fail(path, f"event #{position} id must be lowercase kebab-case")
    if not isinstance(rule.get("title"), str) or not rule["title"].strip():
        fail(path, f"event '{rule_id}' needs a title")
    freq = rule.get("frequency")
    if freq not in ("weekly", "monthly"):
        fail(path, f"event '{rule_id}' frequency must be 'weekly' or 'monthly'")
    start = iso_date(rule.get("startDate", ""), path, f"event '{rule_id}' startDate")
    until = iso_date(rule["until"], path, f"event '{rule_id}' until") if rule.get("until") else None
    if until and until < start:
        fail(path, f"event '{rule_id}' until precedes startDate")
    if not isinstance(rule.get("startTime"), str) or not TIME.fullmatch(rule["startTime"]):
        fail(path, f"event '{rule_id}' startTime must be quoted HH:MM")
    # A public event can have an unknown finishing time. Room occupancy, however,
    # must always have a defined end to avoid creating unbounded reservations.
    end_time = rule.get("endTime")
    if end_time is not None:
        if not isinstance(end_time, str) or not TIME.fullmatch(end_time):
            fail(path, f"event '{rule_id}' endTime must be quoted HH:MM")
        if end_time <= rule["startTime"]:
            fail(path, f"event '{rule_id}' endTime must follow startTime (same day only)")
    interval = rule.get("interval", 1)
    if isinstance(interval, bool) or not isinstance(interval, int) or interval < 1:
        fail(path, f"event '{rule_id}' interval must be a positive integer")
    if freq == "monthly":
        if rule.get("weekday") not in WEEKDAYS:
            fail(path, f"event '{rule_id}' monthly recurrence needs weekday (mon..sun)")
        weeks = rule.get("weeks", [])
        if not isinstance(weeks, list) or not weeks or any(
            isinstance(n, bool) or not isinstance(n, int) or n not in (1, 2, 3, 4, 5, -1)
            for n in weeks
        ):
            fail(path, f"event '{rule_id}' weeks must contain 1..5 or -1 (last)")
    if freq == "weekly":
        weekdays = rule.get("weekdays", [rule.get("weekday")])
        if not isinstance(weekdays, list) or not weekdays or any(d not in WEEKDAYS for d in weekdays):
            fail(path, f"event '{rule_id}' weekdays must list mon..sun")
        rule["weekdays"] = weekdays
    room = rule.get("roomId")
    if room is not None and room not in rooms:
        fail(path, f"event '{rule_id}' unknown roomId '{room}'")
    if room is not None and end_time is None:
        fail(path, f"event '{rule_id}' needs endTime when roomId reserves a room")
    skip = rule.get("skipDates", [])
    if not isinstance(skip, list):
        fail(path, f"event '{rule_id}' skipDates must be a list")
    rule["skipDates"] = [iso_date(d, path, "skipDates entry") for d in skip]
    if rule.get("location") is not None and not isinstance(rule["location"], str):
        fail(path, f"event '{rule_id}' location must be text")
    rule["id"] = rule_id
    rule["startDate"] = start
    if until:
        rule["until"] = until
    rule["interval"] = interval
    rule["clubId"] = club_id
    return rule


def build() -> list[dict]:
    rooms = json.loads(ROOMS_FILE.read_text(encoding="utf-8"))
    if not isinstance(rooms, list) or len(rooms) != 2:
        raise ValueError("data/rooms.json should describe exactly two rooms")
    room_ids = {room["id"] for room in rooms}
    if len(room_ids) != 2:
        raise ValueError("Each room needs a unique id")
    clubs = []
    seen = set()
    for path in sorted((ROOT / "clubs").rglob("*.qmd")):
        jpcc = source_meta(path).get("jpcc")
        if jpcc is None:
            continue
        if not isinstance(jpcc, dict):
            fail(path, "jpcc must be a YAML object")
        cid, name = jpcc.get("id"), jpcc.get("name")
        if not isinstance(cid, str) or not IDENT.fullmatch(cid):
            fail(path, "jpcc.id must be lowercase kebab-case")
        if cid in seen:
            fail(path, f"duplicate jpcc.id '{cid}'")
        seen.add(cid)
        if not isinstance(name, str) or not name.strip():
            fail(path, "jpcc.name must be nonempty text")
        events = jpcc.get("events", [])
        if not isinstance(events, list):
            fail(path, "jpcc.events must be a list")
        rules = [validate_rule(r, cid, path, room_ids, i) for i, r in enumerate(events, 1)]
        ids = [r["id"] for r in rules]
        if len(ids) != len(set(ids)):
            fail(path, "recurring event IDs must be unique within each club")
        clubs.append({"id": cid, "name": name, "page": path.relative_to(ROOT).as_posix(), "events": rules})
    OUT_FILE.parent.mkdir(exist_ok=True, parents=True)
    OUT_FILE.write_text(json.dumps(clubs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return clubs


if __name__ == "__main__":
    try:
        clubs = build()
    except (OSError, ValueError, yaml.YAMLError) as error:
        sys.exit(f"Club calendar build failed: {error}")
    print(f"Club calendar: {len(clubs)} clubs, {sum(len(c['events']) for c in clubs)} recurring schedules -> data/clubs.json")
