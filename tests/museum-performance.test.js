const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const performanceModule = import('../js/museum-performance.js');

test('presentation caps preserve the requested 60, 90, or 120 Hz cadence on a 180 Hz display', async () => {
  const { createMuseumFrameScheduler } = await performanceModule;
  for (const fps of [60, 90, 120]) {
    const scheduler = createMuseumFrameScheduler({ fps });
    let rendered = 0;
    for (let frame = 0; frame < 1800; frame++) {
      if (scheduler.shouldRender({ now: frame * 1000 / 180 })) rendered++;
    }
    assert.ok(Math.abs(rendered - fps * 10) <= 1, `${fps} Hz rendered ${rendered} frames`);
  }
});

test('a lower refresh-rate display continues rendering every available frame', async () => {
  const { createMuseumFrameScheduler } = await performanceModule;
  const scheduler = createMuseumFrameScheduler({ fps: 120 });
  for (let frame = 0; frame < 600; frame++) {
    assert.equal(scheduler.shouldRender({ now: frame * 1000 / 60 }), true);
  }
});

test('paused scenes render once and wait for explicit invalidation', async () => {
  const { createMuseumFrameScheduler } = await performanceModule;
  const scheduler = createMuseumFrameScheduler();
  assert.equal(scheduler.shouldRender({ now: 0, active: false }), true);
  assert.equal(scheduler.shouldRender({ now: 17, active: false }), false);
  assert.equal(scheduler.shouldRender({ now: 5000, active: false }), false);
  scheduler.requestFrame();
  assert.equal(scheduler.shouldRender({ now: 5001, active: false }), true);
  assert.equal(scheduler.shouldRender({ now: 6000, active: false }), false);
});

test('hidden scenes never render, even when a pending static frame is requested', async () => {
  const { createMuseumFrameScheduler } = await performanceModule;
  const scheduler = createMuseumFrameScheduler();
  assert.equal(scheduler.shouldRender({ now: 0, visible: false, force: true }), false);
  scheduler.requestFrame();
  assert.equal(scheduler.shouldRender({ now: 100, visible: false }), false);
  assert.equal(scheduler.shouldRender({ now: 200, active: false, visible: true }), true);
  assert.equal(scheduler.shouldRender({ now: 201, active: false }), false);
});

test('long pauses do not trigger catch-up bursts and resume immediately', async () => {
  const { createMuseumFrameScheduler } = await performanceModule;
  const scheduler = createMuseumFrameScheduler();
  assert.equal(scheduler.shouldRender({ now: 0 }), true);
  assert.equal(scheduler.shouldRender({ now: 50_000 }), true);
  assert.equal(scheduler.shouldRender({ now: 50_001 }), false);
  assert.equal(scheduler.shouldRender({ now: 50_016.7 }), true);
});

test('manual frame-rate changes take effect immediately without accepting arbitrary values', async () => {
  const { createMuseumFrameScheduler } = await performanceModule;
  const scheduler = createMuseumFrameScheduler();
  assert.equal(scheduler.fps, 60);
  scheduler.shouldRender({ now: 0 });
  assert.equal(scheduler.setFrameRate(120), true);
  assert.equal(scheduler.fps, 120);
  assert.equal(scheduler.shouldRender({ now: 1 }), true);
  assert.equal(scheduler.shouldRender({ now: 9.4 }), true);
  assert.equal(scheduler.setFrameRate(30), false);
  assert.equal(scheduler.setFrameRate(NaN), false);
  assert.equal(scheduler.fps, 120);
});

test('forced static draws support resize and fresh assets without restarting animation', async () => {
  const { createMuseumFrameScheduler } = await performanceModule;
  const scheduler = createMuseumFrameScheduler();
  scheduler.shouldRender({ now: 0, active: false });
  assert.equal(scheduler.shouldRender({ now: 1, active: false, force: true }), true);
  assert.equal(scheduler.shouldRender({ now: 100, active: false }), false);
  assert.equal(scheduler.shouldRender({ now: NaN, force: true }), false);
});

