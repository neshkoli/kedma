#!/usr/bin/env python3
"""Migrate Kedma episodes from Google Takeout (Blogger Atom feed) to MDX."""

from __future__ import annotations

import argparse
import csv
import hashlib
import html as html_module
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import unquote, urlparse

import html2text
import requests
import yaml

ROOT = Path(__file__).resolve().parent.parent
FEED_PATH = ROOT / "Takeout/Blogger/Blogs/קדמא Kedma/feed.atom"
AUDIO_DIR = ROOT / "mp3"
CONTENT_DIR = ROOT / "src/content/episodes"
IMAGES_DIR = ROOT / "public/images/episodes"
MIGRATION_DIR = Path(__file__).resolve().parent
PERIOD_MAP_PATH = MIGRATION_DIR / "period-map.csv"
AUDIO_MAP_PATH = MIGRATION_DIR / "audio-map.csv"
COMMENTS_EXPORT_PATH = MIGRATION_DIR / "comments-export.json"
REPORT_PATH = MIGRATION_DIR / "report.txt"

AUDIO_BASE_URL = "https://audio.kedma.xyz/episodes"
R2_KEY_PREFIX = "episodes"

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "blogger": "http://schemas.google.com/blogger/2018",
}

PODCAST_EMBED_RE = re.compile(
    r"<iframe\b[^>]*\bsrc=[\"'](?:https?:)?//(?:"
    r"anchor\.fm|embed\.podcasts\.apple\.com|open\.spotify\.com"
    r")[^\"']*[\"'][^>]*>.*?</iframe>",
    re.IGNORECASE | re.DOTALL,
)
YOUTUBE_IFRAME_RE = re.compile(
    r"<iframe\b[^>]*\bsrc=[\"'][^\"']*youtube\.com/embed/[^\"']*[\"'][^>]*>.*?</iframe>",
    re.IGNORECASE | re.DOTALL,
)
EPISODE_NUM_RE = re.compile(r"פרק\s*(\d+)")
AUDIO_FILE_RE = re.compile(r"^(\d+)")
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

SESSION = requests.Session()
SESSION.headers.update(
    {"User-Agent": "KedmaMigration/1.0 (+https://www.kedma.xyz)"}
)


def parse_feed(path: Path) -> ET.Element:
    return ET.parse(path).getroot()


def entry_type(entry: ET.Element) -> str | None:
    node = entry.find("blogger:type", NS)
    return node.text if node is not None else None


def entry_status(entry: ET.Element) -> str | None:
    node = entry.find("blogger:status", NS)
    return node.text if node is not None else None


def entry_text(entry: ET.Element, tag: str) -> str:
    node = entry.find(f"atom:{tag}", NS)
    return (node.text or "").strip() if node is not None else ""


def entry_blogger(entry: ET.Element, tag: str) -> str:
    node = entry.find(f"blogger:{tag}", NS)
    return (node.text or "").strip() if node is not None else ""


def extract_episode_number(title: str) -> int | None:
    match = EPISODE_NUM_RE.search(title)
    return int(match.group(1)) if match else None


def normalize_slug(filename: str) -> str:
    return filename.lstrip("/")


def slug_to_r2_path(slug: str, extension: str) -> str:
    base = slug.removesuffix(".html")
    return f"{R2_KEY_PREFIX}/{base}{extension}"


def build_audio_index(audio_dir: Path) -> dict[int, Path]:
    index: dict[int, Path] = {}
    if not audio_dir.exists():
        return index

    for path in sorted(audio_dir.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".mp3", ".m4a", ".wav"}:
            continue
        match = AUDIO_FILE_RE.match(path.name)
        if match:
            index[int(match.group(1))] = path
    return index


def load_period_map(path: Path) -> dict[str, dict[str, str | int]]:
    mapping: dict[str, dict[str, str | int]] = {}
    if not path.exists():
        return mapping

    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            slug = (row.get("slug") or "").strip()
            if not slug:
                continue
            period_raw = (row.get("period") or "").strip()
            mapping[slug] = {
                "period": int(period_raw) if period_raw.isdigit() else period_raw,
                "periodName": (row.get("periodName") or "").strip(),
            }
    return mapping


def should_skip_image(url: str) -> bool:
    lower = url.lower()
    return any(pattern in lower for pattern in SKIP_IMAGE_PATTERNS)


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


