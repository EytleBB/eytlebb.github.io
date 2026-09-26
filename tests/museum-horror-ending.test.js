const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = file => fs.readFileSync(new URL(`../js/${file}`, `file://${__filename}`), 'utf8')
  .replace(/^import .*?;\n/gm, '').replaceAll('export ', '');

// Small scene double: transforms and resource sharing are observable, and clone
// follows Three's JSON userData copy, including its rejection of cyclic records.
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  setScalar(v) { return this.set(v, v, v); }
  lerpVectors(a, b, t) { return this.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t); }
  applyQuaternion(q) {
    const { x, y, z } = this;
    const tx = 2 * (q.y * z - q.z * y), ty = 2 * (q.z * x - q.x * z), tz = 2 * (q.x * y - q.y * x);
    return this.set(x + q.w * tx + q.y * tz - q.z * ty,
      y + q.w * ty + q.z * tx - q.x * tz,
      z + q.w * tz + q.x * ty - q.y * tx);
  }
}
class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { Object.assign(this, { x, y, z, w }); }
  copy(q) { Object.assign(this, q); return this; }
  clone() { return new Quaternion().copy(this); }
  slerpQuaternions(a, b, t) {
    if (t === 1) return this.copy(b);
    for (const key of ['x', 'y', 'z', 'w']) this[key] = a[key] + (b[key] - a[key]) * t;
    return this;
  }
}
class Group {
  constructor() {
    this.children = []; this.position = new Vector3(); this.quaternion = new Quaternion();
    this.scale = new Vector3(1, 1, 1); this.rotation = { x: 0, y: 0, z: 0 };
    this.userData = {}; this.visible = true;
    this.matrixWorld = { decompose: (position, quaternion, scale) => {
      this.getWorldPosition(position); this.getWorldQuaternion(quaternion); scale.copy(this.scale);
    } };
  }
  add(child) { child.parent = this; this.children.push(child); return this; }
  remove(child) { this.children = this.children.filter(item => item !== child); child.parent = null; }
  traverse(visit) { visit(this); for (const child of this.children) child.traverse(visit); }
  updateWorldMatrix() {}
  getWorldPosition(target) { target.copy(this.position); for (let p = this.parent; p; p = p.parent) target.add(p.position); return target; }
  getWorldQuaternion(target) { return target.copy(this.quaternion); }
  toJSON() { return { object: { userData: this.userData } }; }
  clone(recursive) {
    const copy = this.isMesh ? new Mesh(this.geometry, this.material) : new Group();
    copy.position.copy(this.position); copy.quaternion.copy(this.quaternion); copy.scale.copy(this.scale);
    copy.visible = this.visible; copy.userData = JSON.parse(JSON.stringify(this.userData));
    if (recursive) for (const child of this.children) copy.add(child.clone(true));
    return copy;
  }
}
class Mesh extends Group {
  constructor(geometry, material) { super(); this.isMesh = true; this.geometry = geometry; this.material = material; }
}
class MeshBasicMaterial {
  constructor(options) { Object.assign(this, options); this.disposals = 0; }
  dispose() { this.disposals++; }
}
const geometry = (w = 2, h = 1.8) => ({ disposals: 0, computeBoundingBox() {},
  boundingBox: { getSize: target => target.set(w, h, 0) }, dispose() { this.disposals++; } });

