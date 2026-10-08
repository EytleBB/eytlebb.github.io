const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
const source = main.match(/async function renderGallery\(\) \{[\s\S]*?\n\}/)[0];

function gallery(images, loadGallery = async () => true) {
  const nodes = images.map((_, index) => ({
    dataset: { idx: String(index) }, listeners: {},
    addEventListener(type, handler) { this.listeners[type] = handler; },
    click() { this.listeners.click(); },
  }));
  const opened = [];
  const context = vm.createContext({
    DATA: { gallery: images }, stageRenderEpoch: 1, stage: { innerHTML: '' },
    loadGallery, sectionHeading: label => `<h1>${label}</h1>`, t: label => label,
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;'),
    placeholder: label => label, enhanceMotion() {},
    document: { getElementById: () => ({ querySelectorAll: () => nodes }) },
    openLightbox: index => opened.push(index),
  });
  vm.runInContext(source, context);
  return { context, nodes, opened, render: () => context.renderGallery() };
}

test('gallery reserves every picture before downloads, with lazy loading and known proportions', async () => {
  const images = Array.from({ length: 77 }, (_, i) => ({ src: `original-${i}.jpg`, preview: `preview-${i}.webp`, width: 600, height: 900 }));
  const h = gallery(images);
  await h.render();
  const html = h.context.stage.innerHTML;
  assert.equal((html.match(/<img /g) || []).length, images.length);
  assert.equal((html.match(/loading="lazy"/g) || []).length, images.length);
  assert.equal((html.match(/width="600" height="900"/g) || []).length, images.length);
  assert.equal((html.match(/--gallery-ratio:600 \/ 900/g) || []).length, images.length);
  assert.match(html, /preview-76.webp/);
  h.nodes[76].click();
  let prevented = false;
  h.nodes[30].listeners.keydown({ key: ' ', preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.deepEqual(h.opened, [76, 30]);
});

test('missing or invalid dimensions reserve a stable square instead of collapsing', async () => {
  const images = [{}, { width: -4, height: 3 }, { width: Infinity, height: 3 }, { width: 3, height: 0 }].map(size => ({ src: 'original.jpg', ...size }));
  const h = gallery(images);
  await h.render();
  assert.equal((h.context.stage.innerHTML.match(/--gallery-ratio:1 \/ 1/g) || []).length, images.length);
  assert.match(h.context.stage.innerHTML, /src="original.jpg"/);
});

test('late gallery data does not replace a newer section', async () => {
  let finish;
  const h = gallery([{ src: 'original.jpg' }], () => new Promise(resolve => { finish = resolve; }));
  const rendering = h.render();
  h.context.stageRenderEpoch++;
  h.context.stage.innerHTML = 'New section';
  finish(true);
  await rendering;
  assert.equal(h.context.stage.innerHTML, 'New section');
});
