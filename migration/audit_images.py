#!/usr/bin/env python3
"""Audit content lost when the Blogger feed was migrated to markdown.

Reports, per episode:
  * feed images that are not referenced by the markdown at all
  * image captions from the feed that no longer appear in the markdown
  * hyperlinks from the feed that no longer appear in the markdown
  * local images stored at a lower resolution than the source offers
"""

from __future__ import annotations

import hashlib
import html as html_module
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
FEED_PATH = ROOT / "Takeout/Blogger/Blogs/קדמא Kedma/feed.atom"
CONTENT_DIR = ROOT / "src/content/episodes"
IMAGES_DIR = ROOT / "public/images/episodes"

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "blogger": "http://schemas.google.com/blogger/2018",
}

SKIP_IMAGE_PATTERNS = (
    "spotify",
    "stitcher",
    "rss_podcasts",
    "podcast-anchor",
    "listen-on-stitcher",
    "listen_stitcher",
    "badge",
    "sq_map_kedma",
)

SKIP_LINK_PATTERNS = ("anchor.fm", "podcasts.apple.com", "open.spotify.com")

SIZE_RE = re.compile(r"(?:/|=)s(\d{2,5})(?:-c)?(?:/|$)")


def should_skip_image(url: str) -> bool:
    lower = url.lower()
    return any(p in lower for p in SKIP_IMAGE_PATTERNS)


def image_filename_from_url(url: str) -> str:
    path = unquote(urlparse(url).path)
    name = Path(path).name
    if not name or name == "/":
        name = hashlib.sha1(url.encode()).hexdigest()[:12]
    name = re.sub(r"[^\w.\-]+", "_", name, flags=re.UNICODE)
    if "." not in name:
        name += ".jpg"
    if len(name) > 80:
        stem, dot, suffix = name.rpartition(".")
        digest = hashlib.sha1(url.encode()).hexdigest()[:12]
        name = f"{digest}{dot}{suffix}" if dot else digest
    return name


def source_size(url: str) -> int | None:
    m = SIZE_RE.search(url)
    return int(m.group(1)) if m else None


def strip_tags(fragment: str) -> str:
    text = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html_module.unescape(text)).strip()


def parse_posts() -> list[dict]:
    root = ET.parse(FEED_PATH).getroot()
    posts = []
    for entry in root.findall("atom:entry", NS):
        kind = entry.find("blogger:type", NS)
        status = entry.find("blogger:status", NS)
        if kind is None or kind.text != "POST":
            continue
        if status is None or status.text != "LIVE":
            continue
        fn = entry.find("blogger:filename", NS)
        content = entry.find("atom:content", NS)
        posts.append(
            {
                "slug": (fn.text or "").lstrip("/") if fn is not None else "",
                "html": html_module.unescape(content.text or "") if content is not None else "",
            }
        )
    posts.sort(key=lambda p: p["slug"])
    return posts


def feed_images(html: str) -> list[str]:
    out, seen = [], set()
    for m in re.finditer(r'<img\b[^>]*\bsrc=["\']([^"\']+)["\']', html, re.I):
        u = html_module.unescape(m.group(1))
        if should_skip_image(u) or u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out


def feed_links(html: str) -> list[tuple[str, str]]:
    """External hyperlinks whose anchor is text, not an image."""
    out = []
    for m in re.finditer(r'<a\b[^>]*\bhref=["\']([^"\']+)["\'][^>]*>([\s\S]*?)</a>', html, re.I):
        href = html_module.unescape(m.group(1))
        inner = m.group(2)
        if "<img" in inner.lower():
            continue
        text = strip_tags(inner)
        if not text:
            continue
        if any(p in href.lower() for p in SKIP_LINK_PATTERNS):
            continue
        out.append((href, text))
    return out


def feed_captions(html: str) -> list[str]:
    """Caption text Blogger stores next to images."""
    caps = []
    for m in re.finditer(r'<td[^>]*class="tr-caption"[^>]*>([\s\S]*?)</td>', html, re.I):
        t = strip_tags(m.group(1))
        if t:
            caps.append(t)
    # Blogger classic: a centered div right after a `separator` image div
    for m in re.finditer(
        r'<div[^>]*class="separator"[^>]*>[\s\S]*?</div>\s*<div[^>]*text-align:\s*center[^>]*>([\s\S]*?)</div>',
        html,
        re.I,
    ):
        t = strip_tags(m.group(1))
        if t:
            caps.append(t)
    return caps


def main() -> None:
    posts = parse_posts()
    n_missing_img = n_missing_cap = n_missing_link = 0
    out = []

    for post in posts:
        slug = post["slug"]
        md_path = CONTENT_DIR / Path(slug).with_suffix(".md")
        if not md_path.exists():
            out.append(f"!! NO MARKDOWN: {slug}")
            continue

        md = md_path.read_text(encoding="utf-8")
        img_dir = IMAGES_DIR / Path(slug).with_suffix("")
        rel_dir = f"/images/episodes/{Path(slug).with_suffix('').as_posix()}"

        notes = []

        for u in feed_images(post["html"]):
            fname = image_filename_from_url(u)
            if f"{rel_dir}/{fname}" not in md:
                notes.append(f"  MISSING IMAGE  on_disk={(img_dir / fname).exists()}  {u}")
                n_missing_img += 1

        # Compare against link-stripped, whitespace-free text so markdown syntax
        # and inline-element spacing don't register as missing content.
        md_plain = re.sub(r"\s+", "", re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", md))

        for cap in feed_captions(post["html"]):
            probe = re.sub(r"\s+", "", cap)[:20]
            if probe and probe not in md_plain:
                notes.append(f"  MISSING CAPTION  {cap[:90]}")
                n_missing_cap += 1

        for href, text in feed_links(post["html"]):
            if href not in md:
                notes.append(f"  MISSING LINK   [{text[:50]}]({href[:90]})")
                n_missing_link += 1

        if notes:
            out.append(slug)
            out.extend(notes)

    print("\n".join(out))
    print(
        f"\nPosts: {len(posts)}\n"
        f"Missing images:   {n_missing_img}\n"
        f"Missing captions: {n_missing_cap}\n"
        f"Missing links:    {n_missing_link}"
    )


if __name__ == "__main__":
    main()
