const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/museum.js'), 'utf8');
const controls = source.slice(source.indexOf('const LOOK_SENS ='), source.indexOf('/* ---- boot ---- */'));
const playerModule = import('../js/museum-player.js');

class Vector {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
  copy(other) { Object.assign(this, { x: other.x, y: other.y, z: other.z }); return this; }
  clone() { return new Vector(this.x, this.y, this.z); }
  addScaledVector(v, scale) { this.x += v.x * scale; this.y += v.y * scale; this.z += v.z * scale; return this; }
  applyQuaternion() { return this; }
  lerpVectors(a, b, alpha) {
    this.x = a.x + (b.x - a.x) * alpha;
    this.y = a.y + (b.y - a.y) * alpha;
    this.z = a.z + (b.z - a.z) * alpha;
    return this;
  }
}
class Quaternion {
  clone() { return new Quaternion(); }
  copy() { return this; }
  setFromRotationMatrix() { return this; }
  slerpQuaternions() { return this; }
}
function eventTarget() {
  const handlers = new Map();
  return {
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(handler);
    },
    emit(type, event = {}) { for (const handler of handlers.get(type) || []) handler(event); },
  };
}
function classList() {
  const classes = new Set();
  return {
    add: value => classes.add(value),
    remove: value => classes.delete(value),
    toggle(value, on) { if (on) classes.add(value); else classes.delete(value); },
    contains: value => classes.has(value),
  };
}

