const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/site-horror-aftereffects.js'), 'utf8');
const schedulerSource = fs.readFileSync(path.join(root, 'js/site-horror-aftereffects-scheduler.js'), 'utf8');
const createSiteAftereffects = vm.runInNewContext(`${source.replace(/^import .*;\n/gm, '')
  .replace('export function', 'function')}\ncreateSiteAftereffects;`);
const createScheduler = vm.runInNewContext(`${schedulerSource.replace(/^export /gm, '')}\ncreateAftereffectsScheduler;`);
const settle = () => new Promise(resolve => setImmediate(resolve));
const COOLDOWN_KEY = 'eytle-horror-aftereffect-cooldown';
const incident = { kind: 'rush', identity: 1, side: 1, duration: 1.3 };

function target() {
  const handlers = new Map();
  return {
    handlers,
    addEventListener(type, callback) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(callback);
    },
    removeEventListener(type, callback) {
      const callbacks = handlers.get(type);
      callbacks?.delete(callback);
      if (callbacks?.size === 0) handlers.delete(type);
    },
    emit(type, fields = {}) {
      for (const callback of [...handlers.get(type) || []]) callback({ type, isTrusted: false, ...fields });
    },
  };
}

function clock(start = 1000000) {
  let now = start, id = 0;
  const timers = new Map(), frames = new Map();
  return {
    timers, frames, now: () => now,
    setTimer(callback, delay) { const key = ++id; timers.set(key, { callback, at: now + delay }); return key; },
    clearTimer(key) { timers.delete(key); },
    requestFrame(callback) { const key = ++id; frames.set(key, callback); return key; },
    cancelFrame(key) { frames.delete(key); },
    next() { return [...timers].sort((a, b) => a[1].at - b[1].at)[0]; },
    async advance(ms) {
      const end = now + ms;
      let entry;
      while ((entry = this.next()) && entry[1].at <= end) {
        now = entry[1].at; timers.delete(entry[0]); entry[1].callback(); await settle();
      }
      now = end;
    },
    frame(ms = 100) {
      now += ms;
      const entry = frames.entries().next().value;
      if (entry) { frames.delete(entry[0]); entry[1](now); }
    },
  };
}

function harness({ history = true, full = false, reduced = false, section = 'about', focus = true,
  hidden = false, overlay = false, heroVisible = true, delayed = false, reject = false,
  realScheduler = false, storage = new Map(), locks } = {}) {
  const state = { history, full, focus, overlay, heroVisible };
  const time = clock();
  const audioOwners = [], visualOwners = [], schedulerOwners = [], configurations = [];
  const pendingImports = [], mutations = [], intersections = [], lockCalls = [], storageWrites = [];
  let loads = 0, writeBlocked = false;
  const preference = { ...target(), matches: reduced };
  const stage = {}, overlayRoot = {};
  const hero = { getBoundingClientRect: () => state.heroVisible ? { top: 0, bottom: 600 } : { top: -800, bottom: -20 } };
  const document = { ...target(), hidden,
    documentElement: { dataset: { section } }, hasFocus: () => state.focus,
    querySelector: selector => selector === '.hero' ? hero : selector === '#ov' && state.overlay ? {} : null,
    getElementById: id => id === 'stage' ? stage : id === 'overlay-root' ? overlayRoot : null,
  };
  class Observer {
    constructor(callback, collection) { this.callback = callback; this.targets = new Set(); this.disconnected = false; collection.push(this); }
    observe(element) { this.targets.add(element); }
    unobserve(element) { this.targets.delete(element); }
    disconnect() { this.targets.clear(); this.disconnected = true; }
  }
  const window = { ...target(), innerHeight: 720,
    matchMedia: () => preference, performance: { now: time.now },
    eytleHorror: { hasHistory: () => state.history, isActive: () => state.full },
    navigator: {},
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem(key, value) {
        if (writeBlocked) throw new Error('storage disabled');
        storageWrites.push({ key, value }); storage.set(key, value);
      },
    },
    requestAnimationFrame: time.requestFrame, cancelAnimationFrame: time.cancelFrame,
    setTimeout: time.setTimer, clearTimeout: time.clearTimer,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    dispatchEvent(event) { this.emit(event.type, event); },
    MutationObserver: class extends Observer { constructor(callback) { super(callback, mutations); } },
    IntersectionObserver: class extends Observer { constructor(callback) { super(callback, intersections); } },
  };
  if (locks) window.navigator.locks = { request(name, options, callback) {
    lockCalls.push({ name, options }); return locks(name, options, callback);
  } };
  const module = { createAftereffectsVisual() {
    const owner = { active: false, stops: 0, disposals: 0, shows: [], updates: [],
      show(kind, event) { this.active = true; this.shows.push({ kind, event }); return true; },
      update(seconds) { this.updates.push(seconds); return this.active; },
      stop() { this.stops++; this.active = false; },
      dispose() { this.disposals++; this.active = false; },
    };
    visualOwners.push(owner); return owner;
  } };
  const api = createSiteAftereffects({ window, document,
    makeAudio() {
      const owner = { ready: false, hasScream: false, unlocks: 0, stops: 0, disposals: 0, plays: [],
        unlock() { this.unlocks++; this.ready = this.hasScream = true; return Promise.resolve(true); },
        play(kind, event) { this.plays.push({ kind, event }); return true; },
        stop() { this.stops++; }, dispose() { this.disposals++; },
      };
      audioOwners.push(owner); return owner;
    },
    makeScheduler(configuration) {
      configurations.push(configuration);
      const owner = realScheduler ? createScheduler({ ...configuration,
        random: () => .5, now: time.now, setTimer: time.setTimer, clearTimer: time.clearTimer,
      }) : { running: false, resumes: 0, pauses: 0, disposals: 0,
        resume() { this.resumes++; this.running = configuration.canRun(); },
        pause() { this.pauses++; this.running = false; },
        dispose() { this.disposals++; this.running = false; },
      };
      schedulerOwners.push(owner); return owner;
    },
    loadVisual() {
      loads++;
      if (reject) return Promise.reject(new Error('optional renderer offline'));
      return delayed ? new Promise(resolve => pendingImports.push(() => resolve(module))) : Promise.resolve(module);
    },
  });
  return { api, state, document, window, preference, time, storage, storageWrites, lockCalls,
    audioOwners, visualOwners, schedulerOwners, configurations, mutations, intersections,
    get loads() { return loads; },
    resolveImports() { pendingImports.splice(0).forEach(resolve => resolve()); },
    blockWrites() { writeBlocked = true; },
    mutate(element) { for (const observer of mutations) if (observer.targets.has(element)) observer.callback([]); },
    setSection(value) { document.documentElement.dataset.section = value; this.mutate(document.documentElement); },
    setOverlay(value) { state.overlay = value; this.mutate(overlayRoot); },
    setHeroVisible(value) {
      state.heroVisible = value;
      for (const observer of intersections) observer.callback([{ target: hero, isIntersecting: value }]);
    },
  };
}

