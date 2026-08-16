const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

test('lightbox turns streamed bytes into a smooth developing-photo reveal', () => {
  assert.match(js, /function developLightboxImage\(img, loading\)/);
  assert.match(js, /requestAnimationFrame\(renderProgress\)/);
  assert.match(js, /target = \.035 \+ ratio \* \.91/);
  assert.match(js, /URL\.createObjectURL\(blob\)/);
  assert.match(css, /clip-path:inset\(0 0 calc\(100% - var\(--develop-progress\)\) 0\)/);
});

test('developer line and decoded original have distinct visual layers', () => {
  assert.match(js, /class="lightbox-unexposed"/);
  assert.match(js, /class="lightbox-preview"/);
  assert.match(js, /class="lightbox-original"/);
  assert.match(js, /class="lightbox-developer-line"/);
  assert.match(css, /@keyframes developer-shimmer/);
  assert.match(css, /\.lightbox\.is-developed \.lightbox-original \{ opacity:1; \}/);
});

test('closing the lightbox aborts its download and releases the blob URL', () => {
  assert.match(js, /loading\.controller\.abort\(\)/);
  assert.match(js, /URL\.revokeObjectURL\(loading\.objectUrl\)/);
  assert.match(js, /loading\.controller\.signal\.aborted\)[\s\S]*?resolveFinish\(\)/);
});
