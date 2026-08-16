const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('home exhibition preview uses a seamless auto-scrolling loop', () => {
  const main = read('js/main.js');
  const style = read('css/style.css');
  const html = read('index.html');

  assert.match(main, /GALLERY_HOME_COUNT = 24/);
  assert.match(main, /class="gal-track"/);
  assert.match(main, /class="gal-set" aria-hidden="true"/);
  assert.match(style, /animation:home-gallery-scroll/);
  assert.match(style, /\.gal:hover \.gal-track,[\s\S]*\.gal:focus-within \.gal-track \{ animation-play-state:paused; \}/);
  assert.match(style, /@keyframes home-gallery-scroll[\s\S]*translate3d\(0,-50%,0\)/);
  assert.match(html, /css\/style\.css\?v=photo-develop-20260816/);
  assert.match(html, /js\/main\.js\?v=photo-develop-20260816/);
});