def download_image(url: str, dest_dir: Path, cache: dict[str, str]) -> str | None:
    if url in cache:
        return cache[url]
    if should_skip_image(url):
        return None

    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = image_filename_from_url(url)
    dest = dest_dir / filename
    relative = dest.relative_to(IMAGES_DIR)
    public_path = f"/images/episodes/{relative.as_posix()}"

    if dest.exists():
        cache[url] = public_path
        return public_path

    try:
        response = SESSION.get(url, timeout=60)
        response.raise_for_status()
        dest.write_bytes(response.content)
        cache[url] = public_path
        return public_path
    except requests.RequestException as exc:
        print(f"  warning: failed to download image {url}: {exc}", file=sys.stderr)
        return None


def extract_cover_image(html: str) -> str | None:
    for match in re.finditer(r"<img\b[^>]*\bsrc=[\"']([^\"']+)[\"']", html, re.I):
        url = html_module.unescape(match.group(1))
        if "googleusercontent.com" in url and not should_skip_image(url):
            return url
    return None


def rewrite_images(html: str, image_dir: Path, cache: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        url = html_module.unescape(match.group(2))
        local = download_image(url, image_dir, cache)
        if local:
            return f"{match.group(1)}{local}{match.group(3)}"
        return match.group(0)

    return re.sub(
        r'(<img\b[^>]*\bsrc=["\'])([^"\']+)(["\'])',
        replace,
        html,
        flags=re.I,
    )


def preserve_youtube_embeds(html: str) -> tuple[str, dict[str, str]]:
    placeholders: dict[str, str] = {}

    def stash(match: re.Match[str]) -> str:
        key = f"KEDMA_YOUTUBE_{len(placeholders)}"
        placeholders[key] = match.group(0)
        return key

    cleaned = YOUTUBE_IFRAME_RE.sub(stash, html)
    return cleaned, placeholders


def restore_youtube_embeds(markdown: str, placeholders: dict[str, str]) -> str:
    restored = markdown
    for key, iframe in placeholders.items():
        restored = restored.replace(key, f"\n\n{iframe}\n\n")
    return restored


def rewrite_cached_urls(text: str, cache: dict[str, str]) -> str:
    updated = text
    for remote, local in sorted(cache.items(), key=lambda item: len(item[0]), reverse=True):
        updated = updated.replace(remote, local)
    return updated


def html_to_markdown(html: str) -> str:
    cleaned = PODCAST_EMBED_RE.sub("", html)
    cleaned, placeholders = preserve_youtube_embeds(cleaned)

    converter = html2text.HTML2Text()
    converter.body_width = 0
    converter.ignore_links = False
    converter.ignore_images = False
    converter.single_line_break = False
    converter.unicode_snob = True
    converter.wrap_links = False

    markdown = converter.handle(cleaned).strip()
    markdown = restore_youtube_embeds(markdown, placeholders)
    markdown = re.sub(r"\n{3,}", "\n\n", markdown)
    return markdown


def parse_posts_and_comments(feed: ET.Element) -> tuple[list[dict], dict[str, list[dict]], dict[str, str]]:
    posts: list[dict] = []
    comments_by_parent: dict[str, list[dict]] = {}
    post_ids: dict[str, str] = {}

    for entry in feed.findall("atom:entry", NS):
        kind = entry_type(entry)
        status = entry_status(entry)

        if kind == "POST" and status == "LIVE":
            post_id = entry_text(entry, "id")
            slug = normalize_slug(entry_blogger(entry, "filename"))
            title = entry_text(entry, "title")
            published = entry_text(entry, "published")[:10]
            content_html = html_module.unescape(entry_text(entry, "content"))
            tags = [
                cat.attrib.get("term", "").strip()
                for cat in entry.findall("atom:category", NS)
                if cat.attrib.get("term")
            ]

            posts.append(
                {
                    "id": post_id,
                    "slug": slug,
                    "title": title,
                    "date": published,
                    "content_html": content_html,
                    "tags": tags,
                    "episode": extract_episode_number(title),
                }
            )
            post_ids[post_id] = slug
            continue

        if kind == "COMMENT" and status == "LIVE":
            parent = entry_blogger(entry, "parent")
            author_node = entry.find("atom:author/atom:name", NS)
            author = (author_node.text or "").strip() if author_node is not None else ""
            comments_by_parent.setdefault(parent, []).append(
                {
                    "author": author or "אנונימי",
                    "content": html_module.unescape(entry_text(entry, "content")),
                    "published": entry_text(entry, "published"),
                }
            )

    posts.sort(key=lambda item: item["date"])
    return posts, comments_by_parent, post_ids


def write_audio_map(rows: list[dict]) -> None:
    with AUDIO_MAP_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=["slug", "episode", "local_file", "r2_key", "audioUrl"]
        )
        writer.writeheader()
        writer.writerows(rows)


