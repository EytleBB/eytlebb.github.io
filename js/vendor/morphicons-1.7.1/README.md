# Morphicons 1.7.1

Vendored, unmodified ESM DOM driver and its two runtime dependencies from the
official npm package. The website needs no build step or external CDN request.

- Project and documentation: https://github.com/guillermolg00/morphicons
- Package: https://registry.npmjs.org/morphicons/-/morphicons-1.7.1.tgz
- License: MIT, preserved in `LICENSE`.
- npm tarball integrity: `sha512-q5ylxy5/d7vBg0OAzanlooXf05PekovMYDuuQVpr6vAQZxl99lrJbaIi+jJ32PXQf9WEEaDO2pbNBsx1ZhEnFQ==`

`js/site-icons.js` supplies the site's own stroke paths, static fallback,
reduced-motion behavior and cleanup when the stage is rendered again.
Only state changes and selected hover/focus cues animate; decorative icons stay
still. Colors inherit the site's existing night/day tokens.

To upgrade, verify the new npm tarball's integrity and copy the DOM entry plus
its relative imports into a new versioned directory. Update the import in
`js/site-icons.js` and the script cache version in `index.html`, then verify theme
switches, project disclosures, message outcomes, keyboard focus and reduced motion.
