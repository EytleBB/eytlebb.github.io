#!/usr/bin/env python3
"""Run as root from an uploaded release bundle; preserves a private rollback copy."""
from datetime import datetime, timezone
from pathlib import Path
import os
import pwd
import secrets
import shutil
import subprocess
import sys


def run(*args):
    subprocess.run(args, check=True)


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with sudo')
    bundle = Path(__file__).resolve().parents[2]
    templates = bundle / 'scripts/production'
    site = Path('/etc/nginx/sites-available/eytle.cn')
    original = site.read_text()
    include = '    include /etc/nginx/snippets/eytle-museum.conf;'
    updated = original
    if include not in original:
        anchor = '    root /var/www/eytle.cn;'
        if original.count(anchor) != 1 or 'listen 443 ssl' not in original:
            raise SystemExit('Unexpected site configuration; inspect before installing')
        updated = original.replace(anchor, include + '\n    if ($host = www.eytle.cn) { return 301 https://eytle.cn$request_uri; }\n\n' + anchor)
    backup = Path('/srv/eytle-site/backups') / datetime.now(timezone.utc).strftime('pre-release-%Y%m%dT%H%M%SZ')
    backup.mkdir(parents=True, mode=0o700)
    targets = {
        'site.conf': site,
        'excludes.txt': Path('/srv/eytle-site/deploy-excludes.txt'),
        'post-receive': Path('/srv/eytle-site/site.git/hooks/post-receive'),
        'museum-locations.conf': Path('/etc/nginx/snippets/eytle-museum.conf'),
        'museum-rate-limits.conf': Path('/etc/nginx/conf.d/eytle-museum-limits.conf'),
        'museum_guest_api.py': Path('/opt/eytle-museum/museum_guest_api.py'),
        'backup_guestbook.py': Path('/opt/eytle-museum/backup_guestbook.py'),
        'eytle-museum.env': Path('/etc/eytle-museum.env'),
    }
    for unit in ('eytle-museum.service', 'eytle-museum-backup.service', 'eytle-museum-backup.timer'):
        targets[unit] = Path('/etc/systemd/system') / unit
    existed = {name: path.exists() for name, path in targets.items()}
    for name, path in targets.items():
        if path.exists():
            shutil.copy2(path, backup / name)
    run('tar', '-C', '/var/www', '-cf', str(backup / 'website.tar'), 'eytle.cn')
    (backup / 'previous-commit.txt').write_text(subprocess.check_output(
        ['git', '-c', 'safe.directory=/srv/eytle-site/repo', '-C', '/srv/eytle-site/repo', 'rev-parse', 'HEAD'], text=True))
    print(f'Rollback backup: {backup}', flush=True)
    try:
        pwd.getpwnam('museum-guest')
    except KeyError:
        run('useradd', '--system', '--user-group', '--no-create-home', '--shell', '/usr/sbin/nologin', 'museum-guest')
    run('install', '-d', '-m', '0755', '/opt/eytle-museum')
    for path in ('/var/lib/eytle-museum', '/var/backups/eytle-museum'):
        run('install', '-d', '-m', '0700', '-o', 'museum-guest', '-g', 'museum-guest', path)
    environment = Path('/etc/eytle-museum.env')
    if not environment.exists():
        fd = os.open(environment, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as output:
            output.write('MUSEUM_SECRET=' + secrets.token_hex(32) + '\nMUSEUM_ORIGIN=https://eytle.cn\n')
    for source, target in (
        (bundle / 'server/museum_guest_api.py', targets['museum_guest_api.py']),
        (templates / 'backup_guestbook.py', targets['backup_guestbook.py']),
        (templates / 'museum-locations.conf', targets['museum-locations.conf']),
        (templates / 'museum-rate-limits.conf', targets['museum-rate-limits.conf']),
    ):
        run('install', '-m', '0644', str(source), str(target))
    for unit in ('eytle-museum.service', 'eytle-museum-backup.service', 'eytle-museum-backup.timer'):
        run('install', '-m', '0644', str(templates / unit), str(targets[unit]))
    site.write_text(updated)
    try:
        run('nginx', '-t')
        run('systemd-analyze', 'verify', str(targets['eytle-museum.service']), str(targets['eytle-museum-backup.service']), str(targets['eytle-museum-backup.timer']))
    except subprocess.CalledProcessError:
        for name in ('site.conf', 'museum-locations.conf', 'museum-rate-limits.conf'):
            if existed[name]:
                shutil.copy2(backup / name, targets[name])
            else:
                targets[name].unlink(missing_ok=True)
        raise
    run('install', '-m', '0644', str(bundle / 'scripts/deploy-excludes.txt'), str(targets['excludes.txt']))
    run('systemctl', 'daemon-reload')
    run('systemctl', 'enable', '--now', 'eytle-museum.service')
    run('systemctl', 'restart', 'eytle-museum.service')
    run('systemctl', 'enable', '--now', 'eytle-museum-backup.timer')
    run('systemctl', 'reload', 'nginx')
    print('Guestbook installed. Verify HTTPS health and run the backup service.', flush=True)


if __name__ == '__main__':
    main()
