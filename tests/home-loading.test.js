const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function home({ loadLogs = async () => true, loadGallery = async () => true, dates = ['2026-09-22'], language = 0, fetch = async () => ({ ok: true, text: async () => 'A real entry.' }) } = {}) {
  const nodes = new Map();
  let domReads = 0;
  let fetches = 0;
  const node = id => {
    if (!nodes.has(id)) {
      const loading = { textContent: '加载中…' };
      nodes.set(id, {
        innerHTML: '', textContent: '', loading,
        attributes: {}, listeners: {}, dataset: {},
        style: { setProperty() {} },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, handler) { this.listeners[name] = handler; },
        scrollIntoView(options) { this.scrollOptions = options; },
        querySelector(selector) { return selector === '.r-loading' ? loading : null; },
      });
    }
    return nodes.get(id);
  };
  const routes = [];
  let exhibitionVisits = 0;
  const routeButtons = ['patchlog'].map(section => {
    const button = node(`route-${section}`);
    button.dataset.homeSection = section;
    return button;
  });
  const stage = { innerHTML: '', querySelectorAll: () => routeButtons };
  const context = vm.createContext({
    stage,
    stageRenderEpoch: 1,
    DATA: { patchlog: dates, gallery: [{ src: 'original.jpg', preview: 'preview.webp' }] },
    loadLogs, loadGallery,
    fetch: (...args) => { fetches++; return fetch(...args); },
    document: {
      getElementById(id) { domReads++; return node(id); },
      querySelector: () => ({ click() { exhibitionVisits++; } }),
    },
    t: (...labels) => labels[language],
    go: section => routes.push(section),
    REDUCED_MOTION: { matches: false },
    siteIcon: () => '',
    enhanceMotion() {},
    wireMessageForm() {},
    normalizeLogBody: text => text.trimEnd(),
    fmtDot: date => date.replace(/-/g, '.'),
    escapeHtml: text => text,
    selectHomeGallery: () => [{ index: 0 }],
    wireGalleryImages() {},
    cacheGalleryImages() {},
  });
  for (const name of ['renderAbout', 'renderHomeLog', 'renderHomeGallery']) {
    const source = main.match(new RegExp(`async function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
    assert.ok(source, `${name} exists`);
    vm.runInContext(source[0], context);
  }
  return {
    node, stage, routes,
    get exhibitionVisits() { return exhibitionVisits; },
    render: () => context.renderAbout(),
    get domReads() { return domReads; },
    get fetches() { return fetches; },
    leave() { context.stageRenderEpoch++; stage.innerHTML = 'A different page'; domReads = 0; },
  };
}

test('home gallery renders while the log index is still pending', async () => {
  const logs = deferred();
  const h = home({ loadLogs: () => logs.promise });
  const rendering = h.render();
  await nextTurn();
  assert.match(h.node('home-gal').innerHTML, /preview\.webp/);
  assert.equal(h.node('home-plog').loading.textContent, '加载中…');
  assert.equal(h.fetches, 0);
  logs.resolve(true);
  await rendering;
  assert.match(h.node('home-plog').innerHTML, /A real entry\./);
});

test('home log renders while the gallery is still pending', async () => {
  const gallery = deferred();
  const h = home({ loadGallery: () => gallery.promise });
  const rendering = h.render();
  await nextTurn();
  assert.match(h.node('home-plog').innerHTML, /A real entry\./);
  assert.equal(h.node('home-gal').innerHTML, '');
  gallery.resolve();
  await rendering;
  assert.match(h.node('home-gal').innerHTML, /preview\.webp/);
});

test('both pending home loaders leave a newer stage and its nodes untouched', async () => {
  const logs = deferred();
  const gallery = deferred();
  const h = home({ loadLogs: () => logs.promise, loadGallery: () => gallery.promise });
  const rendering = h.render();
  h.leave();
  logs.resolve(true);
  gallery.resolve();
  await rendering;
  assert.equal(h.stage.innerHTML, 'A different page');
  assert.equal(h.domReads, 0);
  assert.equal(h.fetches, 0);
});

test('a pending log body cannot alter the page after navigation', async () => {
  const body = deferred();
  const h = home({ fetch: () => body.promise });
  const rendering = h.render();
  await nextTurn();
  const card = h.node('home-plog');
  h.leave();
  body.resolve({ ok: true, text: async () => 'Late entry' });
  await rendering;
  assert.equal(h.stage.innerHTML, 'A different page');
  assert.equal(h.domReads, 0);
  assert.equal(card.innerHTML, '');
});

test('failed home log indexes are distinct from a successfully loaded empty archive', async () => {
  for (const dates of [[], ['2026-09-22']]) {
    const h = home({ loadLogs: async () => false, dates });
    await h.render();
    assert.match(h.node('home-plog').loading.textContent, /无法加载/);
    assert.doesNotMatch(h.node('home-plog').loading.textContent, /暂无日志/);
    assert.equal(h.fetches, 0, 'a failed index must not silently display a cached entry');
    assert.match(h.node('home-gal').innerHTML, /preview\.webp/);
  }
  const empty = home({ dates: [] });
  await empty.render();
  assert.equal(empty.node('home-plog').loading.textContent, '暂无日志');
  assert.equal(empty.fetches, 0);
});

test('HTTP and network failures show an unavailable log preview with a reader entry point', async () => {
  for (const fetch of [async () => ({ ok: false }), async () => { throw new Error('Offline'); }]) {
    const h = home({ fetch });
    await h.render();
    assert.match(h.node('home-plog').innerHTML, /暂时无法读取摘要/);
    assert.match(h.node('home-plog').innerHTML, /id="home-plog-more"/);
    assert.doesNotMatch(h.node('home-plog').innerHTML, /class="txt"/);
    assert.match(h.node('home-gal').innerHTML, /preview\.webp/);
  }
});

test('home shortcuts use existing navigation and keep DOM reading order in every language', async () => {
  for (const language of [0, 1, 2]) {
    const h = home({ language });
    await h.render();
    const sections = ['class="col-left"', 'id="home-plog"', 'class="panel message-card"', 'class="col-right"', 'id="home-gal"'];
    const positions = sections.map(section => h.stage.innerHTML.indexOf(section));
    assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
    h.node('route-patchlog').listeners.click();
    assert.deepEqual(h.routes, ['patchlog']);
    h.node('home-exhibition').listeners.click();
    assert.equal(h.exhibitionVisits, 1, 'exhibition entry delegates to the capability-aware navigation');
    h.node('home-explore').listeners.click();
    assert.equal(h.node('home-content').scrollOptions.block, 'start');
  }
});