async function createControls() {
  const { createMuseumPlayer } = await playerModule;
  const document = { ...eventTarget(), hidden: false, body: { classList: classList() } };
  const window = eventTarget();
  const canvas = { ...eventTarget(), requestPointerLock: async () => {} };
  const camera = {
    position: new Vector(0, 1.65, 0), quaternion: new Quaternion(), up: new Vector(0, 1, 0),
    fov: 74, rotation: { set(...values) { this.last = values; } }, updateProjectionMatrix() {},
  };
  const loops = [];
  document.pointerLockElement = canvas;
  document.exitPointerLock = () => {
    document.pointerLockElement = null;
    document.emit('pointerlockchange');
  };
  const context = vm.createContext({
    createMuseumPlayer, document, window, canvas, camera,
    EYE_Y: 1.65, CAMERA_FOV: 74, ZOOM_FOV: 28, ZOOM_FOV_SPEED: 78,
    PERF_AUTOWALK: false, ART_INTERACT_DISTANCE: 3.5,
    settings: { sensitivity: 1 }, updaters: [], artMeshes: [],
    getRearWallZ: () => 72, recycleChunks() {}, updateTextureStreaming() {},
    updateSpeakerPool() {}, resetFrameTiming() {}, startMuseumTrack() {},
    entered: true, preloaded: true, looping: true, frame() {},
    runtimeStatus: { textContent: '' }, enterEl: { inert: false },
    enterGo: { ...eventTarget(), blur() {}, textContent: '' },
    artHintEl: { classList: classList() },
    audioListener: { setMasterVolume() {} }, renderer: { setAnimationLoop: value => loops.push(value) },
    T: (zh, en) => en,
    THREE: {
      Vector3: Vector, Vector2: Vector, Quaternion,
      Matrix4: class { lookAt() { return this; } },
      Raycaster: class { setFromCamera() {} intersectObjects(objects) { return objects.map(object => ({ object })); } },
      MathUtils: { degToRad: n => n * Math.PI / 180, euclideanModulo: (n, m) => ((n % m) + m) % m },
    },
  });
  vm.runInContext(controls, context);
  const api = vm.runInContext(`({ player, keys, clearInput, focusOn, unfocus, lockPointer, enterPlay,
    get focusState() { return focusState; }, get zoomHeld() { return zoomHeld; },
    get yaw() { return yaw; }, get pitch() { return pitch; } })`, context);
  function key(code, down, repeat = false) {
    const event = { code, repeat, prevented: false, preventDefault() { this.prevented = true; } };
    document.emit(down ? 'keydown' : 'keyup', event);
    return event;
  }
  function tick(count = 1, dt = 1 / 60) {
    for (let i = 0; i < count; i++) for (const update of context.updaters) update(dt);
  }
  function lock(locked) {
    document.pointerLockElement = locked ? canvas : null;
    document.emit('pointerlockchange');
  }
  return { api, context, document, window, canvas, camera, key, tick, lock, loops };
}

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} should be near ${b}`);

test('real keyboard handlers preserve overlapping bindings and ignore unlocked input', async () => {
  const h = await createControls();
  h.key('KeyW', true);
  h.key('ArrowUp', true);
  h.key('KeyW', false);
  h.tick(30);
  assert.equal(h.api.keys.forward, true);
  near(h.api.player.state.speed, 4.5);
  h.key('ShiftLeft', true);
  h.key('ShiftRight', true);
  h.key('ShiftLeft', false);
  h.tick(60);
  near(h.api.player.state.speed, 2.1);
  h.lock(false);
  assert.equal(h.key('KeyW', true).prevented, false);
  h.tick(60);
  assert.equal(h.api.keys.forward, false);
  near(h.api.player.state.speed, 0);
});

test('Space press and release between rendered frames still jumps once', async () => {
  const h = await createControls();
  h.key('Space', true);
  h.key('Space', false);
  h.tick();
  assert.equal(h.api.player.state.grounded, false);
  h.tick(60);
  assert.equal(h.api.player.state.grounded, true);
  h.tick(60);
  near(h.camera.position.y, 1.65);
});

test('a new Space press after landing is recognized even when release and press share one frame', async () => {
  const h = await createControls();
  h.key('Space', true);
  h.tick(1, 1 / 120);
  for (let i = 0; i < 120 && !h.api.player.state.grounded; i++) h.tick(1, 1 / 120);
  assert.equal(h.api.player.state.grounded, true);
  h.key('Space', false);
  h.key('Space', true);
  h.tick();
  assert.equal(h.api.player.state.grounded, false);
});

test('held Space repeats through the real controls and release or pause cancels repetition', async () => {
  const h = await createControls();
  h.key('Space', true);
  let takeoffs = 0;
  let previousVerticalSpeed = 0;
  for (let i = 0; i < 120; i++) {
    h.tick();
    const verticalSpeed = h.api.player.state.velocity.y;
    if (verticalSpeed > 0 && previousVerticalSpeed <= 0) takeoffs++;
    previousVerticalSpeed = verticalSpeed;
  }
  assert.equal(takeoffs, 4);
  h.key('Space', false);
  h.tick(120);
  assert.equal(h.api.player.state.grounded, true);
  near(h.camera.position.y, 1.65);
  h.key('Space', true);
  h.tick(10);
  h.lock(false);
  h.lock(true);
  h.tick(120);
  assert.equal(h.api.keys.jump, false);
  assert.equal(h.api.player.state.grounded, true);
  near(h.camera.position.y, 1.65);
});

test('blur and visibility changes release movement, zoom, and capture without stale keys', async () => {
  const h = await createControls();
  h.key('KeyW', true);
  h.document.emit('mousedown', { button: 2, preventDefault() {} });
  h.tick(30);
  assert.equal(h.api.zoomHeld, true);
  h.window.emit('blur');
  assert.equal(h.document.pointerLockElement, null);
  assert.equal(h.api.zoomHeld, false);
  assert.equal(h.api.keys.forward, false);
  h.lock(true);
  h.tick(30);
  near(h.api.player.state.speed, 0);
  h.document.hidden = true;
  h.document.emit('visibilitychange');
  assert.equal(h.loops.at(-1), null);
  assert.equal(h.document.pointerLockElement, null);
  h.document.hidden = false;
  h.document.emit('visibilitychange');
  assert.equal(h.loops.at(-1), h.context.frame);
});

test('artwork focus preserves a crouched position and returns control without stuck input', async () => {
  const h = await createControls();
  h.key('ControlLeft', true);
  h.tick(60);
  near(h.camera.position.y, 1.08);
  const before = h.camera.position.clone();
  const mesh = {
    getWorldPosition(out) { return out.copy({ x: 2.8, y: 1.65, z: -3 }); },
    getWorldQuaternion(out) { return out; },
  };
  h.context.artMeshes.push(mesh);
  h.key('KeyE', true);
  assert.ok(h.api.focusState);
  h.key('ControlLeft', false);
  h.key('KeyW', true);
  h.tick(40);
  assert.equal(h.api.keys.forward, false);
  h.key('KeyE', true);
  h.tick(36);
  near(h.camera.position.x, before.x);
  near(h.camera.position.z, before.z);
  near(h.camera.position.y, before.y);
  h.tick(60);
  assert.equal(h.api.focusState, null);
  near(h.camera.position.y, 1.65);
  near(h.api.player.state.speed, 0);
});

test('mouse input keeps ordinary flicks and rejects a driver spike', async () => {
  const h = await createControls();
  h.document.emit('mousemove', { movementX: 1, movementY: 0 }); // lock acquisition event
  h.document.emit('mousemove', { movementX: 400, movementY: 20 });
  near(h.api.yaw, -0.6);
  near(h.api.pitch, -0.03);
  h.document.emit('mousemove', { movementX: 5000, movementY: 0 });
  near(h.api.yaw, -0.6);
  h.document.emit('mousemove', { movementX: 0, movementY: 3000 });
  assert.ok(h.api.pitch > -Math.PI / 2 && h.api.pitch < -1.5);
});

test('raw mouse capture falls back only for unsupported input and reports a rejected lock', async () => {
  const h = await createControls();
  h.lock(false);
  const requests = [];
  h.canvas.requestPointerLock = async options => {
    requests.push(options);
    if (options) throw Object.assign(new Error('raw unsupported'), { name: 'NotSupportedError' });
  };
  await h.api.lockPointer();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].unadjustedMovement, true);
  assert.equal(requests[1], undefined);
  assert.equal(h.context.runtimeStatus.textContent, '');
  requests.length = 0;
  h.canvas.requestPointerLock = async options => {
    requests.push(options);
    throw Object.assign(new Error('fresh click required'), { name: 'NotAllowedError' });
  };
  await h.api.lockPointer();
  assert.equal(requests.length, 1);
  assert.match(h.context.runtimeStatus.textContent, /Mouse capture failed/);
  assert.equal(h.context.enterEl.inert, false);
});


test('pausing while focused restores both the saved position and look orientation', async () => {
  const h = await createControls();
  h.document.emit('mousemove', { movementX: 0, movementY: 0 });
  h.document.emit('mousemove', { movementX: 100, movementY: 80 });
  h.tick();
  const before = h.camera.position.clone();
  h.api.focusOn({
    getWorldPosition(out) { return out.copy({ x: 2.8, y: 1.65, z: -3 }); },
    getWorldQuaternion(out) { return out; },
  });
  h.tick(40);
  // Three.js normally updates Euler angles as the focus quaternion changes.
  h.camera.rotation.set(0.4, 1.2, 0, 'YXZ');
  h.lock(false);
  assert.equal(h.api.focusState, null);
  near(h.camera.position.x, before.x);
  near(h.camera.position.y, before.y);
  near(h.camera.position.z, before.z);
  near(h.camera.rotation.last[0], h.api.pitch);
  near(h.camera.rotation.last[1], h.api.yaw);
  assert.equal(h.document.body.classList.contains('focused'), false);
});

test('duplicate enter requests cannot overlap an in-flight pointer lock', async () => {
  const h = await createControls();
  h.lock(false);
  let requests = 0;
  let resolveLock;
  h.canvas.requestPointerLock = () => {
    requests++;
    return new Promise(resolve => { resolveLock = resolve; });
  };
  const first = h.api.lockPointer();
  await h.api.lockPointer();
  assert.equal(requests, 1);
  h.lock(true);
  resolveLock();
  await first;
  await h.api.lockPointer();
  assert.equal(requests, 1);
  assert.equal(h.context.enterEl.inert, true);
});
