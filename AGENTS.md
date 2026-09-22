# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project overview

Static personal website ("This is Eytle") — no build step, no package manager, no framework. Served directly as HTML/CSS/JS. GitHub (`origin`) stores the source; production `eytle.cn` is served by Nginx on Tencent Cloud and deployed through the `tencent` Git remote. See `CODEx_DEPLOY_GUIDE.md` before deployment.

The museum additionally uses a Python/SQLite guestbook API. Its code, database, secret and backups live outside the public web root. Production service templates are in `scripts/production/`; see `docs/maintenance/museum-guestbook-service.md`. A Git push deploys static assets only: backend changes require a separate service update and verification.

### Restored local workspace (2026-09-12)

The current Linux workspace is `/home/yeom/Documents/ChatGPT/thisIsEytle`, restored from the PSSD backup of `D:\eyt_web`. Read `docs/maintenance/2026-09-12-recovery.md` for the verified baseline, local commands, preserved drafts, and remaining deployment-access checks. The ignored `eyt_web_repo/`, `deploy/`, and `.claude/worktrees/pensive-robinson/` directories contain historical copies or drafts; continue website work at the repository root.

For server commands, use `ssh eytle-server`. This machine's `~/.ssh/config` provides a dedicated Ed25519 key, a direct network interface to bypass Mihomo, and optional connection sharing. Fresh key authentication and `git ls-remote tencent` were verified on 2026-09-12. If the active network interface changes from `wlp0s20f3`, update `BindInterface` in the local SSH config.

### Collaboration and release workflow (2026-09-18)

Use one isolated Git worktree (or branch) for each feature task. A feature task may edit, test, and commit only its own scope; it must not publish to `origin` or `tencent`. Do not run multiple feature tasks in the repository root at the same time.

The Codex thread titled **“Eytle 网站发布会话”** is the release thread. It works at the repository root and is the sole owner of the following steps:

1. Inspect every completed feature commit and merge or cherry-pick it into `main`.
2. Run the complete test suite and relevant local checks.
3. Create the integration/release commit after confirming the worktree is clean.
4. Push `main` to GitHub first, then push the identical commit to `tencent`.
5. Verify local, GitHub, Tencent bare repository, server worktree, and production files all match; keep release verification records outside the public web root.

Before starting a new feature, create its worktree from current `main`. If a feature needs files changed by another unfinished task, pause that dependent change until the prerequisite commit is available. Keep deployment configuration and internal maintenance files out of the public site using `scripts/deploy-excludes.txt`.

## Architecture

The site uses **sticky top navigation + a rendered stage** (`index.html` + `css/style.css` + `js/main.js`), with cinematic birch-forest artwork. Night uses deep blue and amber; day uses ivory and sage. Responsive `images/forest-{night,day}[-mobile].webp` backgrounds have an optional WebGL2 pond/fog enhancement in `js/forest-scene.js`.

| Region | Role |
|--------|------|
| `.rail` (sticky top header; legacy class name) | Brand/logo, language switcher, nav (each `.nav-i` has `data-section`), lamp (theme); contact links live in the footer |
| `.stage` (`#stage`) | Main panel — `go(section)` re-renders it on every nav click |
| `#overlay-root` | Patch-log reader + gallery lightbox mount here (`mountOverlay`), close on ✕ / backdrop / Esc |

The home section (`about`) is a custom overview: hero + a two-column grid (latest real patch-log entry + message form | gallery preview). Other sections render generic lists/grids into the stage. Shareable routes use `/`, `/projects`, `/tools`, `/patchlog`, `/gallery` and `/downloads`, with History API back/forward support. Legacy hashes are normalized on arrival. Nginx routes only these known paths to `index.html`; keep missing assets and unknown pages as 404. Use `python3 scripts/preview.py` for local static preview with clean URLs.

Main-site UI state lives in `main.js`; `forest-scene.js` independently manages the optional background animation. There is no framework or build step. Forest and particle rendering stop off the hero, on other sections, in hidden tabs, or under reduced motion; retain the static CSS fallback.

### Data flow

`DATA` (top of `main.js`) is the single source of truth for static content (projects, tools, downloads, about). Dynamic sections load their data at render time:

- **Patch Log** — `loadLogs()` fetches `./logs/index.json` (newest-first list of `YYYY-MM-DD`) then fetches individual `./logs/YYYY-MM-DD.txt` when a calendar day or the home "read more" is clicked. The home overview shows the most recent entry's real first lines.
- **Gallery** — `loadGallery()` fetches `./images/gallery/index.json` (list of original filenames) plus `./images/gallery-preview/index.json` (generated lightweight WebP mapping), then builds `DATA.gallery`. Grid/home cards use previews; the lightbox keeps the originals. Both loaders cache after first call.

