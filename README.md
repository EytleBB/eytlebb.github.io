# eytle.cn
3e个人网站

Deploy test

## Gallery image names

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

The current gallery index accepts JPG, JPEG, PNG, GIF, and WebP. TIFF, AVIF, and
BMP files are renamed but omitted from the index; convert them or extend the
site's format allowlist before use.
