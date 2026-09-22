#!/usr/bin/env python3
"""Install only the clean-URL Nginx rules; never restart or modify the guestbook."""
from datetime import datetime, timezone
from pathlib import Path
import os
import shutil
import subprocess


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with sudo')
    templates = Path(__file__).resolve().parent
    site = Path('/etc/nginx/sites-available/eytle.cn')
    original = site.read_text()
    include = '    include /etc/nginx/snippets/eytle-routes.conf;'
    updated = original
    if include not in original:
        blocks = [
            '    location = / {\n        add_header Cache-Control "no-cache, no-store, must-revalidate" always;\n        try_files /index.html =404;\n    }',
            '    location = /index.html {\n        add_header Cache-Control "no-cache, no-store, must-revalidate" always;\n    }',
        ]
        for block in blocks:
            if updated.count(block) != 1:
                raise SystemExit('Unexpected existing page rules; inspect before installing')
            updated = updated.replace(block, '', 1)
        anchor = '    include /etc/nginx/snippets/eytle-museum.conf;'
        if updated.count(anchor) != 1:
            raise SystemExit('Expected museum include not found exactly once')
        updated = updated.replace(anchor, anchor + '\n' + include, 1)
    backup = Path('/srv/eytle-site/backups') / datetime.now(timezone.utc).strftime('clean-urls-%Y%m%dT%H%M%SZ')
    backup.mkdir(parents=True, mode=0o700)
    targets = [site, Path('/etc/nginx/snippets/eytle-routes.conf'), Path('/etc/nginx/snippets/eytle-museum.conf')]
    existed = {target: target.exists() for target in targets}
    for target in targets:
        if target.exists():
            shutil.copy2(target, backup / target.name)
    try:
        site.write_text(updated)
        for name, target in [('site-routes.conf', targets[1]), ('museum-locations.conf', targets[2])]:
            shutil.copyfile(templates / name, target)
            target.chmod(0o644)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except Exception:
        for target in targets:
            if existed[target]:
                shutil.copy2(backup / target.name, target)
            else:
                target.unlink(missing_ok=True)
        raise
    print(f'Clean URLs enabled. Previous configuration: {backup}')


if __name__ == '__main__':
    main()
