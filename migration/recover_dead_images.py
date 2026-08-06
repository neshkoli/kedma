#!/usr/bin/env python3
"""Recover episode images whose original host is gone, using the Wayback Machine.

Blogger posts embedded a handful of images hosted on third-party sites that have
since disappeared. This looks each one up in the Internet Archive and stores the
archived copy alongside the other episode images.
"""

from __future__ import annotations

import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rebuild_bodies import IMAGES_DIR, image_filename_from_url  # noqa: E402

# Images the rebuild could not fetch, mapped to the episode that uses them.
# `source` overrides the archive lookup when a file moved rather than vanished.
DEAD_IMAGES = {
    "2018/12/4": {
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Andalucia_in_Spain_(plus_Canarias)_(special_marker).svg/250px-Andalucia_in_Spain_(plus_Canarias)_(special_marker).svg.png",
        # Commons still hosts the file; only the generated thumbnail path changed.
        "source": "https://commons.wikimedia.org/wiki/Special:FilePath/Andalucia_in_Spain_(plus_Canarias)_(special_marker).svg?width=250",
    },
    "2019/08/19": {
        "url": "https://www.shvilimba.co.il/wp-content/uploads/2017/11/%D7%99%D7%95%D7%A1%D7%A4%D7%95%D7%A1.jpg",
    },
    "2019/09/20": {
        "url": "https://thejewishanswer.co.il/wp-content/uploads/2018/08/or-hashem-kereshkash.jpg",
    },
    "2025/07/72": {
        "url": "https://www.hoshvilim.com/wp-content/uploads/2018/02/2017-03-14-04.36.31-copy-e1518293465542.jpg",
    },
}

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "KedmaMigration/2.0 (+https://www.kedma.xyz)"})


def wayback_snapshot(url: str) -> str | None:
    response = SESSION.get(
        "https://archive.org/wayback/available", params={"url": url}, timeout=60
    )
    response.raise_for_status()
    snapshot = (response.json().get("archived_snapshots") or {}).get("closest")
    if not snapshot or not snapshot.get("available"):
        return None
    # `id_` asks the archive for the original bytes without its toolbar rewriting.
    return snapshot["url"].replace("/http", "id_/http", 1)


def main() -> None:
    recovered = failed = 0
    for episode, entry in DEAD_IMAGES.items():
        url = entry["url"]
        dest_dir = IMAGES_DIR / episode
        dest = dest_dir / image_filename_from_url(url)
        if dest.exists():
            print(f"  already present: {dest.name}")
            continue

        try:
            source = entry.get("source") or wayback_snapshot(url)
            if not source:
                raise ValueError("no snapshot in the Wayback Machine")
            image = SESSION.get(source, timeout=120)
            image.raise_for_status()
            if not image.headers.get("content-type", "").startswith("image/"):
                raise ValueError(f"not an image ({image.headers.get('content-type')})")
        except (requests.RequestException, ValueError) as exc:
            print(f"  FAILED {episode}: {exc}", file=sys.stderr)
            failed += 1
            continue

        dest_dir.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(image.content)
        print(f"  recovered {episode}/{dest.name} ({len(image.content)} bytes)")
        recovered += 1

    print(f"\nRecovered: {recovered}  Failed: {failed}")


if __name__ == "__main__":
    main()