test('ordinary, full horror, reduced motion and non-foreground pages allocate no incident resources or dynamic imports', async () => {
  for (const options of [{ history: false }, { full: true }, { reduced: true }, { section: 'gallery' },
    { focus: false }, { hidden: true }, { overlay: true }, { heroVisible: false }]) {
    const h = harness(options);
    h.window.emit('pointerdown', { isTrusted: true }); h.api.sync(); await settle();
    assert.equal(h.loads, 0, JSON.stringify(options));
    assert.equal(h.audioOwners.length, 0);
    assert.equal(h.visualOwners.length, 0);
    assert.equal(h.schedulerOwners.length, 0);
    assert.equal(h.time.timers.size, 0); assert.equal(h.time.frames.size, 0);
    h.api.dispose();
  }
});

test('late visual imports cannot create owners while away or after disposal, and foreground restoration reuses the module', async () => {
  const h = harness({ delayed: true });
  assert.equal(h.loads, 1); assert.equal(h.audioOwners[0].unlocks, 0);
  h.window.emit('pagehide'); h.resolveImports(); await settle();
  assert.equal(h.visualOwners.length, 0); assert.equal(h.schedulerOwners.length, 0);
  h.window.emit('pageshow'); await settle();
  assert.equal(h.loads, 1); assert.equal(h.visualOwners.length, 1); assert.equal(h.schedulerOwners.length, 1);
  h.api.dispose();
  const disposed = harness({ delayed: true });
  disposed.api.dispose(); disposed.resolveImports(); await settle();
  assert.equal(disposed.visualOwners.length, 0); assert.equal(disposed.schedulerOwners.length, 0);
  assert.equal(disposed.audioOwners[0].disposals, 1);
});

