# eytle.cn
3e个人网站

Deploy test

## Pictures At An Exhibition image names

Run the zero-dependency watcher before adding images:

```powershell
node scripts/gallery-renamer.js
```

It scans `images/gallery` immediately, then checks once per second until you
press `Ctrl+C`. Images are named `0x0000.ext` through `0xFFFF.ext`, with their
original extension preserved. A file must remain unchanged for two seconds
before it is renamed, so large copies are not exposed half-written.

For a one-time scan without watching:

```powershell
node scripts/gallery-renamer.js --once
```

The current exhibition index accepts JPG, JPEG, PNG, GIF, and WebP. TIFF, AVIF, and
BMP files are renamed but omitted from the index; convert them or extend the
site's format allowlist before use.

After the names and `index.json` have settled, generate the lightweight WebP
assets used by the home preview, grid, and 3D museum:

```powershell
python scripts/gallery-previews.py
```

This keeps the original files for the full-size lightbox while avoiding a
hundreds-of-megabytes first visit. The generated files live in
`images/gallery-preview/`; do not edit its `index.json` by hand.
