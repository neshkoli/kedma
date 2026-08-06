#!/usr/bin/env python3
"""Rebuild episode markdown bodies from the Blogger Atom export.

The first migration lost content: image captions and hyperlinks were dropped,
a few images were never downloaded, and Blogger thumbnails were saved instead
of the full-resolution originals the export links to. This regenerates every
body from the feed while preserving the frontmatter that was enriched later.

Usage:
    python3 migration/rebuild_bodies.py [--dry-run] [--skip-images] [--only SLUG]
"""

from __future__ import annotations

import argparse
import hashlib
import html as html_module
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import unquote, urlparse

import html2text
import requests
import yaml
from bs4 import BeautifulSoup, Comment, NavigableString

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

PODCAST_HOSTS = (
    "anchor.fm",
    "podcasts.apple.com",
    "open.spotify.com",
    "podcasters.spotify.com",
)

YOUTUBE_RE = re.compile(r"youtube\.com/embed/([^/?&\"'#]+)", re.I)

# Frontmatter key order to emit; unknown keys are appended in their original order.
KEY_ORDER = [
    "title",
    "date",
    "slug",
    "tags",
    "image",
    "imageCaption",
    "audioUrl",
    "audioFile",
    "duration",
    "spotify",
    "period",
    "periodName",
]

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "KedmaMigration/2.0 (+https://www.kedma.xyz)"})

# Set from --reuse-existing: trust files already on disk instead of refetching.
REUSE_EXISTING = False


# --------------------------------------------------------------------------- feed


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
        filename = entry.find("blogger:filename", NS)
        content = entry.find("atom:content", NS)
        posts.append(
            {
                "slug": (filename.text or "").lstrip("/") if filename is not None else "",
                "html": html_module.unescape(content.text or "") if content is not None else "",
            }
        )
    posts.sort(key=lambda post: post["slug"])
    return posts


# --------------------------------------------------------------------------- images


def should_skip_image(url: str) -> bool:
    lower = url.lower()
    return any(pattern in lower for pattern in SKIP_IMAGE_PATTERNS)


def image_filename_from_url(url: str) -> str:
    """Filename the original migration derived from a URL, kept for stability."""
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


def resize_blogger_url(url: str, size: int) -> str | None:
    if re.search(r"/s\d{1,5}(?:-c)?/", url):
        return re.sub(r"/s\d{1,5}(?:-c)?/", f"/s{size}/", url, count=1)
    if re.search(r"=s\d{1,5}(?:-c)?$", url):
        return re.sub(r"=s\d{1,5}(?:-c)?$", f"=s{size}", url)
    if re.search(r"=w\d+-h\d+[^/]*$", url):
        return re.sub(r"=w\d+-h\d+[^/]*$", f"=s{size}", url)
    if "/img/a/" in url and "=" not in url.rsplit("/", 1)[-1]:
        return f"{url}=s{size}"
    return None


def resolution_candidates(src: str, href: str | None, node) -> list[str]:
    """Best-to-worst URLs to try, preferring the full-resolution original."""
    candidates: list[str] = []

    def add(url: str | None) -> None:
        if url and url not in candidates:
            candidates.append(url)

    if "googleusercontent" in src:
        try:
            width = int(node.get("data-original-width") or 0)
            height = int(node.get("data-original-height") or 0)
        except ValueError:
            width = height = 0
        largest = max(width, height)
        if largest > 0:
            add(resize_blogger_url(src, largest))
        add(resize_blogger_url(src, 1600))

    if href and "googleusercontent" in href:
        add(href)

    add(src)
    return candidates


def fetch(url: str) -> bytes:
    response = SESSION.get(url, timeout=60)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "")
    if not content_type.startswith("image/"):
        raise ValueError(f"not an image ({content_type})")
    return response.content


def download_best(src: str, href: str | None, node, dest_dir: Path, stats: dict) -> str | None:
    """Download the highest-resolution variant available, return its public path."""
    filename = image_filename_from_url(src)
    dest = dest_dir / filename
    relative = f"/images/episodes/{dest_dir.relative_to(IMAGES_DIR).as_posix()}/{filename}"

    if REUSE_EXISTING and dest.exists():
        return relative

    existing = dest.read_bytes() if dest.exists() else None
    fetched = None
    for candidate in resolution_candidates(src, href, node):
        try:
            fetched = fetch(candidate)
            break
        except (requests.RequestException, ValueError) as exc:
            print(f"    warn: {candidate[:80]} -> {exc}", file=sys.stderr)

    # A "higher resolution" URL can still serve a smaller file; never downgrade.
    best = existing
    if fetched is not None and (existing is None or len(fetched) > len(existing)):
        best = fetched

    if best is None:
        stats["failed"] += 1
        print(f"    ERROR: could not download {src[:100]}", file=sys.stderr)
        return None

    if best != existing:
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(best)
        stats["upgraded" if existing else "downloaded"] += 1

    return relative