test('only an eligible trusted pointer or ordinary key gesture unlocks audio in the original event stack', async () => {
  const h = harness(); await settle();
  const audio = h.audioOwners[0];
  for (const [type, fields] of [['pointerdown', {}], ['keydown', { key: 'a' }],
    ['pointerdown', { isTrusted: true, ctrlKey: true }], ['pointerdown', { isTrusted: true, metaKey: true }],
    ['keydown', { isTrusted: true, key: 'a', repeat: true }], ['keydown', { isTrusted: true, key: 'Escape' }],
    ['keydown', { isTrusted: true, key: 'Shift' }], ['keydown', { isTrusted: true, key: 'a', altKey: true }]]) {
    h.window.emit(type, fields);
  }
  assert.equal(audio.unlocks, 0); assert.equal(h.configurations[0].getAudioReady(), false);
  h.window.emit('pointerdown', { isTrusted: true });
  assert.equal(audio.unlocks, 1, 'unlock occurs synchronously in the gesture callback');
  assert.equal(h.configurations[0].getAudioReady(), true);
  h.window.emit('keydown', { isTrusted: true, key: 'Enter' }); assert.equal(audio.unlocks, 2);
  h.state.focus = false; h.window.emit('blur');
  h.window.emit('pointerdown', { isTrusted: true }); assert.equal(audio.unlocks, 2);
  h.api.dispose();
});

test('every loss of eligibility immediately stops sound, visuals, event timeout and animation callbacks', async () => {
  const changes = {
    blur: h => { h.state.focus = false; h.window.emit('blur'); },
    section: h => h.setSection('patchlog'), overlay: h => h.setOverlay(true),
    hidden: h => { h.document.hidden = true; h.document.emit('visibilitychange'); },
    history: h => { h.state.history = false; h.window.emit('eytle:aftereffects'); },
    full: h => { h.state.full = true; h.window.emit('eytle:horror'); },
    reduced: h => { h.preference.matches = true; h.preference.emit('change'); },
    hero: h => h.setHeroVisible(false), pagehide: h => h.window.emit('pagehide'),
  };
  for (const [name, change] of Object.entries(changes)) {
    const h = harness(); await settle();
    h.configurations[0].onEvent(incident);
    assert.equal(h.visualOwners[0].active, true);
    assert.equal(h.time.frames.size, 1); assert.equal(h.time.timers.size, 1);
    const audioStops = h.audioOwners[0].stops;
    change(h);
    assert.equal(h.visualOwners[0].active, false, name);
    assert.ok(h.audioOwners[0].stops > audioStops, name);
    assert.equal(h.schedulerOwners[0].running, false, name);
    assert.equal(h.time.frames.size, 0); assert.equal(h.time.timers.size, 0);
    h.configurations[0].onEvent(incident);
    assert.equal(h.visualOwners[0].shows.length, 1, `${name}: a stale incident cannot restart`);
    h.api.dispose();
  }
});

test('visual and audio-only incidents own just their required callbacks and always terminate', async () => {
  for (const kind of ['glimpse', 'reflection', 'rush', 'step', 'whisper']) {
    const h = harness(); await settle();
    h.configurations[0].onEvent({ ...incident, kind });
    const visible = ['glimpse', 'reflection', 'rush'].includes(kind);
    assert.equal(h.visualOwners[0].shows.length, visible ? 1 : 0);
    assert.equal(h.time.frames.size, visible ? 1 : 0);
    const audioKind = kind === 'rush' ? 'scream' : ['step', 'whisper'].includes(kind) ? kind : null;
    assert.deepEqual(h.audioOwners[0].plays.map(play => play.kind), audioKind ? [audioKind] : []);
    if (visible) { h.time.frame(100); assert.ok(h.visualOwners[0].updates[0] > 0); }
    await h.time.advance(1400);
    assert.equal(h.visualOwners[0].active, false);
    assert.equal(h.time.frames.size, 0); assert.equal(h.time.timers.size, 0);
    h.api.dispose();
  }
});

test('BFCache restoration starts a fresh real scheduler quiet interval instead of replaying elapsed deadlines', async () => {
  const h = harness({ realScheduler: true }); await settle();
  assert.equal(h.time.next()[1].at - h.time.now(), 60000);
  await h.time.advance(59000); h.window.emit('pagehide');
  assert.equal(h.time.timers.size, 0); assert.equal(h.schedulerOwners[0].running, false);
  await h.time.advance(600000); h.window.emit('pageshow');
  assert.equal(h.schedulerOwners.length, 1, 'restoration reuses one scheduler owner');
  assert.equal(h.time.next()[1].at - h.time.now(), 60000);
  await h.time.advance(59999); assert.equal(h.visualOwners[0].shows.length, 0);
  await h.time.advance(1); assert.equal(h.visualOwners[0].shows.length, 1);
  h.api.dispose(); assert.equal(h.time.timers.size, 0); assert.equal(h.time.frames.size, 0);
});

