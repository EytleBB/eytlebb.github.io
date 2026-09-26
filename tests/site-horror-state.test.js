const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/site-horror-state.js'), 'utf8');

function page({ storage = new Map(), denyAccess = false, failRead = false, failWrite = false,
  existingClasses = [], theme = 'day' } = {}) {
  const classes = new Set(existingClasses);
  const handlers = new Map();
  const events = [];
  const writes = [];
  let reads = 0, localReads = 0;
  const document = { documentElement: { dataset: { theme }, classList: {
    toggle(name, value) { if (value) classes.add(name); else classes.delete(name); },
  } } };
  class CustomEvent { constructor(type) { this.type = type; } }
  const window = {
    addEventListener(type, callback) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(callback);
    },
    dispatchEvent(event) {
      events.push(event);
      for (const callback of handlers.get(event.type) || []) callback(event);
      return true;
    },
  };
  Object.defineProperty(window, 'sessionStorage', { get() {
    if (denyAccess) throw new Error('Storage access is blocked');
    return {
      getItem(key) { reads++; if (failRead) throw new Error('Read denied'); return storage.get(key) ?? null; },
      setItem(key, value) { if (failWrite) throw new Error('Quota exhausted'); writes.push([key, value]); storage.set(key, value); },
    };
  } });
  Object.defineProperty(window, 'localStorage', { get() { localReads++; throw new Error('Must not access persistent preferences'); } });
  vm.runInNewContext(source, { window, document, CustomEvent });
  return { api: window.eytleHorror, window, document, classes, events, writes, storage,
    get reads() { return reads; }, get localReads() { return localReads; },
    pageshow(persisted = true) { window.dispatchEvent({ type: 'pageshow', persisted }); },
    horrorEvents() { return events.filter(event => event.type === 'eytle:horror'); } };
}

test('a normal visit has no horror class, writes, activation event or persistent preference access', () => {
  const p = page({ existingClasses: ['existing'], theme: 'day' });
  assert.equal(p.api.isActive(), false);
  assert.deepEqual([...p.classes], ['existing']);
  assert.equal(p.reads, 1);
  assert.equal(p.writes.length, 0);
  assert.equal(p.horrorEvents().length, 0);
  assert.equal(p.localReads, 0);
  assert.equal(p.document.documentElement.dataset.theme, 'day');
  p.pageshow(false);
  assert.equal(p.api.isActive(), false);
  assert.equal(p.horrorEvents().length, 0);
});

test('a stored tab activation applies synchronously while other stored values do not activate it', () => {
  for (const value of ['1', 'true', '0', '']) {
    const p = page({ storage: new Map([['eytle-horror', value]]), theme: 'night' });
    assert.equal(p.api.isActive(), value === '1');
    assert.equal(p.classes.has('site-horror'), value === '1');
    assert.equal(p.writes.length, 0);
    assert.equal(p.horrorEvents().length, 0, 'head initialization is readable before runtime subscribes');
    assert.equal(p.document.documentElement.dataset.theme, 'night');
  }
});

test('activation persists exactly the tab flag, updates the class before notification, and is idempotent', () => {
  const p = page({ existingClasses: ['existing'] });
  let observed;
  p.window.addEventListener('eytle:horror', () => {
    observed = { active: p.api.isActive(), classPresent: p.classes.has('site-horror'), saved: p.storage.get('eytle-horror') };
  });
  assert.equal(p.api.activate(), true);
  assert.deepEqual(observed, { active: true, classPresent: true, saved: '1' });
  assert.deepEqual(p.writes, [['eytle-horror', '1']]);
  assert.equal(p.horrorEvents().length, 1);
  p.classes.delete('site-horror');
  assert.equal(p.api.activate(), true);
  assert.equal(p.classes.has('site-horror'), true, 'idempotent calls repair a removed class');
  assert.equal(p.classes.has('existing'), true);
  assert.equal(p.writes.length, 1);
  assert.equal(p.horrorEvents().length, 1);
  assert.equal(p.localReads, 0);
});

test('ordinary cross-page navigation inherits the session flag without changing the theme preference', () => {
  const storage = new Map();
  const museum = page({ storage, theme: 'night' });
  museum.api.activate();
  const home = page({ storage, theme: 'day' });
  assert.equal(home.api.isActive(), true);
  assert.equal(home.classes.has('site-horror'), true);
  assert.equal(home.document.documentElement.dataset.theme, 'day');
  assert.equal(page().api.isActive(), false, 'a separate empty tab session remains normal');
});

test('BFCache pageshow rereads a newly activated tab and wakes the runtime after synchronizing the class', () => {
  const storage = new Map();
  const home = page({ storage });
  const museum = page({ storage });
  museum.api.activate();
  let notifiedWithClass = false;
  home.window.addEventListener('eytle:horror', () => { notifiedWithClass = home.classes.has('site-horror'); });
  home.pageshow();
  assert.equal(home.reads, 2);
  assert.equal(home.api.isActive(), true);
  assert.equal(notifiedWithClass, true);
  assert.equal(home.horrorEvents().length, 1);
  home.classes.delete('site-horror');
  home.pageshow();
  assert.equal(home.classes.has('site-horror'), true);
  assert.equal(home.horrorEvents().length, 2, 'each active pageshow can wake a suspended runtime');
  assert.equal(home.writes.length, 0);
});

test('denied storage access, reads and writes still allow an in-memory activation and BFCache wakeup', () => {
  for (const options of [{ denyAccess: true }, { failRead: true }, { failWrite: true }]) {
    const p = page(options);
    assert.equal(p.api.isActive(), false);
    assert.doesNotThrow(() => p.api.activate());
    assert.equal(p.api.isActive(), true);
    assert.equal(p.classes.has('site-horror'), true);
    assert.equal(p.horrorEvents().length, 1);
    p.classes.delete('site-horror');
    assert.doesNotThrow(() => p.pageshow());
    assert.equal(p.api.isActive(), true, 'failed persistence must not erase this page’s memory state');
    assert.equal(p.classes.has('site-horror'), true);
    assert.equal(p.horrorEvents().length, 2);
    assert.equal(p.localReads, 0);
  }
});
