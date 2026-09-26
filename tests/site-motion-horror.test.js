const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const forestSource = fs.readFileSync(new URL('../js/forest-scene.js', `file://${__filename}`), 'utf8');
const mainSource = fs.readFileSync(new URL('../js/main.js', `file://${__filename}`), 'utf8');
const motionSource = mainSource.slice(mainSource.indexOf('function siteMotionSuppressed()'), mainSource.indexOf('let themeSwitching = false;'));

function eventTarget() {
  const handlers = new Map();
  return { addEventListener(type, callback) {
    if (!handlers.has(type)) handlers.set(type, []);
    handlers.get(type).push(callback);
  }, emit(type, event = {}) { for (const callback of handlers.get(type) || []) callback(event); } };
}
function classes(...initial) {
  const set = new Set(initial);
  return { add: (...values) => values.forEach(value => set.add(value)), remove: (...values) => values.forEach(value => set.delete(value)), contains: value => set.has(value) };
}
function harness({ horror = false, intersection = true, forest = true } = {}) {
  const frames = new Map(), images = [], mutations = [], intersections = [], calls = { contexts: 0, draws: 0, arcs: 0 };
  let nextFrame = 1;
  const media = Object.assign(eventTarget(), { matches: false });
  const root = { classList: classes(...(horror ? ['site-horror'] : [])), dataset: { theme: 'night', section: 'about' }, clientWidth: 1200 };
  const hero = { getBoundingClientRect: () => ({ top: 0, bottom: 500 }) };
  const stage = Object.assign(eventTarget(), { querySelector: () => hero, contains: () => true });
  const gl = new Proxy({ MAX_VIEWPORT_DIMS: 1, NO_ERROR: 0,
    getParameter: key => key === 1 ? [4096, 4096] : 4096,
    getProgramParameter: () => true, getError: () => 0, isContextLost: () => false,
    createShader: () => ({}), createProgram: () => ({}), createTexture: () => ({}),
    drawArrays: () => calls.draws++,
  }, { get: (object, key) => key in object ? object[key] : () => {} });
  const context2D = new Proxy({ arc: () => calls.arcs++ }, { get: (object, key) => key in object ? object[key] : () => {} });
  const canvas = Object.assign(eventTarget(), { hidden: false, classList: classes(), getContext(type) {
    calls.contexts++; return type === 'webgl2' ? gl : context2D;
  } });
  const document = Object.assign(eventTarget(), { documentElement: root, hidden: false,
    getElementById: id => id === 'stage' ? stage : canvas, querySelector: () => hero });
  const window = Object.assign(eventTarget(), { innerHeight: 800, devicePixelRatio: 1, matchMedia: () => media });
  class IntersectionObserver {
    constructor(callback) { this.callback = callback; intersections.push(this); }
    observe(target) { this.target = target; }
    unobserve() {}
  }
  if (intersection) window.IntersectionObserver = IntersectionObserver;
  class MutationObserver {
    constructor(callback) { this.callback = callback; mutations.push(this); }
    observe(target) { this.target = target; }
  }
  class Image {
    constructor() { this.naturalWidth = 1200; this.naturalHeight = 800; images.push(this); }
  }
  const context = vm.createContext({ window, document, Image, IntersectionObserver, MutationObserver,
    stage, REDUCED_MOTION: media, activeSection: 'about',
    requestAnimationFrame: callback => { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: callback => { frames.set(nextFrame++, callback); },
  });
  if (forest) vm.runInContext(forestSource, context);
  else vm.runInContext(`${motionSource}\ninitAmbientMotion();`, context);
  return { context, root, window, document, stage, hero, canvas, calls, frames, images, mutations, intersections,
    activate() { root.classList.add('site-horror'); window.emit('eytle:horror'); },
    tick(now = 100) { const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback(now)); },
    intersect() { for (const observer of intersections) observer.callback([{ target: hero, isIntersecting: true }]); },
    mutate() { mutations.forEach(observer => observer.callback([])); },
  };
}