test('dispose releases all owners, observers and subscriptions once and makes future lifecycle events inert', async () => {
  const h = harness(); await settle(); h.configurations[0].onEvent(incident);
  h.api.dispose(); h.api.dispose();
  for (const owner of [...h.audioOwners, ...h.visualOwners, ...h.schedulerOwners]) assert.equal(owner.disposals, 1);
  assert.ok([...h.mutations, ...h.intersections].every(observer => observer.disconnected));
  assert.equal(h.window.handlers.size, 0); assert.equal(h.document.handlers.size, 0); assert.equal(h.preference.handlers.size, 0);
  assert.equal(h.time.timers.size, 0); assert.equal(h.time.frames.size, 0);
  h.api.sync(); h.window.emit('pageshow'); h.window.emit('pointerdown', { isTrusted: true }); await settle();
  assert.equal(h.loads, 1); assert.equal(h.visualOwners.length, 1); assert.equal(h.audioOwners[0].unlocks, 0);
});

test('malformed, incompatible and future shared records do not permanently suppress events', async () => {
  const now = 1000000;
  for (const saved of ['not-json', '{', 'null', JSON.stringify({ version: 2, at: now }),
    JSON.stringify({ version: 1, at: 'invalid' }), JSON.stringify({ version: 1, at: now + 1 }),
    JSON.stringify({ version: 1, at: now + 31536000000 })]) {
    const h = harness({ storage: new Map([[COOLDOWN_KEY, saved]]) }); await settle();
    assert.equal(await h.configurations[0].claimEvent(incident, now), true, saved);
    const record = JSON.parse(h.storage.get(COOLDOWN_KEY));
    assert.equal(record.version, 1); assert.equal(record.at, now); assert.equal(record.kind, 'rush');
    h.api.dispose();
  }
});

test('the actual shared claim enforces the ninety-second cooldown boundary and declines unavailable storage', async () => {
  const h = harness(); await settle(); const claim = h.configurations[0].claimEvent;
  const now = h.time.now();
  assert.equal(await claim(incident, now), true);
  assert.equal(await claim(incident, now + 89999), false);
  assert.equal(h.storageWrites.length, 1);
  assert.equal(await claim({ ...incident, kind: 'glimpse' }, now + 90000), true);
  assert.equal(h.storageWrites.length, 2);
  h.blockWrites(); assert.equal(await claim(incident, now + 180000), false);
  h.api.dispose();
});

test('Web Locks serialize shared claims, decline busy locks and fail quietly if locking is unavailable', async () => {
  let busy = false;
  const locks = async (_name, _options, callback) => {
    if (busy) return callback(null);
    busy = true;
    try { return await callback({ name: 'available' }); } finally { busy = false; }
  };
  const shared = new Map(), first = harness({ storage: shared, locks }), second = harness({ storage: shared, locks });
  await settle();
  const claims = await Promise.all([first.configurations[0].claimEvent(incident, first.time.now()),
    second.configurations[0].claimEvent(incident, second.time.now())]);
  assert.deepEqual(claims, [true, false]);
  assert.equal(first.storageWrites.length + second.storageWrites.length, 1);
  assert.equal(first.lockCalls[0].name, 'eytle-horror-aftereffects');
  assert.equal(first.lockCalls[0].options.ifAvailable, true);
  first.api.dispose(); second.api.dispose();
  const denied = harness({ locks: () => Promise.reject(new Error('unsupported lock')) }); await settle();
  assert.equal(await denied.configurations[0].claimEvent(incident, denied.time.now()), false);
  assert.equal(denied.storageWrites.length, 0); denied.api.dispose();
});

test('a delayed old Web Lock claim cannot reserve cooldown after blur and foreground return', async () => {
  let finish;
  const h = harness({ locks: (_name, _options, callback) => new Promise(resolve => { finish = () => resolve(callback({ name: 'late' })); }) });
  await settle();
  const claim = h.configurations[0].claimEvent(incident, h.time.now());
  h.state.focus = false; h.window.emit('blur');
  h.state.focus = true; h.window.emit('focus');
  assert.equal(h.configurations[0].canRun(), true, 'the returned page is otherwise eligible');
  finish(); assert.equal(await claim, false);
  assert.equal(h.storageWrites.length, 0); assert.equal(h.storage.has(COOLDOWN_KEY), false);
  h.api.dispose();
});

test('an optional renderer load failure does not retry until a later page restoration', async () => {
  const h = harness({ reject: true }); await settle();
  h.api.sync(); h.window.emit('focus'); await settle();
  assert.equal(h.loads, 1); assert.equal(h.visualOwners.length, 0); assert.equal(h.schedulerOwners.length, 0);
  h.window.emit('pagehide'); h.window.emit('pageshow'); await settle();
  assert.equal(h.loads, 2); assert.equal(h.visualOwners.length, 0);
  assert.equal(h.time.timers.size, 0); assert.equal(h.time.frames.size, 0);
  h.api.dispose();
});
