const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/museum-knife.js'), 'utf8');
// Exercise the shipped pose/state methods without allocating a GPU context.
const motionSource = source.slice(0, source.indexOf('const KNIFE_MODEL_URL'));
const { KnifeDemo, DRAW_ANIMATION } = vm.runInNewContext(`${motionSource}\n({ KnifeDemo, DRAW_ANIMATION });`);
function knife(reduceMotion = false) {
  return Object.assign(Object.create(KnifeDemo.prototype), {
    clip: DRAW_ANIMATION, loaded: true, state: 'idle', time: 0, idleTime: 2.3,
    paused: false, reduceMotion, speed: 1, count: 0, pendingDraw: false, pendingInspect: false,
  });
}
function equalPose(a, b) {
  for (const field of ['p', 'r']) for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(a[field][i] - b[field][i]) < 1e-9, `${field}[${i}] changed across a transition`);
  }
}
function advance(demo, seconds, fps = 60) {
  for (let i = 0; i < Math.ceil(seconds * fps); i++) demo.update(1 / fps);
}

test('inspection starts at the visible pose, shows both faces and returns to rest at different frame rates', () => {
  for (const fps of [30, 60, 144]) {
    const demo = knife();
    const before = demo.pose();
    demo.inspect();
    equalPose(demo.pose(), before);
    const angles = [];
    while (demo.state === 'inspecting') {
      const pose = demo.pose();
      assert.ok([...pose.p, ...pose.r].every(Number.isFinite));
      angles.push(pose.r[0]);
      demo.update(1 / fps);
    }
    assert.ok(Math.max(...angles) - Math.min(...angles) > 120, 'the wrist must reveal the reverse face');
    assert.equal(demo.state, 'idle');
    equalPose(demo.pose(), demo.sample(demo.clip.duration));
  }
});

test('stowing can interrupt every inspection phase continuously and does not replay it after equipping', () => {
  for (const time of [.05, .6, 1.7, 2.4, 3.3]) {
    const demo = knife();
    demo.inspect();
    advance(demo, time);
    const before = demo.pose();
    demo.holster();
    equalPose(demo.pose(), before);
    advance(demo, .2);
    assert.equal(demo.state, 'hidden');
    demo.triggerDraw();
    advance(demo, .7);
    assert.equal(demo.state, 'idle');
  }
});

test('inspection queues behind drawing, ignores repeated requests and is cancelled by stowing', () => {
  const demo = knife();
  demo.beginDraw();
  demo.inspect();
  advance(demo, .7);
  assert.equal(demo.state, 'inspecting');
  const time = demo.time;
  demo.inspect();
  assert.equal(demo.time, time, 'another F press must not snap the pose to the start');
  demo.holster();
  advance(demo, .2);
  demo.inspect();
  assert.equal(demo.state, 'hidden');
  demo.triggerDraw();
  demo.inspect();
  demo.holster();
  advance(demo, .2);
  demo.triggerDraw();
  advance(demo, .7);
  assert.equal(demo.state, 'idle', 'a cancelled request must not survive the next draw');
});

test('reduced motion uses a small tilt and also returns to the exact rest pose', () => {
  const demo = knife(true);
  const rest = demo.pose();
  demo.inspect();
  while (demo.state === 'inspecting') {
    const pose = demo.pose();
    pose.r.forEach((angle, i) => assert.ok(Math.abs(angle - rest.r[i]) <= 8));
    demo.update(1 / 60);
  }
  equalPose(demo.pose(), rest);
});

