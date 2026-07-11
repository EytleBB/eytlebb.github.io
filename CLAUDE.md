# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Static personal website ("This is Eytle") — no build step, no package manager, no framework. Served directly as HTML/CSS/JS. GitHub Pages deployment is assumed.

## Architecture

The site is a **rail + stage layout** (`index.html` + `css/style.css` + `js/main.js`), themed as the "birch-forest world" (zero glow, hairlines, deep-blue ambient + amber accent). A full-screen painting (`images/patchlog-bg-{night,light}.jpg`) sits behind a scrim + film grain on every page.

| Region | Role |
|--------|------|
| `.rail` (left, 248px, sticky) | Brand/logo, language switcher, nav (each `.nav-i` has `data-section`), lamp (theme) + contact |
| `.stage` (`#stage`) | Main panel — `go(section)` re-renders it on every nav click |
| `#overlay-root` | Patch-log reader + Pictures At An Exhibition lightbox mount here (`mountOverlay`), close on ✕ / backdrop / Esc |

The home section (`about`) is a custom overview: hero + a two-column grid (latest real patch-log entry + message form | Pictures At An Exhibition preview). Other sections render generic lists/grids into the stage. Section is reflected in `location.hash` (`#patchlog` etc.) for shareable links.

All UI state lives in `main.js`. There is no framework, no module system — everything is plain JS in a single file.

### Data flow

`DATA` (top of `main.js`) is the single source of truth for static content (projects, tools, downloads, about). Dynamic sections load their data at render time:

- **Patch Log** — `loadLogs()` fetches `./logs/index.json` (newest-first list of `YYYY-MM-DD`) then fetches individual `./logs/YYYY-MM-DD.txt` when a calendar day or the home "read more" is clicked. The home overview shows the most recent entry's real first lines.
- **Pictures At An Exhibition** — `loadGallery()` fetches `./images/gallery/index.json` (list of filenames) then builds `DATA.gallery` from it. Both loaders cache after first call.

Both `index.json` files are auto-generated locally — never edit them by hand.

### Local automation

| Script / hook | Trigger | Output |
|---------------|---------|--------|
| `scripts/gallery-renamer.js` | run continuously, or with `--once` | normalizes exhibition image names and refreshes `images/gallery/index.json` |
| `.githooks/pre-commit` | `git commit` | refreshes both generated `index.json` files |

### Bilingual support

Trilingual (中文 / English / 한국어). `t(zh, en, ko)` returns the appropriate string based on `lang`; `pick(obj, base)` reads localized fields (`name`/`nameEn`/`nameKo`) off DATA entries. Nav buttons carry `data-zh`/`data-en`/`data-ko`; `applyLang()` updates labels, persists `lang` to `localStorage`, and re-renders the active section. All dynamic text goes through `escapeHtml()`.

### Theme

`data-theme="night|day"` is set on `<html>` ("lights off / on"). Switching swaps the background painting and the whole token set, and updates the lamp button's action label. Theme persists to `localStorage`. (`mc-calc.html` is independent and unaffected.)

### Message form

Home overview has a "给 Eytle 留言" box (140-char limit + live count, fixed height, honeypot anti-spam). Backend is `MSG_CONFIG.web3formsKey` near the top of `main.js`: paste a free Web3Forms public submit key to relay messages to the inbox; leave `''` and the form just acknowledges locally. No secret key ever belongs in this file.

## Adding content

- **New project**: add an entry to `DATA.projects` in `main.js`. Set `sub: []` for direct GitHub link, or populate `sub` for a sub-project list.
- **New tool**: add to `DATA.tools`. Set `external: false` for internal pages (e.g. `mc-calc.html`). `icon` (e.g. the Eye of Ender) is shown only on the tool row — keep that image scoped to tools.
- **New download**: add to `DATA.downloads`.
- **New Pictures At An Exhibition image**: run `node scripts/gallery-renamer.js`, then drop the file into `images/gallery/`. It is renamed to the next `0xNNNN.ext` name and `index.json` is refreshed.
- **New patch log entry**: create `logs/YYYY-MM-DD.txt`; the pre-commit hook updates `logs/index.json`. The calendar hard-starts at March 2026 (`y=2026, m=2` in `renderPatchlog`); update if adding older entries.

## `mc-calc.html`

Self-contained Minecraft stronghold finder tool. Separate page, no shared JS with `main.js`.

## `museum.html`

Self-contained first-person 3D exhibition (Three.js via jsDelivr importmap, pinned
to `0.169.0`). Reads the same `images/gallery/index.json` as the grid. On the
Pictures At An Exhibition nav click, `main.js` routes capable desktops here via
`isMuseumCapable()`; mobile / touch / unsupported devices keep the existing grid +
lightbox. The exhibition is a fixed dark dramatic hall — it does NOT follow the night/day theme. Exit
returns to `index.html` (never `#gallery`, to avoid a relaunch loop). No shared JS
with `main.js`. Logic lives in `js/museum.js`, styling in `css/museum.css`.
