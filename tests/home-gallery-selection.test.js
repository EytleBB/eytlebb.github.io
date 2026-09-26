const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const main = read('js/main.js');
const source = name => {
  const match = main.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[^]*?\\n\\}`));
  assert.ok(match, `${name} exists`);
  return match[0];
};
const sampleFiles = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'];

function gallery(files = sampleFiles, lang = 'zh', loaded = true, random = () => 0.999) {
  const buttons = [];
  const opened = [];
  const gal = {
    innerHTML: '', attributes: { 'aria-busy': 'true' },
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelectorAll() {
      buttons.length = 0;
      for (const match of this.innerHTML.matchAll(/data-idx="(\d+)"/g)) {
        buttons.push({
          dataset: { idx: match[1] },
          addEventListener(_name, handler) { this.click = handler; },
        });
      }
      return buttons;
    },
  };
  const count = { textContent: '' };
  const images = files.map((file, index) => ({
    src: `images/gallery/${encodeURIComponent(file)}?v=source-hash`,
    preview: `images/gallery-preview/${index}.webp?v=source-hash`,
    width: 1400 + index * 10,
    height: 900 + index * 10,
  }));
  const context = vm.createContext({
    lang,
    DATA: { gallery: images },
    Math: Object.assign(Object.create(Math), { random }),
    stageRenderEpoch: 1,
    loadGallery: async () => loaded,
    document: { getElementById: id => id === 'home-gal' ? gal : count },
    openLightbox: index => opened.push(index),
    fetch() { throw new Error('Rendering must not prefetch originals'); },
    cacheGalleryImages() { throw new Error('Home must not cache additional images'); },
  });
  for (const name of ['t', 'pick', 'escapeHtml', 'selectHomeGallery', 'wireGalleryImages', 'renderHomeGallery']) {
    vm.runInContext(source(name), context);
  }
  return { context, gal, count, images, buttons, opened };
}

test('home samples three distinct images afresh without changing gallery order', () => {
  const { context, images } = gallery();
  const original = [...images];
  const first = Array.from(context.selectHomeGallery(), item => item.index);
  context.Math.random = () => 0;
  const next = Array.from(context.selectHomeGallery(), item => item.index);
  assert.notDeepEqual(first, next);
  for (const selection of [first, next]) {
    assert.equal(selection.length, 3);
    assert.equal(new Set(selection).size, 3);
    assert.ok(selection.every(index => index >= 0 && index < images.length));
  }
  assert.deepEqual(images, original);
});

test('small and empty galleries return every available image without duplicates', () => {
  for (let size = 0; size <= 3; size++) {
    for (const random of [() => 0, () => 1 - Number.EPSILON]) {
      const { context } = gallery(sampleFiles.slice(0, size), 'zh', true, random);
      const selected = Array.from(context.selectHomeGallery(), item => item.index);
      assert.equal(selected.length, size);
      assert.deepEqual(selected.sort(), Array.from({ length: size }, (_, index) => index));
    }
  }
});

test('three uncaptioned previews retain metadata, accessible labels and the correct lightbox targets', async () => {
  for (const lang of ['zh', 'en', 'ko']) {
    const { context, gal, images, buttons, opened } = gallery(undefined, lang);
    await context.renderHomeGallery(1);
    assert.equal((gal.innerHTML.match(/class="gal-item"/g) || []).length, 3);
    assert.equal((gal.innerHTML.match(/loading="lazy" decoding="async"/g) || []).length, 3);
    assert.doesNotMatch(gal.innerHTML, /gal-track|gal-set|gal-caption|images\/gallery\//);
    assert.equal(gal.attributes['aria-busy'], 'false');
    for (const index of [3, 2, 1]) {
      assert.ok(gal.innerHTML.includes(images[index].preview));
      assert.ok(gal.innerHTML.includes(`width="${images[index].width}" height="${images[index].height}"`));
      const number = index + 1;
      const label = { zh: `查看图片 ${number}`, en: `View picture ${number}`, ko: `이미지 ${number} 보기` }[lang];
      assert.ok(gal.innerHTML.includes(`aria-label="${label}"`));
    }
    buttons.forEach(button => button.click());
    assert.deepEqual(opened, [3, 2, 1]);
  }
});

test('a failed gallery load clears busy state and differs from a successful empty gallery', async () => {
  const failed = gallery([], 'zh', false);
  await failed.context.renderHomeGallery(1);
  assert.equal(failed.gal.attributes['aria-busy'], 'false');
  assert.match(failed.gal.innerHTML, /无法加载/);
  assert.doesNotMatch(failed.gal.innerHTML, /暂无图片/);
  const empty = gallery([]);
  await empty.context.renderHomeGallery(1);
  assert.match(empty.gal.innerHTML, /暂无图片/);
  assert.equal(empty.count.textContent, '共 0 张图片');
});

test('a failed gallery index can retry on the next visit and successful data remains cached', async () => {
  let indexRequests = 0;
  const context = vm.createContext({
    galleryLoaded: false,
    DATA: { gallery: [] },
    GALLERY_PREVIEW_INDEX: './images/gallery-preview/index.json',
    fetch: async url => url === './images/gallery/index.json'
      ? { ok: ++indexRequests > 1, status: 503, json: async () => sampleFiles }
      : { ok: true, json: async () => ({ items: {} }) },
  });
  vm.runInContext(source('loadGallery'), context);
  assert.equal(await context.loadGallery(), false);
  assert.equal(context.galleryLoaded, false);
  assert.equal(await context.loadGallery(), true);
  assert.equal(context.DATA.gallery.length, sampleFiles.length);
  assert.equal(await context.loadGallery(), true);
  assert.equal(indexRequests, 2);
});