// Execute the shipped loop and lifecycle callbacks against a fake renderer.
// These tests exercise integration decisions, not a second copy of that logic.
async function museumLoopHarness() {
  const { createMuseumFrameScheduler } = await performanceModule;
  const source = fs.readFileSync(path.join(__dirname, '../js/museum.js'), 'utf8');
  const section = (start, end) => {
    const from = source.indexOf(start);
    assert.ok(from >= 0, `Missing integration section: ${start}`);
    const to = source.indexOf(end, from);
    assert.ok(to > from, `Missing integration section end: ${end}`);
    return source.slice(from, to);
  };
  const loopSource = section('const updaters = [];', '/* ============================================================');
  const visibilitySource = section("document.addEventListener('visibilitychange'", "canvas.addEventListener('click'");
  const lostSource = section("canvas.addEventListener('webglcontextlost'", 'const scene =');
  const uploadSource = section('function scheduleTextureUpload(', 'function processTextureUploadQueue(');
  const listeners = new Map();
  const state = { now: 0, locked: false, loop: null, renders: 0, uploads: 0, retargets: 0, updates: [] };
  const document = {
    hidden: false, pointerLockElement: null,
    body: { classList: { remove() {} } },
    addEventListener: (name, callback) => listeners.set(name, callback),
    exitPointerLock() { state.locked = false; document.pointerLockElement = null; },
  };
  const canvas = { dataset: {}, addEventListener: (name, callback) => listeners.set(name, callback) };
  const textureUploadQueue = [];
  const sandbox = {
    contextLost: false, focusState: null, createMuseumFrameScheduler, settings: { fps: 60 }, document, canvas,
    performance: { now: () => state.now }, PERF_AUTOWALK: false, PERF_CAPTURE: true,
    isLocked: () => state.locked,
    museumKnife: { update() {} }, destruction: { update() {} },
    renderer: {
      setAnimationLoop: callback => { state.loop = callback; },
      initTexture: () => { state.uploads++; },
      info: { reset() {} },
    },
    textureUploadQueue,
    processChunkRetargetQueue: () => { state.retargets++; return false; },
    processTextureUploadQueue: () => { state.uploads++; },
    renderGalleryFrame: () => { state.renders++; },
    updatePictureSpotPool() {}, fixtureBatch: null, recordPerformanceFrame() {},
    clearInput() {}, cancelFocus() {}, syncMuseumAudioState() {}, fail() {}, enterEl: {},
    pauseVisit() { document.exitPointerLock(); },
    audioListener: { setMasterVolume() {} },
  };
  vm.runInNewContext(`${loopSource}\n${visibilitySource}\n${lostSource}\n${uploadSource}
    globalThis.runtime = { frame, startLoop, requestSceneFrame, resetFrameTiming, scheduleTextureUpload,
      observe: callback => updaters.push(callback) };`, sandbox);
  sandbox.runtime.observe(dt => state.updates.push(dt));
  const tick = now => { state.now = now; if (state.loop) state.loop(); };
  return { ...sandbox.runtime, state, document, canvas, listeners, tick, textureUploadQueue,
    setFocus: phase => { sandbox.focusState = phase ? { phase } : null; } };
}

test('plaque return animation renders unlocked and settles again after returning', async () => {
  const app = await museumLoopHarness();
  app.startLoop();
  app.setFocus('readingPlaque');
  app.tick(0); app.tick(20);
  assert.equal(app.state.updates.length, 0);
  app.setFocus('returning');
  app.tick(40); app.tick(60); app.tick(80);
  assert.equal(app.state.updates.length, 3);
  const rendered = app.state.renders;
  app.setFocus(null);
  app.tick(100); app.tick(120);
  assert.equal(app.state.renders, rendered);
});

test('the real museum loop presents one paused frame, then only explicit scene changes', async () => {
  const app = await museumLoopHarness();
  app.startLoop();
  app.tick(0);
  for (let now = 20; now <= 2000; now += 20) app.tick(now);
  assert.equal(app.state.renders, 1);
  assert.equal(app.state.updates.length, 0);
  assert.ok(app.state.uploads > 1, 'paused uploads can still settle');
  app.requestSceneFrame();
  app.tick(2010);
  assert.equal(app.state.renders, 2);
  app.tick(2100);
  assert.equal(app.state.renders, 2);
});

test('the real museum loop does no hidden upload work and resumes with a fresh delta', async () => {
  const app = await museumLoopHarness();
  app.state.locked = true;
  app.startLoop(); app.tick(0); app.tick(17);
  app.document.hidden = true;
  app.listeners.get('visibilitychange')();
  assert.equal(app.state.loop, null);
  const { renders, uploads, retargets } = app.state;
  app.state.now = 60_000;
  app.frame(); // A callback already dispatched before hiding must also do no work.
  assert.equal(app.state.renders, renders);
  assert.equal(app.state.uploads, uploads);
  assert.equal(app.state.retargets, retargets);
  app.document.hidden = false;
  app.listeners.get('visibilitychange')();
  assert.equal(typeof app.state.loop, 'function');
  app.state.locked = true;
  app.tick(60_001);
  assert.ok(Math.abs(app.state.updates.at(-1) - 1 / 60) < 1e-9);
});

test('WebGL loss cancels queued uploads and cannot restart on visibility changes', async () => {
  const app = await museumLoopHarness();
  app.startLoop(); app.tick(0);
  const pending = app.scheduleTextureUpload(1, {});
  assert.equal(app.textureUploadQueue.length, 1);
  app.listeners.get('webglcontextlost')({ preventDefault() {} });
  assert.equal(app.state.loop, null);
  assert.equal(await pending, false);
  assert.equal(app.textureUploadQueue.length, 0);
  const uploads = app.state.uploads;
  assert.equal(await app.scheduleTextureUpload(2, {}), false);
  assert.equal(app.state.uploads, uploads);
  app.document.hidden = true;
  app.listeners.get('visibilitychange')();
  app.document.hidden = false;
  app.listeners.get('visibilitychange')();
  app.startLoop();
  assert.equal(app.state.loop, null);
});
