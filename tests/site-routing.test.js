const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const main = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');

function app(url) {
  const location = new URL(url, 'https://eytle.cn');
  const entries = [location.href];
  let position = 0;
  const rendered = [];
  const history = {
    pushState(_state, _title, target) {
      location.href = new URL(target, location).href;
      entries.splice(++position, Infinity, location.href);
    },
    replaceState(_state, _title, target) {
      location.href = new URL(target, location).href;
      entries[position] = location.href;
    },
  };
  const context = vm.createContext({
    location, history, stageRenderEpoch: 0, activeSection: 'about',
    closeActiveOverlay: null, stage: {}, enhanceMotion() {}, revealActiveNav() {},
    window: { scrollTo() {} },
    document: { documentElement: { dataset: {} }, querySelectorAll: () => [] },
    ...Object.fromEntries(['About', 'Projects', 'Tools', 'Patchlog', 'Gallery', 'Downloads'].map(name =>
      ['render' + name, () => rendered.push(name.toLowerCase())])),
  });
  vm.runInContext(main.match(/const navMap = [^\n]+/)[0] + '\n' + main.match(/const sectionPaths = Object.freeze\(\{[^]*?\}\);/)[0], context);
  for (const name of ['sectionFromLocation', 'updateSectionUrl', 'restoreLocationSection', 'go']) {
    vm.runInContext(main.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[^]*?\\n\\}`))[0], context);
  }
  return { context, location, entries, rendered,
    travel(delta) { position += delta; location.href = entries[position]; context.restoreLocationSection(); },
  };
}

test('direct clean URLs select their page, including the mobile gallery', () => {
  for (const section of ['about', 'projects', 'tools', 'patchlog', 'gallery', 'downloads']) {
    for (const suffix of ['', '?source=shared']) {
      const { context } = app((section === 'about' ? '/' : '/' + section) + suffix);
      assert.equal(context.sectionFromLocation(), section);
    }
  }
});

test('old filename and hash links normalize without losing the section or query', () => {
  for (const prefix of ['/', '/index.html']) {
    for (const section of ['about', 'projects', 'tools', 'patchlog', 'gallery', 'downloads']) {
      const h = app(prefix + '?source=bookmark#' + section);
      h.context.restoreLocationSection();
      assert.equal(h.location.pathname, section === 'about' ? '/' : '/' + section);
      assert.equal(h.location.search, '?source=bookmark');
      assert.equal(h.location.hash, '');
      assert.equal(h.rendered.at(-1), section);
      assert.equal(h.entries.length, 1);
    }
  }
});

test('navigation supports back and forward without creating duplicate history entries', () => {
  const h = app('/');
  h.context.go('projects');
  h.context.go('tools');
  assert.equal(h.entries.length, 3);
  h.travel(-1);
  assert.equal(h.context.activeSection, 'projects');
  assert.equal(h.location.pathname, '/projects');
  h.travel(-1);
  assert.equal(h.context.activeSection, 'about');
  h.travel(1);
  assert.equal(h.context.activeSection, 'projects');
  assert.equal(h.entries.length, 3);
});

test('re-rendering a section does not add history; trailing slashes normalize', () => {
  const h = app('/tools/?source=shared');
  h.context.restoreLocationSection();
  assert.equal(h.location.pathname, '/tools');
  h.context.go('tools', { replace: true });
  h.context.go('tools');
  assert.equal(h.entries.length, 1);
  assert.equal(h.location.search, '?source=shared');
});