function harness({ startZ = 0, yaw = 0 } = {}) {
  const context = vm.createContext({ THREE: { Vector3, Quaternion, Group, Mesh, MeshBasicMaterial, DoubleSide: 2 } });
  vm.runInContext(`${read('museum-horror-corridor.js')}\n${read('museum-horror-ending.js')}\nthis.create = createMuseumHorrorEnding; this.finaleSeconds = HORROR_FINALE_SECONDS;`, context);
  const scene = new Group();
  const camera = new Group(); camera.position.set(0, 1.65, startZ);
  camera.quaternion = new Quaternion(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
  camera.direction = new Vector3(0, 0, -1);
  camera.getWorldDirection = target => target.copy(camera.direction);
  const texture = { horror: true };
  const chunks = [14, 0, -14, -28].map(z => {
    const group = new Group(); group.position.z = z; scene.add(group);
    const slots = [];
    for (const localZ of [-3.5, -10.5]) for (const side of [-1, 1]) {
      const frame = new Group(); frame.position.set(side * 2.9, 1.8, localZ);
      const frameMesh = new Mesh(geometry(), {}); frame.add(frameMesh); frame.userData.frameMesh = frameMesh;
      const pic = new Mesh(geometry(), { map: texture }); pic.position.set(side * 2.8, 1.8, localZ);
      pic.quaternion = new Quaternion(0, -side * Math.SQRT1_2, 0, Math.SQRT1_2);
      group.add(frame); group.add(pic);
      const slot = { parent: group, frame, pic, side };
      pic.userData.slot = slot; slots.push(slot);
    }
    return { group, slots };
  });
  const rearWall = new Group(); rearWall.position.z = 14; scene.add(rearWall);
  const calls = { bounds: [], progress: [], starts: 0, impacts: 0, completes: 0, added: [], removed: [], debris: [] };
  let frontWall;
  const architecture = { makeRearWall() {
    frontWall = new Group(); frontWall.add(new Mesh(geometry(6, 6.7), {})); scene.add(frontWall); return frontWall;
  } };
  const ending = context.create({ scene, camera, chunks, architecture, rearWall,
    onBounds: state => calls.bounds.push({ ...state }), onProgress: p => calls.progress.push(p),
    onStart: () => calls.starts++, onImpact: () => calls.impacts++, onComplete: () => calls.completes++,
    onAdd: root => calls.added.push(root), onRemove: root => calls.removed.push(root),
    removeSlotDebris: slot => calls.debris.push(slot) });
  return { scene, camera, chunks, rearWall, frontWall, texture, calls, ending, finaleSeconds: context.finaleSeconds,
    finalSlots: [...chunks[2].slots.slice(0, 2), ...chunks[1].slots.slice(2, 4)], flyers: () => calls.added.filter(root => root !== frontWall),
    tick(seconds) { for (let n = 0; n < seconds * 60; n++) ending.update(1 / 60); } };
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('front barrier halves the activation distance and rear only follows a forward gaze', () => {
  const h = harness();
  assert.equal(h.ending.state.frontZ, -21);
  near(h.ending.frontLimitZ, -20.4);
  assert.equal(h.frontWall.position.z, -21);
  assert.equal(h.frontWall.rotation.y, Math.PI);
  h.camera.direction.z = 1;
  h.camera.position.z = -6;
  h.ending.advance();
  assert.equal(h.rearWall.position.z, 14);
  h.camera.direction.z = -1;
  h.ending.advance();
  assert.equal(h.rearWall.position.z, 0);
  assert.equal(h.chunks[0].group.visible, false);
  assert.equal(h.chunks[1].group.visible, true);
  assert.equal(h.chunks[2].group.visible, true);
  assert.equal(h.chunks[3].group.visible, false);
  assert.deepEqual(h.chunks.map(chunk => chunk.group.position.z), [14, 0, -14, -28]);
  h.ending.dispose();
});

test('all four final-section paintings, including already broken ones, fly without cloning cyclic slot metadata', () => {
  const h = harness();
  h.finalSlots[0].pic.visible = false;
  h.finalSlots[0].frame.visible = false;
  h.camera.position.z = -8;
  assert.doesNotThrow(() => h.ending.advance());
  assert.equal(h.ending.active, true);
  assert.equal(h.ending.state.remainingSections, 2);
  assert.equal(h.calls.starts, 1);
  assert.equal(h.flyers().length, 4);
  assert.deepEqual(new Set(h.calls.debris), new Set(h.finalSlots));
  assert.ok(h.finalSlots.every(slot => !slot.pic.visible && !slot.frame.visible));
  for (const flyer of h.flyers()) {
    assert.equal(flyer.children.length, 2);
    assert.ok(flyer.children.every(child => child.visible));
    assert.equal(flyer.children[1].material.map, h.texture);
  }
  h.ending.advance();
  assert.equal(h.calls.starts, 1);
  h.ending.dispose();
});

test('flyers end facing the captured camera pose and sounds/completion fire exactly once', () => {
  const h = harness({ yaw: Math.PI / 3 });
  h.camera.position.z = -8;
  h.ending.advance();
  for (const dt of [0, -1, NaN, Infinity]) h.ending.update(dt);
  assert.equal(h.calls.impacts, 0);
  h.tick(.4);
  assert.equal(h.calls.impacts, 0);
  h.tick(.1);
  assert.equal(h.calls.impacts, 1);
  h.tick(.2);
  const capture = h.camera.position.clone();
  for (const [index, flyer] of h.flyers().entries()) {
    const expected = new Vector3(index % 2 ? .23 : -.23, index < 2 ? -.15 : .15, -.62)
      .applyQuaternion(h.camera.quaternion).add(capture);
    for (const axis of ['x', 'y', 'z']) near(flyer.position[axis], expected[axis]);
    for (const part of flyer.children) for (const key of ['x', 'y', 'z', 'w']) near(part.quaternion[key], h.camera.quaternion[key]);
  }
  assert.equal(h.calls.completes, 0);
  h.tick(h.finaleSeconds + .1);
  h.tick(h.finaleSeconds + .1);
  h.ending.advance();
  assert.equal(h.calls.starts, 1);
  assert.equal(h.calls.impacts, 1);
  assert.equal(h.calls.completes, 1);
  h.ending.dispose();
});

test('dispose cancels pending finale work without disposing shared original artwork geometry', () => {
  const h = harness();
  h.camera.position.z = -8; h.ending.advance(); h.tick(.2);
  const faceMaterial = h.flyers()[0].children[1].material;
  h.ending.dispose(); h.ending.dispose(); h.tick(4); h.ending.advance();
  assert.equal(h.calls.impacts, 0);
  assert.equal(h.calls.completes, 0);
  assert.equal(faceMaterial.disposals, 1);
  assert.equal(h.calls.removed.length, 5);
  assert.ok(h.finalSlots.every(slot => slot.pic.geometry.disposals === 0));
});


test('a delayed resumed frame cannot skip straight past the attack or completion', () => {
  const h = harness();
  h.camera.position.z = -8; h.ending.advance();
  h.tick(.2);
  h.ending.update(1000);
  assert.equal(h.calls.impacts, 0);
  assert.equal(h.calls.completes, 0);
  h.tick(.15);
  assert.equal(h.calls.impacts, 1);
  assert.equal(h.calls.completes, 0);
  h.ending.dispose();
});

test('halving uses the activation position and keeps four paintings when the midpoint lands exactly on a row', () => {
  const h = harness({ startZ: -7 });
  // Resident front is -42: the visitor is 35 m from it, so seal 17.5 m ahead.
  near(h.ending.state.frontZ, -24.5);
  near(h.ending.frontLimitZ, -23.9);
  const front = h.frontWall.position.z;
  h.camera.position.z = -9;
  h.ending.advance();
  assert.equal(h.frontWall.position.z, front, 'walking never moves the sealed front');
  h.camera.position.z = -12;
  h.ending.advance();
  assert.equal(h.ending.active, true);
  assert.equal(h.flyers().length, 4, 'the painting pair on the half-open rear boundary is retained');
  assert.deepEqual(new Set(h.calls.debris), new Set(h.finalSlots));
  assert.equal(h.ending.state.remainingSections, 2);
  h.ending.dispose();
});

test('fractional activation coordinates still produce an exact half-distance collision barrier', () => {
  const h = harness({ startZ: -12.25 });
  const expected = -12.25 + (-42 + 12.25) / 2;
  near(h.frontWall.position.z, expected);
  near(-12.25 - h.frontWall.position.z, (-12.25 + 42) / 2);
  near(h.ending.frontLimitZ, expected + .6);
  h.camera.position.z = expected + 12;
  h.ending.advance();
  assert.equal(h.flyers().length, 4);
  assert.equal(h.chunks.at(-1).group.visible, false, 'architecture entirely past the closer front wall is dormant');
  h.ending.dispose();
});