test('forest horror activation immediately hides and cancels a running scene without changing the normal theme', () => {
  const h = harness();
  h.images[0].onload(); h.tick();
  assert.equal(h.calls.draws, 1);
  assert.equal(h.canvas.hidden, false);
  assert.equal(h.frames.size, 1);
  h.activate();
  assert.equal(h.canvas.hidden, true);
  assert.equal(h.canvas.classList.contains('ready'), false);
  assert.equal(h.frames.size, 0);
  assert.equal(h.root.dataset.theme, 'night');
  h.root.dataset.section = 'projects'; h.mutate();
  h.root.dataset.section = 'about'; h.mutate(); h.intersect();
  h.document.emit('visibilitychange'); h.window.emit('pageshow'); h.window.emit('resize');
  assert.equal(h.frames.size, 0);
  assert.equal(h.calls.draws, 1);
});

test('an initial horror page allocates no forest WebGL context and late normal images cannot revive it', () => {
  const initial = harness({ horror: true });
  initial.intersect(); initial.mutate(); initial.window.emit('pageshow');
  assert.equal(initial.calls.contexts, 0);
  assert.equal(initial.images.length, 0);
  assert.equal(initial.canvas.hidden, true);
  const late = harness();
  late.activate(); late.images[0].onload();
  assert.equal(late.frames.size, 0);
  assert.equal(late.canvas.hidden, true);
});

test('the no-IntersectionObserver forest scroll frame is cancelled and never rescheduled in horror mode', () => {
  const h = harness({ intersection: false });
  h.images[0].onload(); h.window.emit('scroll');
  assert.equal(h.frames.size, 2, 'one paint and one layout fallback are pending');
  h.activate();
  assert.equal(h.frames.size, 0);
  h.window.emit('scroll');
  assert.equal(h.frames.size, 0);
});

test('ambient motes stop immediately and stay stopped across sections, visibility and BFcache', () => {
  const h = harness({ forest: false });
  h.intersect(); h.tick();
  assert.equal(h.canvas.hidden, false);
  assert.ok(h.calls.arcs > 0);
  const arcs = h.calls.arcs;
  h.activate();
  assert.equal(h.frames.size, 0);
  assert.equal(h.canvas.hidden, true);
  h.context.activeSection = 'projects'; h.mutate();
  h.context.activeSection = 'about'; h.mutate(); h.intersect();
  h.document.emit('visibilitychange'); h.window.emit('pagehide'); h.window.emit('pageshow');
  h.window.emit('resize'); h.tick();
  assert.equal(h.frames.size, 0);
  assert.equal(h.canvas.hidden, true);
  assert.equal(h.calls.arcs, arcs);
  assert.equal(h.root.dataset.theme, 'night');
});

test('normal ambient motion still resumes from BFcache while initial horror remains inert', () => {
  const normal = harness({ forest: false });
  normal.intersect(); normal.tick();
  normal.window.emit('pagehide');
  assert.equal(normal.frames.size, 0);
  assert.equal(normal.canvas.hidden, true);
  normal.window.emit('pageshow');
  assert.equal(normal.frames.size, 1);
  assert.equal(normal.canvas.hidden, false);
  const horror = harness({ forest: false, horror: true });
  horror.intersect(); horror.window.emit('pageshow');
  assert.equal(horror.frames.size, 0);
  assert.equal(horror.canvas.hidden, true);
});

test('horror mode cancels queued surface highlights and suppresses new reveals and normal artwork preloads', () => {
  const h = harness({ forest: false });
  vm.runInContext('initSurfaceLight();', h.context);
  let writes = 0;
  const surface = { getBoundingClientRect: () => ({ left: 0, top: 0 }), style: { setProperty: () => writes++ } };
  const pointer = { target: { closest: () => surface }, clientX: 100, clientY: 100 };
  h.stage.emit('pointermove', pointer);
  assert.equal(h.frames.size, 1);
  h.activate(); h.tick();
  assert.equal(writes, 0);
  h.stage.emit('pointermove', pointer);
  assert.equal(h.frames.size, 0);
  h.context.revealRoot = { querySelectorAll: () => { throw new Error('horror content must not gain normal reveal classes'); } };
  vm.runInContext('enhanceMotion(revealRoot); preloadThemeArtwork();', h.context);
  assert.equal(h.images.length, 0);
});