def write_comments_export(
    posts: list[dict],
    comments_by_parent: dict[str, list[dict]],
) -> None:
    export: dict[str, list[dict]] = {}
    for post in posts:
        comments = comments_by_parent.get(post["id"], [])
        if comments:
            export[post["slug"]] = comments

    COMMENTS_EXPORT_PATH.write_text(
        json.dumps(export, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def write_mdx(post: dict, body: str, frontmatter: dict) -> Path:
    slug = post["slug"]
    output_path = CONTENT_DIR / Path(slug).with_suffix(".mdx")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    yaml_block = yaml.dump(
        frontmatter,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
    ).strip()

    output_path.write_text(f"---\n{yaml_block}\n---\n\n{body}\n", encoding="utf-8")
    return output_path


def migrate(skip_images: bool = False) -> None:
    if not FEED_PATH.exists():
        raise SystemExit(f"Feed not found: {FEED_PATH}")

    audio_index = build_audio_index(AUDIO_DIR)
    period_map = load_period_map(PERIOD_MAP_PATH)
    posts, comments_by_parent, _ = parse_posts_and_comments(parse_feed(FEED_PATH))

    audio_rows: list[dict] = []
    missing_audio: list[str] = []
    image_cache: dict[str, str] = {}
    written = 0

    for post in posts:
        slug = post["slug"]
        episode = post["episode"]
        image_dir = IMAGES_DIR / Path(slug).with_suffix("")

        html = post["content_html"]
        if not skip_images:
            html = rewrite_images(html, image_dir, image_cache)

        cover_url = extract_cover_image(post["content_html"])
        cover_image = None
        if cover_url and not skip_images:
            cover_image = download_image(cover_url, image_dir, image_cache)
        elif cover_url and skip_images:
            cover_image = cover_url

        body = html_to_markdown(html)
        if image_cache:
            body = rewrite_cached_urls(body, image_cache)

        frontmatter: dict = {
            "title": post["title"],
            "date": post["date"],
            "slug": slug,
            "tags": post["tags"],
        }

        if cover_image:
            frontmatter["image"] = cover_image

        if episode is not None and episode in audio_index:
            audio_path = audio_index[episode]
            extension = audio_path.suffix.lower()
            r2_key = slug_to_r2_path(slug, extension)
            audio_url = f"{AUDIO_BASE_URL}/{slug.removesuffix('.html')}{extension}"
            frontmatter["audioUrl"] = audio_url
            frontmatter["audioFile"] = audio_path.name
            audio_rows.append(
                {
                    "slug": slug,
                    "episode": episode,
                    "local_file": str(audio_path.relative_to(ROOT)),
                    "r2_key": r2_key,
                    "audioUrl": audio_url,
                }
            )
        elif episode is not None:
            missing_audio.append(f"ep {episode}: {slug} ({post['title']})")

        period = period_map.get(slug)
        if period:
            if period.get("period"):
                frontmatter["period"] = period["period"]
            if period.get("periodName"):
                frontmatter["periodName"] = period["periodName"]

        write_mdx(post, body, frontmatter)
        written += 1
        print(f"  wrote {slug}")

    write_audio_map(audio_rows)
    write_comments_export(posts, comments_by_parent)

    report_lines = [
        f"Episodes migrated: {written}",
        f"Audio files matched: {len(audio_rows)}",
        f"Audio files missing: {len(missing_audio)}",
        f"Comments exported: {sum(len(v) for v in comments_by_parent.values())}",
        "",
    ]
    if missing_audio:
        report_lines.append("Missing audio:")
        report_lines.extend(f"  - {line}" for line in missing_audio)

    REPORT_PATH.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    print()
    print(REPORT_PATH.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate Blogger Takeout to MDX")
    parser.add_argument(
        "--skip-images",
        action="store_true",
        help="Skip downloading images (faster dry run)",
    )
    args = parser.parse_args()
    migrate(skip_images=args.skip_images)


if __name__ == "__main__":
    main()