# --------------------------------------------------------------------------- html


def make_converter() -> html2text.HTML2Text:
    converter = html2text.HTML2Text()
    converter.body_width = 0
    converter.ignore_links = False
    converter.ignore_images = False
    converter.single_line_break = False
    converter.unicode_snob = True
    converter.wrap_links = False
    return converter


def to_markdown(html: str) -> str:
    return make_converter().handle(html).strip()


def inline_text(node) -> str:
    """Caption text without markup, safe to use as a markdown alt attribute."""
    if node is None:
        return ""
    text = re.sub(r"\s+", " ", node.get_text()).strip()
    return text.replace("[", "(").replace("]", ")")


def is_centered(node) -> bool:
    style = (node.get("style") or "").replace(" ", "").lower()
    return "text-align:center" in style or (node.get("align") or "").lower() == "center"


def is_side_aligned(node) -> bool:
    style = (node.get("style") or "").replace(" ", "").lower()
    return "text-align:right" in style or "text-align:left" in style


def is_attached(node, soup) -> bool:
    current = node
    while current is not None:
        if current is soup:
            return True
        current = current.parent
    return False


def following_caption(element):
    """The centered block Blogger places directly beneath an image, if any."""
    for sibling in element.next_siblings:
        if isinstance(sibling, NavigableString):
            if sibling.strip():
                return None
            continue
        if sibling.name == "br":
            continue
        if sibling.find(["img", "iframe"]) is not None:
            return None
        if not sibling.get_text(strip=True):
            continue
        if sibling.name not in ("div", "p", "span", "td"):
            return None
        return sibling if is_centered(sibling) else None
    return None


def locate_unit(node):
    """The element to replace for a media node, plus its caption element."""
    table = node.find_parent("table", class_="tr-caption-container")
    if table is not None:
        return table, table.find("td", class_="tr-caption")

    separator = node.find_parent("div", class_="separator")
    if separator is not None:
        return separator, following_caption(separator)

    anchor = node.find_parent("a")
    container = anchor if anchor is not None else node
    return container, following_caption(container)


def inline_markdown(node) -> str:
    """Caption converted to markdown so its hyperlinks survive."""
    if node is None:
        return ""
    return re.sub(r"\s+", " ", to_markdown(node.decode_contents())).strip()


def hoist_media_from_captions(soup) -> None:
    """Lift images and videos that Blogger nested inside a caption cell.

    A few posts have malformed tables where later images ended up inside the
    first caption's <td>. Left alone, replacing the table would delete them.
    """
    for cell in soup.find_all("td", class_="tr-caption"):
        media = cell.find_all(["img", "iframe"])
        if not media:
            continue
        anchor = cell.find_parent("table") or cell
        for node in media:
            block = node.find_parent("a") or node
            anchor.insert_after(block.extract())
            anchor = block


def detach_side_content(caption):
    """Pull body text that Blogger nested inside a caption back into the flow."""
    if caption is None:
        return []
    return [
        child.extract()
        for child in caption.find_all(["div", "p"])
        if is_side_aligned(child) and child.get_text(strip=True)
    ]


# --------------------------------------------------------------------------- build


def build_body(post: dict, image_dir: Path, stats: dict, skip_images: bool) -> tuple[str, dict]:
    soup = BeautifulSoup(post["html"], "html.parser")

    for iframe in soup.find_all("iframe"):
        src = iframe.get("src") or ""
        if any(host in src for host in PODCAST_HOSTS):
            iframe.decompose()

    for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
        comment.extract()

    hoist_media_from_captions(soup)

    units: list[str] = []
    hero: dict = {}

    for node in list(soup.find_all(["img", "iframe"])):
        if not is_attached(node, soup):
            continue

        if node.name == "iframe":
            match = YOUTUBE_RE.search(node.get("src") or "")
            if not match:
                continue
            target = f"https://www.youtube.com/embed/{match.group(1)}"
            local = None
        else:
            src = node.get("src") or ""
            if not src or should_skip_image(src):
                node.decompose()
                continue
            target = None
            local = src

        container, caption = locate_unit(node)
        leftovers = detach_side_content(caption)
        caption_text = inline_text(caption)
        caption_links = [a["href"] for a in caption.find_all("a", href=True)] if caption else []

        anchor = node.find_parent("a")
        href = anchor.get("href") if anchor is not None else None

        if node.name == "img":
            is_hero = not hero and "googleusercontent" in local
            if skip_images:
                public = local
            else:
                public = download_best(local, href, node, image_dir, stats)
            if public is None:
                public = local

            if is_hero:
                # The hero renders from frontmatter, so a plain caption moves
                # there. A caption carrying links stays in the body instead,
                # which is the only way to keep every link it holds.
                hero = {"image": public, "caption": "" if caption_links else caption_text}
                markdown = inline_markdown(caption) if caption_links else None
            else:
                link = href or (caption_links[0] if caption_links else None)
                markdown = f"![{caption_text}]({public})"
                if link:
                    markdown = f"[{markdown}]({link})"
                if caption_links and link != caption_links[0]:
                    markdown += f"\n\n[{caption_text}]({caption_links[0]})"
                    stats["caption_links_kept"] += 1
        else:
            markdown = f"![{caption_text}]({target})"

        if markdown is None:
            placeholder = None
            container.decompose()
        else:
            token = f"KEDMAMEDIA{len(units)}ZZ"
            units.append(markdown)
            placeholder = soup.new_tag("p")
            placeholder.string = token
            container.replace_with(placeholder)

        if placeholder is not None:
            if caption is not None:
                caption.decompose()
            for leftover in reversed(leftovers):
                placeholder.insert_after(leftover)
        elif caption is not None:
            # Hero image: the caption moves to frontmatter, but any body text
            # Blogger nested inside it has to stay where it was.
            if leftovers:
                caption.replace_with(*leftovers)
            else:
                caption.decompose()

    body = to_markdown(str(soup))

    for index, markdown in enumerate(units):
        body = body.replace(f"KEDMAMEDIA{index}ZZ", f"\n\n{markdown}\n\n")

    # Trailing double spaces are markdown hard line breaks; only drop stray runs.
    body = re.sub(r"^[ \t]+$", "", body, flags=re.M)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    return body, hero


