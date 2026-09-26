const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('main gallery uses previews while the lightbox streams the original', () => {
  const main = read('js/main.js');
  assert.match(main, /GALLERY_PREVIEW_INDEX = '\.\/images\/gallery-preview\/index\.json'/);
  assert.match(main, /src: `\$\{baseSrc\}\$\{version\}`/);
  assert.match(main, /img\.preview \|\| img\.src/);
  assert.match(main, /const response = await fetch\(img\.src/);
  assert.match(main, /response\.body\?\.getReader/);
  assert.match(main, /class="lightbox-original"/);
});

test('3D museum uses preview textures with an original-image fallback', () => {
  const museum = read('js/museum.js');
  assert.match(museum, /let TEXTURE_IMAGES = \[\]/);
  assert.match(museum, /galleryImageSource\(TEXTURE_IMAGES\[i\] \|\| IMAGES\[i\], i\)/);
  assert.match(museum, /INITIAL_TEXTURE_START = 0/);
  assert.match(museum, /INITIAL_TEXTURE_COUNT = 48/);
  assert.match(museum, /start \+ i/);
});
