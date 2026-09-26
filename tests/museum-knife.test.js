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
