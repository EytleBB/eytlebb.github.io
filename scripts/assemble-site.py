#!/usr/bin/env python3
"""Compose website code and pinned content into a NEW directory outside the repos."""
from __future__ import annotations

import argparse
from datetime import date
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile

SITE_ROOT = Path(__file__).resolve().parents[1]
CONTENT_PATHS = {
    'patchlog': ('logs',),
    'museum': ('images/gallery', 'images/gallery-preview', 'audio/museum.mp3'),
}
WEB_IMAGE = re.compile(r'0x[0-9a-fA-F]{4}\.(?:jpg|jpeg|png|gif|webp)', re.I)


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_content(root):
    """Validate the exact data contract consumed by the site and guestbook API."""
    logs = root / 'logs'
    dates = read_json(logs / 'index.json')
    require(isinstance(dates, list) and all(isinstance(d, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', d) for d in dates), 'Invalid log index')
    for value in dates:
        date.fromisoformat(value)
    actual_dates = sorted((p.stem for p in logs.glob('*.txt') if re.fullmatch(r'\d{4}-\d{2}-\d{2}', p.stem)), reverse=True)
    require(dates == actual_dates, 'Log index must include every dated article exactly once, newest first')
    for value in dates:
        require((logs / f'{value}.txt').is_file(), f'Missing log: {value}')

    gallery = root / 'images/gallery'
    previews = root / 'images/gallery-preview'
    files = read_json(gallery / 'index.json')
    require(isinstance(files, list) and all(isinstance(f, str) and WEB_IMAGE.fullmatch(f) for f in files), 'Invalid gallery index')
    require(len(files) == len(set(files)), 'Duplicate gallery filename')
    actual_images = {p.name for p in gallery.iterdir() if p.is_file() and p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.gif', '.webp'}}
    require(set(files) == actual_images, 'Gallery index does not match the available web images')
    manifest = read_json(previews / 'index.json')
    require(isinstance(manifest, dict) and manifest.get('version') == 1 and isinstance(manifest.get('items'), dict), 'Invalid preview manifest')
    require(set(manifest['items']) == set(files), 'Every exhibited image must have a preview')
    for filename in files:
        item = manifest['items'][filename]
        require(isinstance(item, dict), f'Invalid preview metadata: {filename}')
        name = item.get('preview')
        require(isinstance(name, str) and re.fullmatch(r'0x[0-9a-fA-F]{4}\.webp', name), f'Unsafe preview name: {filename}')
        original, preview = gallery / filename, previews / name
        require(preview.is_file(), f'Missing preview: {filename}')
        require(item.get('sourceHash') == sha256(original), f'Original hash mismatch: {filename}')
        require(item.get('sourceBytes') == original.stat().st_size, f'Original size mismatch: {filename}')
        require(item.get('previewBytes') == preview.stat().st_size, f'Preview size mismatch: {filename}')
        width, height, edge = (item.get(k) for k in ('width', 'height', 'maxEdge'))
        require(all(type(v) is int and v > 0 for v in (width, height, edge)) and max(width, height) <= edge, f'Invalid preview dimensions: {filename}')
    music = root / 'audio/museum.mp3'
    require(music.is_file() and music.stat().st_size > 0, 'Missing exhibition music')
    return {'logs': len(dates), 'originals': len([p for p in gallery.iterdir() if p.is_file() and p.name != 'index.json']), 'previews': len(files)}


def export_content(repository, commit, paths, destination):
    """Export only tracked public data at an immutable commit, including from bare repos."""
    resolved = subprocess.check_output(['git', '-C', str(repository), 'rev-parse', '--verify', commit + '^{commit}'], text=True).strip()
    require(resolved == commit, f'Content commit did not resolve exactly: {commit}')
    with tempfile.TemporaryFile() as archive:
        subprocess.run(['git', '-C', str(repository), 'archive', '--format=tar', commit, '--', *paths], stdout=archive, check=True)
        archive.seek(0)
        with tarfile.open(fileobj=archive) as contents:
            for member in contents:
                relative = PurePosixPath(member.name)
                require(not relative.is_absolute() and '..' not in relative.parts, f'Unsafe archive path: {member.name}')
                require(member.isdir() or member.isfile(), f'Content must be regular files, not links: {member.name}')
                target = destination.joinpath(*relative.parts)
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with contents.extractfile(member) as source, target.open('wb') as output:
                        shutil.copyfileobj(source, output)
                    target.chmod(0o644)


def assemble(site, repositories, output):
    site, output = site.resolve(), output.resolve()
    repositories = {key: value.resolve() for key, value in repositories.items()}
    require(not output.exists(), 'Output must be a new directory; existing previews/releases are never overwritten')
    for root in (site, *repositories.values()):
        require(not output.is_relative_to(root) and not root.is_relative_to(output), 'Output must be outside the source repositories')
    lock = read_json(site / 'content-sources.json')
    require(lock.get('version') == 1 and set(lock.get('repositories', {})) == set(CONTENT_PATHS), 'Invalid content-sources.json')
    for key, entry in lock['repositories'].items():
        require(isinstance(entry.get('commit'), str) and re.fullmatch(r'[0-9a-f]{40}', entry['commit']), f'Pin a full commit SHA for {key}')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.eytle-assemble-', dir=output.parent) as temporary:
        temporary = Path(temporary)
        content = temporary / 'content'
        content.mkdir()
        for key, paths in CONTENT_PATHS.items():
            export_content(repositories[key], lock['repositories'][key]['commit'], paths, content)
        counts = validate_content(content)
        public = temporary / 'public'
        public.mkdir()
        # Source code can be a local checkout or an exported release tree. Never
        # pick up stale content still present in a pre-migration working directory.
        excluded = ['--exclude=/logs/', '--exclude=/images/gallery/', '--exclude=/images/gallery-preview/', '--exclude=/audio/museum.mp3']
        subprocess.run(['rsync', '-a', '--exclude-from=' + str(site / 'scripts/deploy-excludes.txt'), *excluded, str(site) + '/', str(public) + '/'], check=True)
        for paths in CONTENT_PATHS.values():
            for relative in paths:
                source, target = content / relative, public / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                if source.is_dir():
                    shutil.copytree(source, target)
                else:
                    shutil.copy2(source, target)
        public.rename(output)
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site-root', type=Path, default=SITE_ROOT)
    parser.add_argument('--logs-repo', type=Path, default=SITE_ROOT.parent / 'Eytle-Patch-Log')
    parser.add_argument('--museum-repo', type=Path, default=SITE_ROOT.parent / 'Eytle-Museum')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        counts = assemble(args.site_root, {'patchlog': args.logs_repo, 'museum': args.museum_repo}, args.output)
    except (ValueError, OSError, subprocess.CalledProcessError, tarfile.TarError) as error:
        raise SystemExit(f'Assembly stopped; no release produced: {error}')
    print(json.dumps({'output': str(args.output.resolve()), **counts}, ensure_ascii=False))


if __name__ == '__main__':
    main()