test('F during model loading is remembered once and stowing cancels the queued inspection', async () => {
  const controllerSource = source.slice(source.indexOf('export function createMuseumKnifeController'))
    .replace('export function', 'function');
  for (const cancel of [false, true]) {
    let finishFetch, demo, loads = 0;
    const createController = vm.runInNewContext(`${controllerSource}\ncreateMuseumKnifeController;`, {
      KNIFE_MODEL_URL: 'knife.glb', DRAW_ANIMATION, console,
      fetch() { loads++; return new Promise(resolve => { finishFetch = resolve; }); },
      KnifeDemo: class {
        constructor() {
          demo = Object.assign(knife(), { state: 'hidden', render() {} });
          demo.ready = Promise.resolve(demo);
          return demo;
        }
      },
    });
    const controller = createController({});
    controller.inspect();
    assert.equal(loads, 0, 'F with empty hands must not load or equip the model');
    controller.equip();
    controller.inspect();
    controller.inspect();
    if (cancel) { controller.stow(); controller.equip(); }
    finishFetch({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(loads, 1);
    controller.update(.7, true);
    assert.equal(demo.state, cancel ? 'idle' : 'inspecting');
  }
});


test('light and heavy strikes finish at rest at all frame rates, with a longer heavy recovery', () => {
  for (const fps of [30, 60, 144]) {
    const durations = {};
    for (const kind of ['light', 'heavy']) {
      const demo = knife();
      const before = demo.pose();
      assert.equal(demo.attack(kind), true);
      equalPose(demo.pose(), before);
      durations[kind] = demo.attackClip.duration;
      let frames = 0;
      while (demo.state === 'attacking' && frames++ < fps * 2) {
        assert.ok([...demo.pose().p, ...demo.pose().r].every(Number.isFinite));
        demo.update(1 / fps);
      }
      assert.equal(demo.state, 'idle');
      equalPose(demo.pose(), demo.sample(demo.clip.duration));
    }
    assert.ok(durations.heavy > durations.light * 1.5);
  }
});

test('attacks interrupt inspection continuously, cannot restart a swing, and can be stowed at any phase', () => {
  for (const kind of ['light', 'heavy']) for (const inspectTime of [.2, .9, 1.7, 2.4, 3.2]) {
    const demo = knife();
    demo.inspect();
    advance(demo, inspectTime);
    const inspecting = demo.pose();
    assert.equal(demo.attack(kind), true);
    equalPose(demo.pose(), inspecting);
    advance(demo, .1);
    const time = demo.time;
    assert.equal(demo.attack('heavy'), false);
    demo.inspect();
    assert.equal(demo.state, 'attacking');
    assert.equal(demo.time, time);
    const attacking = demo.pose();
    demo.holster();
    equalPose(demo.pose(), attacking);
    advance(demo, .2);
    assert.equal(demo.attack(kind), false);
    demo.triggerDraw();
    assert.equal(demo.attack(kind), false, 'drawing must finish before swinging');
    advance(demo, .7);
    assert.equal(demo.state, 'idle');
  }
});

test('reduced-motion strikes use a small movement and retain separate recovery times', () => {
  for (const kind of ['light', 'heavy']) {
    const demo = knife(true), rest = demo.pose();
    demo.attack(kind);
    while (demo.state === 'attacking') {
      const pose = demo.pose();
      pose.r.forEach((angle, i) => assert.ok(Math.abs(angle - rest.r[i]) < 10));
      pose.p.forEach((v, i) => assert.ok(Math.abs(v - rest.p[i]) < .05));
      demo.update(1 / 60);
    }
    equalPose(demo.pose(), rest);
  }
});

function attackController() {
  let demo, resolveFetch;
  const attacks = [];
  const controllerSource = source.slice(source.indexOf('export function createMuseumKnifeController'))
    .replace('export function', 'function');
  const createController = vm.runInNewContext(`${controllerSource}\ncreateMuseumKnifeController;`, {
    KNIFE_MODEL_URL: 'knife.glb', DRAW_ANIMATION, console,
    fetch: () => new Promise(resolve => { resolveFetch = resolve; }),
    KnifeDemo: class {
      constructor() {
        demo = Object.assign(knife(), {
          state: 'hidden', render() {},
          attack(kind) {
            const accepted = KnifeDemo.prototype.attack.call(this, kind);
            if (accepted) attacks.push(kind);
            return accepted;
          },
        });
        demo.ready = Promise.resolve(demo);
        return demo;
      }
    },
  });
  const controller = createController({});
  return {
    controller, attacks, get demo() { return demo; },
    async load() {
      resolveFetch({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
      await new Promise(resolve => setImmediate(resolve));
    },
    tick(seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) controller.update(1 / 60, true); },
  };
}

test('a quick click while loading/drawing triggers once; stow or input clearing cancels it', async () => {
  for (const cancel of ['none', 'stow', 'clear', 'hidden']) {
    const h = attackController();
    h.controller.setAttackHeld('light', true);
    assert.equal(h.controller.equipped, false);
    h.controller.equip();
    h.controller.setAttackHeld('heavy', true);
    h.controller.setAttackHeld('heavy', false);
    if (cancel === 'stow') { h.controller.stow(); h.controller.equip(); }
    if (cancel === 'clear') h.controller.clearAttackInput();
    if (cancel === 'hidden') h.controller.update(.1, false);
    await h.load();
    h.tick(3);
    assert.deepEqual(h.attacks, cancel === 'none' ? ['heavy'] : []);
    assert.equal(h.demo.state, 'idle');
  }
});

test('held attacks repeat at their own cadence, release stops them, and clicks never build a backlog', async () => {
  const counts = {};
  for (const kind of ['light', 'heavy']) {
    const h = attackController();
    h.controller.equip();
    await h.load();
    h.tick(.7);
    h.controller.setAttackHeld(kind, true);
    h.tick(2);
    counts[kind] = h.attacks.length;
    h.controller.setAttackHeld(kind, false);
    // Click during a swing, then release: no stored attacks after recovery.
    for (let i = 0; i < 4; i++) {
      h.controller.setAttackHeld(kind, true);
      h.controller.setAttackHeld(kind, false);
    }
    h.tick(2);
    assert.equal(h.attacks.length, counts[kind]);
    assert.equal(h.demo.state, 'idle');
    h.controller.setAttackHeld(kind, true);
    h.controller.stow();
    h.tick(.3);
    h.controller.equip();
    h.tick(2);
    assert.equal(h.attacks.length, counts[kind] + 1);
  }
  assert.ok(counts.light > counts.heavy && counts.heavy >= 2);
});