The log, gallery, and gallery-preview `index.json` files are auto-generated locally — never edit them by hand.

### Local automation

| Script / hook | Trigger | Output |
|---------------|---------|--------|
| `scripts/gallery-renamer.js` | run continuously, or with `--once` | normalizes gallery names and refreshes `images/gallery/index.json` |
| `scripts/gallery-previews.py` | after gallery names/index change | generates 2048px WebP previews and refreshes `images/gallery-preview/index.json` |
| `.githooks/pre-commit` | `git commit` | refreshes the gallery filename index and log index; gallery previews remain an explicit generation step |

### Trilingual support

Trilingual (中文 / English / 한국어). `t(zh, en, ko)` returns the appropriate string based on `lang`; `pick(obj, base)` reads localized fields (`name`/`nameEn`/`nameKo`) off DATA entries. Nav buttons carry `data-zh`/`data-en`/`data-ko`; `applyLang()` updates labels, persists `lang` to `localStorage`, and re-renders the active section. All dynamic text goes through `escapeHtml()`.

### Theme

`data-theme="night|day"` is set on `<html>` ("lights off / on"). Switching swaps the background painting and the whole token set, and updates the lamp button's action label. Theme persists to `localStorage`. (`mc-calc.html` is independent and unaffected.)

### Message form

Home overview has a "给 Eytle 留言" box (140-char limit + live count, fixed height, honeypot anti-spam). Backend is `MSG_CONFIG.web3formsKey` near the top of `main.js`: paste a free Web3Forms public submit key to relay messages to the inbox; leave `''` and the form explains that sending is unavailable and preserves the draft. This is separate from the museum guestbook. No secret key ever belongs in this file.

## Adding content

- **New project**: add an entry to `DATA.projects` in `main.js`. Set `sub: []` for direct GitHub link, or populate `sub` for a sub-project list.
- **New tool**: add to `DATA.tools`. Set `external: false` for internal pages (e.g. `mc-calc.html`). `icon` (e.g. the Eye of Ender) is shown only on the tool row — keep that image scoped to tools.
- **New download**: add to `DATA.downloads`.
- **New gallery image**: run `node scripts/gallery-renamer.js`, then drop the file into `images/gallery/`. It is renamed to the next `0xNNNN.ext` name and `index.json` is refreshed. After the rename settles, run `python scripts/gallery-previews.py` so the grid and museum do not fall back to the large original.
- **New patch log entry**: create `logs/YYYY-MM-DD.txt`; the pre-commit hook updates `logs/index.json`. The year → month → day calendar is data-driven; no fixed start date needs updating.

## `mc-calc.html`

Self-contained Minecraft stronghold finder tool. Separate page, no shared JS with `main.js`.

## `museum.html`

Self-contained first-person 3D museum (Three.js via jsDelivr importmap, pinned
to `0.186.0`). Reads `images/gallery/index.json` for order and the generated
`images/gallery-preview/index.json` for lightweight textures. On the
gallery nav click, `main.js` routes capable desktops here via `isMuseumCapable()`;
mobile / touch / unsupported devices keep the existing grid + lightbox. The museum
is a fixed dark dramatic hall — it does NOT follow the night/day theme. Exit
returns to `/` (never `/gallery`, to avoid a relaunch loop). The public URL is `/museum`; `/museum.html` redirects there. No shared JS
with `main.js`. Interaction and streaming live in `js/museum.js`; procedural architecture, materials and planar reflections in `js/museum-architecture.js`; projector light volumes and dust in `js/museum-atmosphere.js`; instanced lamp rendering in `js/museum-fixture-batch.js`; styling in `css/museum.css`.

The Nocturne art direction uses a 6.7 m vaulted hall, champagne metal and dark stone. Keep the half-width at 3 m and structural projections within the existing 0.4 m collision margin. Fog ends at 82 m before the 88 m hidden-retarget boundary. Reflection cameras must have their cloned AudioListener children cleared. Ceiling projectors, their light volumes and floor pools share `js/museum-lighting-layout.js`; opaque bloom occlusion lives in `js/museum-bloom-occlusion.js`. Keep pier/intrados light channels centered on each rib and stop longitudinal rails before the 0.45 m plinths. Use `museum.html?perf=walk` for automatic visual/performance verification; the entrance is hidden in this diagnostic mode.
