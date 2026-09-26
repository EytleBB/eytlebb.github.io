"""End-to-end assembly checks using small, independent Git repositories."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('assemble_site', ROOT / 'scripts/assemble-site.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True, stderr=subprocess.DEVNULL).strip()


def write(root, path, value):
    destination = root / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(value if isinstance(value, bytes) else value.encode())


def commit(repo):
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'Fixture')
    return git(repo, 'rev-parse', 'HEAD')


class ContentRepositoriesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.site = self.base / 'website'
        self.output = self.base / 'public'
        self.repos = {key: self.base / key for key in ('patchlog', 'museum')}
        for repo in self.repos.values():
            repo.mkdir()
            git(repo, 'init', '-q', '-b', 'main')
            git(repo, 'config', 'user.name', 'Content tests')
            git(repo, 'config', 'user.email', 'test@example.invalid')
        self.site.mkdir()
        write(self.site, 'index.html', '<title>Test website</title>')
        write(self.site, 'js/main.js', '// website code')
        write(self.site, '.git', 'private git file')
        write(self.site, 'AGENTS.md', 'private instructions')
        write(self.site, 'server/private.py', '# not public')
        write(self.site, 'docs/private.md', 'not public')
        write(self.site, 'scripts/deploy-excludes.txt', (ROOT / 'scripts/deploy-excludes.txt').read_bytes())
        write(self.repos['patchlog'], 'logs/2026-09-26.txt', 'Original log\n')
        write(self.repos['patchlog'], 'logs/index.json', '["2026-09-26"]')
        write(self.repos['museum'], 'images/gallery/0x0000.jpg', b'original-image')
        write(self.repos['museum'], 'images/gallery/0x0001.tiff', b'archival-image')
        write(self.repos['museum'], 'images/gallery/index.json', '["0x0000.jpg"]')
        write(self.repos['museum'], 'images/gallery-preview/0x0000.webp', b'preview')
        self.manifest = {'version': 1, 'items': {'0x0000.jpg': {
            'preview': '0x0000.webp', 'sourceHash': hashlib.sha256(b'original-image').hexdigest(),
            'sourceBytes': 14, 'previewBytes': 7, 'width': 1, 'height': 1, 'maxEdge': 2048,
        }}}
        write(self.repos['museum'], 'images/gallery-preview/index.json', json.dumps(self.manifest))
        write(self.repos['museum'], 'audio/museum.mp3', b'music')
        for repo in self.repos.values():
            write(repo, 'README.md', 'not public')
            write(repo, 'scripts/private.py', 'not public')
        self.lock = {'version': 1, 'repositories': {key: {'url': 'https://example.invalid/' + key, 'commit': commit(repo)} for key, repo in self.repos.items()}}
        self.save_lock()

    def save_lock(self):
        write(self.site, 'content-sources.json', json.dumps(self.lock))

    def pin(self, key):
        self.lock['repositories'][key]['commit'] = commit(self.repos[key])
        self.save_lock()

    def assemble(self):
        return module.assemble(self.site, self.repos, self.output)

    def test_assembly_uses_pinned_commits_and_keeps_existing_public_urls(self):
        write(self.repos['patchlog'], 'logs/2026-09-26.txt', 'Unreleased change')
        commit(self.repos['patchlog'])
        write(self.site, 'logs/old.txt', 'stale source copy')
        write(self.site, 'images/gallery/old.jpg', b'stale image')
        result = self.assemble()
        self.assertEqual(result, {'logs': 1, 'originals': 2, 'previews': 1})
        self.assertEqual((self.output / 'logs/2026-09-26.txt').read_text(), 'Original log\n')
        self.assertEqual((self.output / 'images/gallery/0x0001.tiff').read_bytes(), b'archival-image')
        self.assertEqual((self.output / 'audio/museum.mp3').read_bytes(), b'music')
        for relative in ('.git', 'content-sources.json', 'AGENTS.md', 'server', 'docs', 'scripts', 'README.md', 'logs/old.txt', 'images/gallery/old.jpg'):
            self.assertFalse((self.output / relative).exists(), relative)

    def test_bare_repositories_can_supply_content_without_network(self):
        for key, repository in list(self.repos.items()):
            bare = self.base / (key + '.git')
            subprocess.run(['git', 'clone', '-q', '--bare', str(repository), str(bare)], check=True)
            self.repos[key] = bare
        self.assemble()
        self.assertTrue((self.output / 'images/gallery-preview/index.json').is_file())

    def test_unknown_commit_does_not_produce_a_partial_release(self):
        self.lock['repositories']['museum']['commit'] = 'f' * 40
        self.save_lock()
        with self.assertRaises(subprocess.CalledProcessError):
            self.assemble()
        self.assertFalse(self.output.exists())

    def test_stale_previews_stop_release(self):
        write(self.repos['museum'], 'images/gallery/0x0000.jpg', b'changed artwork')
        self.pin('museum')
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            self.assemble()
        self.assertFalse(self.output.exists())

    def test_log_index_must_include_all_articles(self):
        write(self.repos['patchlog'], 'logs/2026-09-25.txt', 'Forgotten article')
        self.pin('patchlog')
        with self.assertRaisesRegex(ValueError, 'every dated article'):
            self.assemble()

    def test_content_symlinks_cannot_escape_the_archive(self):
        (self.repos['patchlog'] / 'logs/leak.txt').symlink_to('/etc/passwd')
        self.pin('patchlog')
        with self.assertRaisesRegex(ValueError, 'not links'):
            self.assemble()
        self.assertFalse(self.output.exists())

    def test_existing_output_and_repository_paths_are_never_overwritten(self):
        self.output.mkdir()
        write(self.output, 'sentinel', 'keep')
        with self.assertRaisesRegex(ValueError, 'new directory'):
            self.assemble()
        self.assertEqual((self.output / 'sentinel').read_text(), 'keep')
        self.output = self.site / 'build'
        with self.assertRaisesRegex(ValueError, 'outside'):
            self.assemble()

    def test_unsafe_preview_paths_stop_release(self):
        self.manifest['items']['0x0000.jpg']['preview'] = '../../private.webp'
        write(self.repos['museum'], 'images/gallery-preview/index.json', json.dumps(self.manifest))
        self.pin('museum')
        with self.assertRaisesRegex(ValueError, 'Unsafe preview'):
            self.assemble()

    def test_site_hook_rejects_force_added_personal_content(self):
        (self.site / '.git').unlink()
        git(self.site, 'init', '-q', '-b', 'main')
        write(self.site, 'logs/leaked.txt', 'personal')
        git(self.site, 'config', 'user.name', 'Content tests')
        git(self.site, 'config', 'user.email', 'test@example.invalid')
        git(self.site, 'config', 'core.hooksPath', '.githooks')
        write(self.site, '.githooks/pre-commit', (ROOT / '.githooks/pre-commit').read_bytes())
        (self.site / '.githooks/pre-commit').chmod(0o755)
        git(self.site, 'add', 'logs/leaked.txt')
        result = subprocess.run(['git', 'commit', '-m', 'Must be rejected'], cwd=self.site, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b'Personal content belongs', result.stderr)

    def setup_deployment(self):
        (self.site / '.git').unlink()
        git(self.site, 'init', '-q', '-b', 'main')
        git(self.site, 'config', 'user.name', 'Content tests')
        git(self.site, 'config', 'user.email', 'test@example.invalid')
        write(self.site, 'scripts/assemble-site.py', (ROOT / 'scripts/assemble-site.py').read_bytes())
        sha = commit(self.site)
        base = self.base / 'server'
        base.mkdir()
        subprocess.run(['git', 'clone', '-q', '--bare', str(self.site), str(base / 'site.git')], check=True)
        subprocess.run(['git', 'clone', '-q', str(base / 'site.git'), str(base / 'repo')], check=True)
        (base / 'content').mkdir()
        for key, name in [('patchlog', 'Eytle-Patch-Log'), ('museum', 'Eytle-Museum')]:
            subprocess.run(['git', 'clone', '-q', '--bare', str(self.repos[key]), str(base / 'content' / (name + '.git'))], check=True)
        self.output.mkdir()
        write(self.output, 'sentinel', 'old live site')
        hook = (ROOT / 'scripts/production/post-receive').read_text().replace('BASE=/srv/eytle-site', f'BASE={base}').replace('WEB=/var/www/eytle.cn', f'WEB={self.output}')
        write(base, 'post-receive', hook)
        return base, sha

    def test_deploy_hook_assembles_and_publishes_from_local_bare_repos(self):
        base, sha = self.setup_deployment()
        subprocess.run(['bash', str(base / 'post-receive')], input=f'{"0" * 40} {sha} refs/heads/main\n', text=True, check=True, stdout=subprocess.DEVNULL)
        self.assertTrue((self.output / 'logs/index.json').is_file())
        self.assertTrue((self.output / 'audio/museum.mp3').is_file())
        self.assertFalse((self.output / 'sentinel').exists())
        self.assertFalse((self.output / 'content-sources.json').exists())

    def test_deploy_hook_missing_content_leaves_live_site_untouched(self):
        base, sha = self.setup_deployment()
        shutil.rmtree(base / 'content/Eytle-Museum.git')
        result = subprocess.run(['bash', str(base / 'post-receive')], input=f'{"0" * 40} {sha} refs/heads/main\n', text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.output / 'sentinel').read_text(), 'old live site')
        self.assertFalse((self.output / 'logs').exists())


if __name__ == '__main__':
    unittest.main()
