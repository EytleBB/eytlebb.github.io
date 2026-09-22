#!/usr/bin/env python3
"""Private online SQLite snapshots, integrity checks and bounded retention."""
from datetime import datetime, timezone
import os
from pathlib import Path
import shutil
import sqlite3
from museum_guest_api import Config, Guestbook


def main():
    os.umask(0o077)
    root = Path('/var/www/eytle.cn')
    service = Guestbook(Config(
        db=Path('/var/lib/eytle-museum/guestbook.sqlite3'),
        gallery_index=root / 'images/gallery/index.json', public_root=root,
        secret=os.environ['MUSEUM_SECRET'].encode(),
        origin=os.environ['MUSEUM_ORIGIN'],
    ))
    destination = Path('/var/backups/eytle-museum')
    stamp = datetime.now(timezone.utc)
    daily = destination / f"daily-{stamp:%Y%m%dT%H%M%S%fZ}.sqlite3"
    service.backup(daily)
    with sqlite3.connect(f'file:{daily}?mode=ro', uri=True) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Backup integrity check failed; retaining all snapshots')
    monthly = destination / f"monthly-{stamp:%Y-%m}.sqlite3"
    if not monthly.exists():
        with monthly.open('xb') as output, daily.open('rb') as source:
            shutil.copyfileobj(source, output)
        os.chmod(monthly, 0o600)
    # Only this helper's named snapshots are eligible; never touch the live DB.
    for pattern, keep in [('daily-*.sqlite3', 14), ('monthly-*.sqlite3', 6)]:
        snapshots = sorted(p for p in destination.glob(pattern) if p.is_file() and not p.is_symlink())
        for old in snapshots[:-keep]:
            old.unlink()
    service.prune()
    print(f'Backup verified: {daily.name}')


if __name__ == '__main__':
    main()
