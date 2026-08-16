const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('every web gallery image has a lightweight generated preview', () => {
  const filenames = JSON.parse(read('images/gallery/index.json'));
  const manifest = JSON.parse(read('images/gallery-preview/index.json'));
  assert.equal(manifest.version, 1);
  assert.deepEqual(Object.keys(manifest.items), filenames);

  let originalBytes = 0;
  let previewBytes = 0;
  for (const filename of filenames) {
    const item = manifest.items[filename];
    const originalPath = path.join(root, 'images', 'gallery', filename);
    const previewPath = path.join(root, 'images', 'gallery-preview', item.preview);
    assert.ok(fs.existsSync(previewPath), `missing preview for ${filename}`);
    assert.equal(item.sourceBytes, fs.statSync(originalPath).size);
    assert.equal(item.previewBytes, fs.statSync(previewPath).size);
    assert.ok(item.width <= item.maxEdge && item.height <= item.maxEdge);
    originalBytes += item.sourceBytes;
    previewBytes += item.previewBytes;
  }

  assert.ok(previewBytes < 20 * 1024 * 1024, 'preview set exceeded the 20 MiB budget');
  assert.ok(previewBytes < originalBytes / 10, 'previews should be at least 10x lighter');
});

test('main gallery uses previews while the lightbox retains originals', () => {
  const main = read('js/main.js');
  assert.match(main, /GALLERY_PREVIEW_INDEX = '\.\/images\/gallery-preview\/index\.json'/);
  assert.match(main, /img\.preview \|\| img\.src/);
  assert.match(main, /<div class="lightbox"><img src="\$\{img\.src\}"/);
});

test('3D museum uses preview textures with an original-image fallback', () => {
  const museum = read('js/museum.js');
  assert.match(museum, /let TEXTURE_IMAGES = \[\]/);
  assert.match(museum, /galleryImageSource\(TEXTURE_IMAGES\[i\] \|\| IMAGES\[i\], i\)/);
  assert.match(museum, /INITIAL_TEXTURE_START = 16/);
  assert.match(museum, /INITIAL_TEXTURE_COUNT = 24/);
  assert.match(museum, /start \+ i/);
});
