#!/usr/bin/env python3
"""Fetch TWIAR, ARRL and Amateur Radio Newsline RSS into ham-news.qmd."""

from __future__ import annotations

import html
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

FEEDS = [
    {
        "name": "This Week in Amateur Radio",
        "id": "twiar",
        "url": "https://twiar.net/feed/",
        "home": "https://twiar.net/",
        "limit": 8,
    },
    {
        "name": "ARRL News",
        "id": "arrl",
        "url": "https://www.arrl.org/news/rss",
        "home": "https://www.arrl.org/news",
        "limit": 8,
    },
    {
        "name": "Amateur Radio Newsline",
        "id": "newsline",
        "url": "https://www.arnewsline.org/news?format=rss",
        "home": "https://www.arnewsline.org/",
        "limit": 4,
    },
]

UA = "VK5ALM-club-site/1.0 (+https://github.com/)"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "ham-news.qmd"


def strip_html(text: str) -> str:
    text = html.unescape(text or "")
    text = re.sub(r"(?is)<script.*?>.*?</script>", " ", text)
    text = re.sub(r"(?is)<style.*?>.*?</style>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def first_sentences(text: str, limit: int = 280) -> str:
    text = strip_html(text)
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(".,;:") + "…"


def parse_date(raw: str) -> str:
    if not raw:
        return ""
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.date().isoformat()
    except Exception:
        return raw[:16]


def fetch_items(feed: dict) -> list[dict]:
    req = urllib.request.Request(feed["url"], headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as resp:
        raw = resp.read()
    root = ET.fromstring(raw)
    items = []
    for node in root.findall(".//item")[: feed["limit"]]:
        title = strip_html(node.findtext("title") or "")
        link = (node.findtext("link") or "").strip()
        desc = first_sentences(node.findtext("description") or "")
        date = parse_date(node.findtext("pubDate") or "")
        if title and link:
            items.append({"title": title, "link": link, "desc": desc, "date": date})
    return items


def md_escape(text: str) -> str:
    return text.replace("[", "\\[").replace("]", "\\]")


def render(sections: list[tuple[dict, list[dict], str | None]]) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "---",
        'title: "Ham news"',
        "toc: true",
        "---",
        "",
        "Headlines are pulled automatically from public RSS feeds.",
        f"Last fetched **{now}**. Follow the link for the full story.",
        "",
        "Club items stay on the [News](news.qmd) page.",
        "WIA national news: [wia.org.au](https://www.wia.org.au/newsevents/news/).",
        "",
    ]
    for feed, items, error in sections:
        lines.append(f"## [{feed['name']}]({feed['home']})")
        lines.append("")
        if error:
            lines.append(f"_Could not refresh this feed ({error})._")
            lines.append("")
            continue
        if not items:
            lines.append("_No items returned._")
            lines.append("")
            continue
        for item in items:
            title = md_escape(item["title"])
            stamp = f"{item['date']} — " if item["date"] else ""
            lines.append(f"- **{stamp}[{title}]({item['link']})**")
            if item["desc"]:
                lines.append(f"  {item['desc']}")
            lines.append("")
    lines.append("---")
    lines.append("")
    lines.append(
        "Sources: [TWIAR](https://twiar.net/), [ARRL](https://www.arrl.org/news), "
        "[Amateur Radio Newsline](https://www.arnewsline.org/)."
    )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    sections = []
    failures = 0
    for feed in FEEDS:
        try:
            items = fetch_items(feed)
            sections.append((feed, items, None))
            print(f"{feed['id']}: {len(items)} items", file=sys.stderr)
        except Exception as exc:
            failures += 1
            sections.append((feed, [], f"{type(exc).__name__}: {exc}"))
            print(f"{feed['id']}: FAIL {exc}", file=sys.stderr)
    OUT.write_text(render(sections), encoding="utf-8")
    print(f"wrote {OUT}", file=sys.stderr)
    return 1 if failures == len(FEEDS) else 0


if __name__ == "__main__":
    raise SystemExit(main())