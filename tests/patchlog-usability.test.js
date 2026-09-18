const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

function loadFunctions(context, names) {
  for (const name of names) {
    const match = main.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[^\\n]*\\}`, 'm'))
      || main.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^\\}`, 'm'));
    assert.ok(match, `${name} exists`);
    vm.runInContext(match[0], context);
  }
  return context;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function dateContext(dates) {
  return loadFunctions(vm.createContext({ DATA: { patchlog: dates } }), [
    'fmtDate', 'getLogDates', 'buildPatchlogIndex'
  ]);
}

test('archive dates are unique and newest first without changing the loaded index', () => {
  const dates = ['2024-02-29', '2026-08-01', '2025-01-02', '2024-02-29', '2026-01-01'];
  const original = [...dates];
  const context = dateContext(dates);

  assert.deepEqual(plain(context.getLogDates()), [
    '2026-08-01', '2026-01-01', '2025-01-02', '2024-02-29'
  ]);
  assert.deepEqual(dates, original);
});

test('archive dates exclude malformed values and impossible calendar days', () => {
  const context = dateContext([
    '2024-02-29', '2000-02-29', '1900-02-28',
    '2025-02-29', '1900-02-29', '2026-02-30', '2026-04-31',
    '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32',
    '2026-1-01', '2026-01-1', ' 2026-01-01', '2026-01-01 ',
    '2026-01-01.txt', '../2026-01-01', '2026-01-01/extra',
    '2026-01-01T00:00:00Z', '', null, undefined, 20260101, {}, ['2026-01-01']
  ]);

  assert.deepEqual(plain(context.getLogDates()), [
    '2024-02-29', '2000-02-29', '1900-02-28'
  ]);
});

test('archive grouping keeps sparse months and years in chronological order with accurate counts', () => {
  const context = dateContext([
    '2024-02-29', '2026-08-01', '2025-12-31', '2026-03-18',
    '2024-02-01', '2026-03-30', '2026-03-18', '2026-02-30'
  ]);

  assert.deepEqual(plain(context.buildPatchlogIndex()), [
    {
      year: 2026,
      count: 3,
      months: [
        { month: 7, dates: ['2026-08-01'] },
        { month: 2, dates: ['2026-03-30', '2026-03-18'] }
      ]
    },
    { year: 2025, count: 1, months: [{ month: 11, dates: ['2025-12-31'] }] },
    { year: 2024, count: 2, months: [{ month: 1, dates: ['2024-02-29', '2024-02-01'] }] }
  ]);
});

test('an empty archive has no dates or year groups', () => {
  const context = dateContext([]);
  assert.deepEqual(plain(context.getLogDates()), []);
  assert.deepEqual(plain(context.buildPatchlogIndex()), []);
});

function loaderContext(fetch) {
  return loadFunctions(vm.createContext({
    DATA: { patchlog: ['2025-12-31'] },
    patchlogLoadError: false,
    logLoadRequest: 0,
    fetch
  }), ['fmtDate', 'getLogDates', 'loadLogs']);
}

test('loading a valid index replaces previous entries and reports success', async () => {
  const context = loaderContext(async () => ({
    ok: true,
    json: async () => ['2026-08-01', '2026-07-29']
  }));

  assert.equal(await context.loadLogs(), true);
  assert.deepEqual(plain(context.DATA.patchlog), ['2026-08-01', '2026-07-29']);
});

test('a successful empty index clears previous entries and reports success', async () => {
  const context = loaderContext(async () => ({ ok: true, json: async () => [] }));

  assert.equal(await context.loadLogs(), true);
  assert.deepEqual(plain(context.DATA.patchlog), []);
});

test('network, HTTP, JSON and schema failures preserve the last usable index', async t => {
  const cases = [
    ['network error', async () => { throw new Error('Network unavailable'); }],
    ['HTTP error', async () => ({ ok: false, status: 503, json: async () => [] })],
    ['invalid JSON', async () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } })],
    ...[null, {}, '2026-08-01', 42].map(value => [
      `non-array index ${JSON.stringify(value)}`,
      async () => ({ ok: true, json: async () => value })
    ])
  ];

  for (const [name, fetch] of cases) {
    await t.test(name, async () => {
      const context = loaderContext(fetch);
      assert.equal(await context.loadLogs(), false);
      assert.deepEqual(plain(context.DATA.patchlog), ['2025-12-31']);
    });
  }
});

test('retrying an index load can recover after a failed request', async () => {
  let attempts = 0;
  const context = loaderContext(async () => {
    if (++attempts === 1) throw new Error('Temporary network error');
    return { ok: true, json: async () => ['2026-08-01'] };
  });

  assert.equal(await context.loadLogs(), false);
  assert.deepEqual(plain(context.DATA.patchlog), ['2025-12-31']);
  assert.equal(await context.loadLogs(), true);
  assert.deepEqual(plain(context.DATA.patchlog), ['2026-08-01']);
});