# --------------------------------------------------------------------------- write


def load_frontmatter(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    match = re.match(r"^---\n([\s\S]*?)\n---\n", raw)
    if not match:
        raise ValueError(f"no frontmatter in {path}")
    return yaml.safe_load(match.group(1)) or {}


class QuotedStr(str):
    """A string that must stay quoted so YAML never reads it as a date or time."""


yaml.add_representer(
    QuotedStr,
    lambda dumper, data: dumper.represent_scalar("tag:yaml.org,2002:str", str(data), style="'"),
)

AMBIGUOUS_KEYS = {"date", "duration"}


def dump_frontmatter(data: dict) -> str:
    ordered = {key: data[key] for key in KEY_ORDER if key in data and data[key] not in (None, "")}
    for key, value in data.items():
        if key not in ordered and value not in (None, ""):
            ordered[key] = value
    for key in AMBIGUOUS_KEYS:
        if isinstance(ordered.get(key), str):
            ordered[key] = QuotedStr(ordered[key])
    return yaml.dump(
        ordered, allow_unicode=True, default_flow_style=False, sort_keys=False
    ).strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-images", action="store_true")
    parser.add_argument("--only", help="process a single slug, e.g. 2018/12/3.html")
    parser.add_argument(
        "--reuse-existing",
        action="store_true",
        help="keep images already on disk instead of refetching them",
    )
    args = parser.parse_args()

    global REUSE_EXISTING
    REUSE_EXISTING = args.reuse_existing

    stats = {"downloaded": 0, "upgraded": 0, "failed": 0, "caption_links_kept": 0}
    written = 0

    for post in parse_posts():
        slug = post["slug"]
        if args.only and slug != args.only:
            continue

        md_path = CONTENT_DIR / Path(slug).with_suffix(".md")
        if not md_path.exists():
            print(f"skip (no markdown): {slug}", file=sys.stderr)
            continue

        image_dir = IMAGES_DIR / Path(slug).with_suffix("")
        body, hero = build_body(post, image_dir, stats, args.skip_images)

        frontmatter = load_frontmatter(md_path)
        previous_image = frontmatter.get("image")
        # Captions are derived fresh from the feed on every run.
        frontmatter.pop("imageCaption", None)
        frontmatter.pop("imageCaptionUrl", None)
        if hero.get("image", "").startswith("/"):
            frontmatter["image"] = hero["image"]
        if hero.get("caption"):
            frontmatter["imageCaption"] = hero["caption"]
        if previous_image and hero.get("image", "").startswith("/") and previous_image != hero["image"]:
            print(f"  note: hero path changed {previous_image} -> {hero['image']}")

        output = f"---\n{dump_frontmatter(frontmatter)}\n---\n\n{body}\n"
        if args.dry_run:
            print(f"--- {slug} ---\n{output}")
        else:
            md_path.write_text(output, encoding="utf-8")
        written += 1
        print(f"  rebuilt {slug}")

    print(
        f"\nEpisodes rebuilt: {written}\n"
        f"Images downloaded: {stats['downloaded']}\n"
        f"Images upgraded:   {stats['upgraded']}\n"
        f"Image failures:    {stats['failed']}\n"
        f"Caption links kept separately: {stats['caption_links_kept']}"
    )


if __name__ == "__main__":
    main()
