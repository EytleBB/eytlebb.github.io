const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const filename = path.resolve(__dirname, '../js/site-icons.js');
const source = fs.readFileSync(filename, 'utf8');
const driverURL = pathToFileURL(path.resolve(__dirname, '../js/vendor/morphicons-1.7.1/dom.js')).href;

function harness({ offline = false } = {}) {
  const listeners = {};
  const motion = { matches: false, addEventListener(_event, callback) { this.change = callback; } };
  const document = { body: {}, hidden: false, addEventListener(event, callback) { listeners[event] = callback; } };
  const window = { matchMedia: () => motion, addEventListener() {} };
  let removed;
  new vm.Script(source, {
    filename,
    importModuleDynamically: offline
      ? async () => { throw new Error('Simulated unavailable module'); }
      : vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  }).runInNewContext({
    window, document,
    MutationObserver: class {
      constructor(callback) { removed = callback; }
      observe() {}
    },
  });
  const api = window.EytleIcons;
  const canonical = name => api.markup(name).match(/<path d="([^"]+)"/)[1];
  function svg(name) {
    const attrs = { d: canonical(name) };
    const path = { getAttribute: key => attrs[key], setAttribute: (key, value) => { attrs[key] = value; } };
    return { dataset: {}, isConnected: true, querySelector: () => path, get d() { return attrs.d; } };
  }
  return {
    api, motion, document, canonical, svg,
    hide() { document.hidden = true; listeners.visibilitychange(); },
    remove(icon) { icon.isConnected = false; removed([{ removedNodes: [icon] }]); },
    async ready() {
      if (!offline) await import(driverURL);
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

function animationClock(t) {
  const frames = new Map();
  let next = 0;
  let time = 0;
  const previous = [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame];
  globalThis.requestAnimationFrame = callback => { frames.set(++next, callback); return next; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  t.after(() => {
    for (const [index, name] of ['requestAnimationFrame', 'cancelAnimationFrame'].entries()) {
      if (previous[index]) globalThis[name] = previous[index];
      else delete globalThis[name];
    }
  });
  return {
    get pending() { return frames.size; },
    step() {
      time += 16;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback(time));
    },
    finish() {
      for (let i = 0; frames.size && i < 240; i++) this.step();
      assert.equal(frames.size, 0, 'animation must stop requesting frames at rest');
    },
  };
}

test('real Morphicons transitions remain finite, interruptible and stop at the latest state', async t => {
  const clock = animationClock(t);
  const h = harness();
  await h.ready();
  for (const pair of [['sun', 'moon'], ['chevron-right', 'chevron-down'], ['plane', 'check'], ['plane', 'retry'], ['chevron-down', 'arrow-down'], ['arrow-right', 'arrow-up-right']]) {
    const icon = h.svg(pair[0]);
    h.api.set(icon, pair[1]);
    assert.equal(clock.pending, 1, 'the actual morph driver schedules a frame');
    clock.step(); clock.step();
    assert.notEqual(icon.d, h.canonical(pair[0]));
    assert.doesNotMatch(icon.d, /NaN|Infinity/);
    h.api.set(icon, pair[0]);
    clock.step();
    h.api.set(icon, pair[1]);
    clock.finish();
    assert.equal(icon.d, h.canonical(pair[1]));
    h.remove(icon);
  }
});

test('reduced motion, hidden tabs and removed stage nodes immediately stop animation', async t => {
  const clock = animationClock(t);
  const h = harness();
  await h.ready();
  const icon = h.svg('sun');
  h.api.set(icon, 'moon');
  clock.step();
  h.motion.matches = true;
  h.motion.change();
  assert.equal(icon.d, h.canonical('moon'));
  assert.equal(clock.pending, 0);
  h.api.set(icon, 'sun');
  assert.equal(icon.d, h.canonical('sun'));
  assert.equal(clock.pending, 0);
  h.motion.matches = false;
  h.api.set(icon, 'moon');
  h.hide();
  assert.equal(icon.d, h.canonical('moon'));
  assert.equal(clock.pending, 0);
  h.document.hidden = false;
  h.api.set(icon, 'sun');
  assert.equal(clock.pending, 1);
  h.remove(icon);
  assert.equal(clock.pending, 0);
});

test('late or unavailable enhancement keeps the latest static icon without replaying old actions', async t => {
  const clock = animationClock(t);
  for (const offline of [false, true]) {
    const h = harness({ offline });
    const icon = h.svg('sun');
    h.api.set(icon, 'moon');
    h.api.set(icon, 'sun');
    await h.ready();
    assert.equal(icon.d, h.canonical('sun'));
    assert.equal(clock.pending, 0);
    if (offline) {
      h.api.set(icon, 'moon');
      assert.equal(icon.d, h.canonical('moon'));
      assert.equal(clock.pending, 0);
    }
    h.remove(icon);
  }
});