test('an older failed index request cannot mark a newer successful list as failed', async () => {
  const requests = [];
  const context = loaderContext(() => {
    const pending = deferred();
    requests.push(pending);
    return pending.promise;
  });
  const older = context.loadLogs();
  const newer = context.loadLogs();
  requests[1].resolve({ ok: true, json: async () => ['2026-08-01'] });
  assert.equal(await newer, true);
  requests[0].reject(new Error('Earlier request failed'));
  await older;

  assert.deepEqual(plain(context.DATA.patchlog), ['2026-08-01']);
  assert.equal(context.patchlogLoadError, false);
});

test('an older successful index response cannot replace a newer successful list', async () => {
  const requests = [];
  const context = loaderContext(() => {
    const pending = deferred();
    requests.push(pending);
    return pending.promise;
  });
  const older = context.loadLogs();
  const newer = context.loadLogs();
  requests[1].resolve({ ok: true, json: async () => ['2026-08-01'] });
  assert.equal(await newer, true);
  requests[0].resolve({ ok: true, json: async () => ['2026-07-29'] });
  await older;

  assert.deepEqual(plain(context.DATA.patchlog), ['2026-08-01']);
  assert.equal(context.patchlogLoadError, false);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function readerHarness(dates) {
  const document = { activeElement: null };
  function node() {
    const attributes = new Map();
    const listeners = new Map();
    return {
      textContent: '', dataset: {}, disabled: false, hidden: false, scrollTop: 0,
      children: new Map(),
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      removeAttribute(name) { attributes.delete(name); },
      scrollTo({ top }) { this.scrollTop = top; },
      querySelector(selector) { return this.children.get(selector) || null; },
      contains(target) {
        return this === target || [...this.children.values()].some(child => child.contains(target));
      },
      cloneNode(deep) {
        const clone = node();
        for (const [name, value] of attributes) clone.setAttribute(name, value);
        clone.textContent = this.textContent;
        clone.dataset = { ...this.dataset };
        clone.disabled = this.disabled;
        clone.hidden = this.hidden;
        if (deep) {
          for (const [selector, child] of this.children) clone.children.set(selector, child.cloneNode(true));
        }
        return clone;
      },
      replaceWith(replacement) {
        assert.equal(this, scroll, 'only the current scroll region is replaced');
        if (this.contains(document.activeElement)) document.activeElement = null;
        scroll = replacement;
        for (const id of ['r-body', 'r-status', 'r-retry']) nodes[id] = scroll.querySelector(`#${id}`);
      },
      addEventListener(name, listener) { listeners.set(name, listener); },
      click() { if (!this.disabled) return listeners.get('click')?.(); },
      focus() { document.activeElement = this; },
      matches() { return false; }
    };
  }
  const nodes = Object.fromEntries([
    'ov', 'r-date', 'r-position', 'r-body', 'r-status', 'r-retry', 'r-older', 'r-newer'
  ].map(id => [id, node()]));
  let scroll = node();
  for (const id of ['r-body', 'r-status', 'r-retry']) scroll.children.set(`#${id}`, nodes[id]);
  nodes.ov.querySelector = selector => selector === '.r-scroll' ? scroll : null;
  for (const id of ['r-older', 'r-newer']) {
    const time = node();
    nodes[id].children.set('time', time);
  }
  document.activeElement = node();
  document.getElementById = id => nodes[id];
  let onClose;
  let mounts = 0;
  const requests = [];
  const context = loadFunctions(vm.createContext({
    DATA: { patchlog: dates },
    activeSection: 'about',
    lastReadLog: null,
    AbortController,
    document,
    t: zh => zh,
    stage: { querySelector() { return null; } },
    mountOverlay(_html, _className, closeCallback) {
      mounts++;
      onClose = closeCallback;
    },
    fetch(url, options) {
      const pending = deferred();
      requests.push({ url, options, ...pending });
      return pending.promise;
    }
  }), ['fmtDate', 'getLogDates', 'fmtDot', 'normalizeLogBody', 'openReader']);
  return {
    context, nodes, requests, document,
    get scroll() { return scroll; },
    get mounts() { return mounts; },
    close() { onClose?.(false); },
    respond(index, body, ok = true) {
      requests[index].resolve({ ok, status: ok ? 200 : 503, text: async () => body });
    }
  };
}

test('reader navigation crosses month and year boundaries, resets scrolling and keeps one overlay', async () => {
  const reader = readerHarness(['2026-08-01', '2026-07-29', '2025-12-31']);
  const opening = reader.context.openReader('2026-08-01');
  reader.respond(0, 'Latest entry');
  await opening;

  assert.equal(reader.nodes['r-newer'].disabled, true);
  assert.equal(reader.nodes['r-older'].disabled, false);
  assert.equal(reader.nodes['r-older'].dataset.date, '2026-07-29');
  reader.scroll.scrollTop = 700;
  const previousScroll = reader.scroll;
  const originalDate = reader.nodes['r-date'];
  const originalNavigation = reader.nodes['r-older'];
  const older = reader.nodes['r-older'].click();
  assert.notEqual(reader.scroll, previousScroll);
  previousScroll.scrollTop = 900;
  assert.equal(reader.scroll.scrollTop, 0);
  reader.respond(1, '  Keep my indentation.  \n');
  await older;
  assert.equal(reader.nodes['r-body'].textContent, '  Keep my indentation.');
  assert.equal(reader.nodes['r-newer'].dataset.date, '2026-08-01');
  assert.equal(reader.nodes['r-older'].dataset.date, '2025-12-31');

  reader.nodes['r-older'].focus();
  const oldest = reader.nodes['r-older'].click();
  reader.respond(2, 'Oldest entry');
  await oldest;
  assert.equal(reader.nodes['r-older'].disabled, true);
  assert.equal(reader.nodes['r-newer'].disabled, false);
  assert.equal(reader.nodes['r-date'].getAttribute('datetime'), '2025-12-31');
  assert.equal(reader.document.activeElement, reader.scroll);
  assert.equal(reader.mounts, 1);
  assert.equal(reader.nodes['r-date'], originalDate);
  assert.equal(reader.nodes['r-older'], originalNavigation);
});

test('a single-entry reader disables both adjacent-entry buttons', async () => {
  const reader = readerHarness(['2026-08-01']);
  const opening = reader.context.openReader('2026-08-01');
  reader.respond(0, 'Only entry');
  await opening;

  assert.equal(reader.nodes['r-older'].disabled, true);
  assert.equal(reader.nodes['r-newer'].disabled, true);
  assert.equal(reader.nodes['r-position'].textContent, '1 / 1');
});

test('an entry finishing loading resets scrolling that continued during the request', async () => {
  const reader = readerHarness(['2026-08-01', '2026-07-29']);
  const opening = reader.context.openReader('2026-08-01');
  reader.respond(0, 'Latest entry');
  await opening;

  reader.scroll.scrollTop = 700;
  const older = reader.nodes['r-older'].click();
  assert.equal(reader.scroll.scrollTop, 0);
  reader.scroll.scrollTop = 200;
  reader.respond(1, 'Selected entry');
  await older;

  assert.equal(reader.scroll.scrollTop, 0);
  assert.equal(reader.nodes['r-body'].textContent, 'Selected entry');
});

test('a slower previous response cannot replace a newer reader selection', async () => {
  const reader = readerHarness(['2026-08-01', '2026-07-29']);
  const opening = reader.context.openReader('2026-08-01');
  const slowText = deferred();
  reader.requests[0].resolve({ ok: true, text: () => slowText.promise });
  await Promise.resolve();

  const older = reader.nodes['r-older'].click();
  assert.equal(reader.requests[0].options.signal.aborted, true);
  reader.respond(1, 'Selected entry');
  await older;
  slowText.resolve('Stale entry');
  await opening;

  assert.equal(reader.nodes['r-body'].textContent, 'Selected entry');
  assert.equal(reader.nodes['r-date'].getAttribute('datetime'), '2026-07-29');
  assert.equal(reader.nodes['r-body'].getAttribute('aria-busy'), 'false');
  assert.equal(reader.context.lastReadLog, '2026-07-29');
});

test('closing the reader aborts its request and ignores a late result', async () => {
  const reader = readerHarness(['2026-08-01']);
  const opening = reader.context.openReader('2026-08-01');
  reader.close();
  assert.equal(reader.requests[0].options.signal.aborted, true);
  reader.respond(0, 'Arrived after closing');
  await opening;

  assert.equal(reader.nodes['r-body'].textContent, '');
  assert.equal(reader.context.lastReadLog, null);
});

test('a failed entry can be retried in the same reader without losing its date', async () => {
  const reader = readerHarness(['2026-08-01']);
  const opening = reader.context.openReader('2026-08-01');
  reader.respond(0, '', false);
  await opening;
  assert.equal(reader.nodes['r-retry'].hidden, false);
  assert.equal(reader.nodes['r-body'].getAttribute('aria-busy'), 'false');
  assert.equal(reader.context.lastReadLog, null);

  reader.nodes['r-retry'].focus();
  const retrying = reader.nodes['r-retry'].click();
  assert.equal(reader.nodes['r-retry'].hidden, true);
  assert.equal(reader.nodes['r-body'].getAttribute('aria-busy'), 'true');
  assert.equal(reader.requests[1].url, './logs/2026-08-01.txt');
  reader.respond(1, 'Recovered entry');
  await retrying;

  assert.equal(reader.nodes['r-body'].textContent, 'Recovered entry');
  assert.equal(reader.nodes['r-status'].textContent, '');
  assert.equal(reader.nodes['r-date'].getAttribute('datetime'), '2026-08-01');
  assert.equal(reader.context.lastReadLog, '2026-08-01');
  assert.equal(reader.document.activeElement, reader.scroll);
  assert.equal(reader.mounts, 1);
});

test('the reader refuses dates that are not in the archive', async () => {
  const reader = readerHarness(['2026-08-01']);
  await reader.context.openReader('../private');
  await reader.context.openReader('2026-07-01');
  assert.equal(reader.mounts, 0);
  assert.equal(reader.requests.length, 0);
});
