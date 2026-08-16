#!/usr/bin/env python3

"""Generate lightweight WebP previews for the static gallery.

The original files remain untouched and continue to power the lightbox. The
main gallery and 3D museum use these previews to avoid downloading hundreds of
megabytes before they can become interactive.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from PIL import Image, ImageOps


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_GALLERY = REPO_ROOT / "images" / "gallery"
DEFAULT_OUTPUT = REPO_ROOT / "images" / "gallery-preview"
DEFAULT_MAX_EDGE = 2048
DEFAULT_QUALITY = 82


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate WebP previews and images/gallery-preview/index.json",
    )
    parser.add_argument("--gallery", type=Path, default=DEFAULT_GALLERY)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--max-edge", type=int, default=DEFAULT_MAX_EDGE)
    parser.add_argument("--quality", type=int, default=DEFAULT_QUALITY)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json_atomically(path: Path, value: object) -> None:
    contents = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    with NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=path.parent,
        prefix=".index.",
        suffix=".tmp",
        delete=False,
    ) as temporary:
        temporary.write(contents)
        temporary_path = Path(temporary.name)
    os.replace(temporary_path, path)


def render_preview(source: Path, destination: Path, max_edge: int, quality: int) -> tuple[int, int]:
    with Image.open(source) as opened:
        if getattr(opened, "is_animated", False):
            opened.seek(0)
        image = ImageOps.exif_transpose(opened)
        image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        image.load()
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")

        with NamedTemporaryFile(
            "wb",
            dir=destination.parent,
            prefix=f".{destination.stem}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)

        try:
            image.save(temporary_path, format="WEBP", quality=quality, method=6)
            os.replace(temporary_path, destination)
        finally:
            temporary_path.unlink(missing_ok=True)

        return image.width, image.height


def main() -> None:
    args = parse_args()
    gallery = args.gallery.resolve()
    output = args.output.resolve()
    index_path = gallery / "index.json"

    if args.max_edge < 256:
        raise SystemExit("--max-edge must be at least 256")
    if not 1 <= args.quality <= 100:
        raise SystemExit("--quality must be between 1 and 100")

    filenames = json.loads(index_path.read_text(encoding="utf-8"))
    if not isinstance(filenames, list) or not all(isinstance(name, str) for name in filenames):
        raise SystemExit(f"Invalid gallery index: {index_path}")

    output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / "index.json"
    try:
        old_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        old_items = old_manifest.get("items", {}) if isinstance(old_manifest, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        old_items = {}

    items: dict[str, dict[str, object]] = {}
    generated = 0
    reused = 0

    for filename in filenames:
        if Path(filename).name != filename:
            raise SystemExit(f"Unsafe gallery filename: {filename}")
        source = gallery / filename
        if not source.is_file():
            raise SystemExit(f"Missing gallery image: {source}")

        source_hash = sha256(source)
        preview_name = f"{source.stem}.webp"
        destination = output / preview_name
        previous = old_items.get(filename, {}) if isinstance(old_items, dict) else {}
        reusable = (
            destination.is_file()
            and isinstance(previous, dict)
            and previous.get("sourceHash") == source_hash
            and previous.get("maxEdge") == args.max_edge
            and previous.get("quality") == args.quality
        )

        if reusable:
            width = int(previous["width"])
            height = int(previous["height"])
            reused += 1
        else:
            width, height = render_preview(source, destination, args.max_edge, args.quality)
            generated += 1

        items[filename] = {
            "preview": preview_name,
            "sourceBytes": source.stat().st_size,
            "sourceHash": source_hash,
            "previewBytes": destination.stat().st_size,
            "width": width,
            "height": height,
            "maxEdge": args.max_edge,
            "quality": args.quality,
        }

    write_json_atomically(manifest_path, {"version": 1, "items": items})
    total_bytes = sum(int(item["previewBytes"]) for item in items.values())
    print(
        f"[gallery-preview] {len(items)} previews ready "
        f"({generated} generated, {reused} reused, {total_bytes / 1024 / 1024:.2f} MiB total)"
    )


if __name__ == "__main__":
    main()
