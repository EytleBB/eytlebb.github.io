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
const dataContext = vm.createContext({});
vm.runInContext(`${main.match(/const DATA = \{[^]*?\n\};/)[0]}\nglobalThis.about = DATA.about;`, dataContext);
const featuredGallery = JSON.parse(JSON.stringify(dataContext.about.featuredGallery));
const preferred = featuredGallery.map(item => item.file);

function gallery(files = ['fallback.jpg', preferred[2], preferred[1], preferred[0]], lang = 'zh', loaded = true) {
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
    DATA: { about: { featuredGallery }, gallery: images },
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

test('curated home images exist and preserve their configured order across visits', () => {
  const index = JSON.parse(read('images/gallery/index.json'));
  assert.deepEqual(preferred, ['0x0025.jpg', '0x0002.jpg', '0x0045.png']);
  assert.ok(preferred.every(file => index.includes(file)));
  const { context } = gallery();
  for (let visit = 0; visit < 3; visit++) {
    assert.deepEqual(Array.from(context.selectHomeGallery(), item => item.index), [3, 2, 1]);
  }
});

test('missing curated images are filled from gallery order without duplicates', () => {
  const { context } = gallery(['fallback-a.jpg', preferred[1], 'fallback-b.jpg', 'fallback-c.jpg']);
  assert.deepEqual(Array.from(context.selectHomeGallery(), item => item.index), [1, 0, 2]);
  assert.equal(gallery(['only.jpg']).context.selectHomeGallery().length, 1);
  assert.equal(gallery([]).context.selectHomeGallery().length, 0);
});

test('three static previews retain metadata, translated captions and the correct lightbox targets', async () => {
  for (const lang of ['zh', 'en', 'ko']) {
    const { context, gal, images, buttons, opened } = gallery(undefined, lang);
    await context.renderHomeGallery(1);
    assert.equal((gal.innerHTML.match(/class="gal-item"/g) || []).length, 3);
    assert.equal((gal.innerHTML.match(/loading="lazy" decoding="async"/g) || []).length, 3);
    assert.doesNotMatch(gal.innerHTML, /gal-track|gal-set|images\/gallery\//);
    assert.equal(gal.attributes['aria-busy'], 'false');
    for (const index of [3, 2, 1]) {
      assert.ok(gal.innerHTML.includes(images[index].preview));
      assert.ok(gal.innerHTML.includes(`width="${images[index].width}" height="${images[index].height}"`));
    }
    const caption = featuredGallery[0][lang === 'zh' ? 'caption' : lang === 'en' ? 'captionEn' : 'captionKo'];
    assert.ok(gal.innerHTML.includes(caption));
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
      ? { ok: ++indexRequests > 1, status: 503, json: async () => preferred }
      : { ok: true, json: async () => ({ items: {} }) },
  });
  vm.runInContext(source('loadGallery'), context);
  assert.equal(await context.loadGallery(), false);
  assert.equal(context.galleryLoaded, false);
  assert.equal(await context.loadGallery(), true);
  assert.equal(context.DATA.gallery.length, 3);
  assert.equal(await context.loadGallery(), true);
  assert.equal(indexRequests, 2);
});
