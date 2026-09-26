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
    add(...values) { for (const value of values) classes.add(value); },
    remove(...values) { for (const value of values) classes.delete(value); },
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
  const museumKnife = {
    equipped: false,
    inspections: 0,
    attacks: [],
    heldAttacks: new Set(),
    clearAttackInput() { this.heldAttacks.clear(); },
    setAttackHeld(kind, held) {
      if (!held) { this.heldAttacks.delete(kind); return; }
      if (this.equipped) { this.heldAttacks.add(kind); this.attacks.push(kind); }
    },
    inspect() { if (this.equipped) this.inspections++; },
    equip() { this.equipped = true; },
    stow() { this.equipped = false; },
    toggle() { this.equipped = !this.equipped; },
  };
  document.pointerLockElement = canvas;
  document.exitPointerLock = () => {
    document.pointerLockElement = null;
    document.emit('pointerlockchange');
  };
  const context = vm.createContext({
    createMuseumPlayer, document, window, canvas, camera, museumKnife,
    EYE_Y: 1.65, CAMERA_FOV: 74, ZOOM_FOV: 28, ZOOM_FOV_SPEED: 78,
    PERF_AUTOWALK: false, ART_INTERACT_DISTANCE: 3.5,
    plaqueSession: null, PLAQUE_FOCUS_DISTANCE: 0.48,
    IMAGES: ['images/gallery/0x0000.jpg'], TEXTURE_IMAGES: ['images/gallery-preview/0x0000.webp'],
    guestbook: { opened: false, open() { this.opened = true; }, close() { this.opened = false; }, isOpen() { return this.opened; } },
    settings: { sensitivity: 1 }, updaters: [], artMeshes: [],
    getRearWallZ: () => 72, recycleChunks() {}, updateTextureStreaming() {},
    updateSpeakerPool() {}, resetFrameTiming() {}, startMuseumTrack() {},
    entered: true, preloaded: true, looping: true, frame() {},
    runtimeStatus: { textContent: '' }, enterEl: { inert: false },
    enterGo: { ...eventTarget(), blur() {}, textContent: '' },
    artHintEl: { classList: classList() }, artHintCaption: { textContent: '' },
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
  const api = vm.runInContext(`({ player, keys, clearInput, focusOn, unfocus, closeGuestPlaque, lockPointer, enterPlay,
    get focusState() { return focusState; }, get zoomHeld() { return zoomHeld; },
    get yaw() { return yaw; }, get pitch() { return pitch; } })`, context);
  function key(code, down, repeat = false, modifiers = {}) {
    const event = { code, repeat, ...modifiers, prevented: false, preventDefault() { this.prevented = true; } };
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
  return { api, context, document, window, canvas, camera, museumKnife, key, tick, lock, loops };
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

test('Q toggles the knife, 3 equips and 1 stows only during free roaming', async () => {
  const h = await createControls();
  assert.equal(h.key('KeyQ', true).prevented, true);
  assert.equal(h.museumKnife.equipped, true);
  h.key('KeyQ', true, true);
  assert.equal(h.museumKnife.equipped, true, 'key repeat must not toggle the knife');
  h.key('Digit1', true);
  assert.equal(h.museumKnife.equipped, false);
  h.key('Digit3', true);
  assert.equal(h.museumKnife.equipped, true);
  h.key('Numpad1', true);
  assert.equal(h.museumKnife.equipped, false);
  h.key('Numpad3', true);
  assert.equal(h.museumKnife.equipped, true);
  h.lock(false);
  assert.equal(h.key('Digit1', true).prevented, false);
  assert.equal(h.museumKnife.equipped, true);
  h.lock(true);
  h.api.focusOn({
    userData: {}, visible: true, parent: { visible: true },
    getWorldPosition(out) { return out.copy({ x: 2.8, y: 1.65, z: -3 }); },
    getWorldQuaternion(out) { return out; },
  });
  h.key('Digit1', true);
  assert.equal(h.museumKnife.equipped, true, 'inspecting artwork must not switch the knife');
});

test('F inspects an equipped knife once without stealing modified keys or plaque input', async () => {
  const h = await createControls();
  h.key('KeyF', true);
  assert.equal(h.museumKnife.inspections, 0);
  h.key('Digit3', true);
  assert.equal(h.key('KeyF', true).prevented, true);
  h.key('KeyF', false);
  h.key('KeyF', true, true);
  assert.equal(h.museumKnife.inspections, 1);
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
    assert.equal(h.key('KeyF', true, false, { [modifier]: true }).prevented, false);
  }
  h.lock(false);
  assert.equal(h.key('KeyF', true).prevented, false);
  h.lock(true);
  h.api.focusOn({
    userData: {}, visible: true, parent: { visible: true },
    getWorldPosition(out) { return out.copy({ x: 2.8, y: 1.65, z: -3 }); },
    getWorldQuaternion(out) { return out; },
  });
  h.key('KeyF', true);
  assert.equal(h.museumKnife.inspections, 1);
  h.context.plaqueSession = { id: 'test' };
  assert.equal(h.key('KeyF', true).prevented, false);
  assert.equal(h.museumKnife.inspections, 1);
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
    userData: {}, visible: true, parent: { visible: true },
    getWorldPosition(out) { return out.copy({ x: 2.8, y: 1.65, z: -3 }); },
    getWorldQuaternion(out) { return out; },
  };
  h.context.artMeshes.push(mesh);
  h.key('KeyE', true);
  assert.ok(h.api.focusState);
  assert.equal(h.document.body.classList.contains('knife-hidden'), true);
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
  assert.equal(h.document.body.classList.contains('knife-hidden'), false);
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
  assert.match(h.context.runtimeStatus.textContent, /Mouse look is unavailable/);
  assert.equal(h.context.enterEl.inert, false);
});


test('pausing while focused restores both the saved position and look orientation', async () => {
  const h = await createControls();
  h.document.emit('mousemove', { movementX: 0, movementY: 0 });
  h.document.emit('mousemove', { movementX: 100, movementY: 80 });
  h.tick();
  const before = h.camera.position.clone();
  h.api.focusOn({
    userData: {}, visible: true, parent: { visible: true },
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

test('reading a plaque releases the mouse, blocks movement and returns even when relocking fails', async () => {
  const h = await createControls();
  h.key('KeyW', true);
  h.tick(30);
  h.api.focusOn({
    visible: true, parent: { visible: true },
    userData: { kind: 'plaque', artworkId: '0x0000.jpg', slot: { imageIndex: 0 } },
    getWorldPosition(out) { return out.copy({ x: 2.8, y: 1.37, z: -3 }); },
    getWorldQuaternion(out) { return out; },
  });
  // Stopping settles the interpolated camera at the current fixed physics step.
  const before = h.camera.position.clone();
  h.tick(40);
  assert.equal(h.api.focusState.phase, 'readingPlaque');
  assert.equal(h.document.pointerLockElement, null);
  assert.equal(h.context.guestbook.isOpen(), true);
  assert.equal(h.context.enterEl.inert, true);
  assert.equal(h.key('KeyW', true).prevented, false, 'typing must reach the text field');
  const reading = h.camera.position.clone();
  h.tick(60);
  assert.deepEqual(h.camera.position, reading);
  h.canvas.requestPointerLock = async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); };
  h.api.closeGuestPlaque();
  await new Promise(resolve => setImmediate(resolve));
  h.tick(37);
  assert.equal(h.api.focusState, null);
  assert.equal(h.context.plaqueSession, null);
  assert.equal(h.context.guestbook.isOpen(), false);
  assert.equal(h.context.enterEl.inert, false);
  assert.equal(h.document.body.classList.contains('plaque-active'), false);
  assert.deepEqual(h.camera.position, before);
  assert.match(h.context.runtimeStatus.textContent, /Mouse look is unavailable/);
});

const artwork = () => ({
  userData: {}, visible: true, parent: { visible: true },
  getWorldPosition(out) { return out.copy({ x: 2.8, y: 1.65, z: -3 }); },
  getWorldQuaternion(out) { return out; },
});
function mouse(h, type, button) {
  const event = { button, prevented: false, preventDefault() { this.prevented = true; } };
  (type === 'click' ? h.canvas : h.document).emit(type, event);
  return event;
}

test('equipped mouse buttons attack without focusing art or zooming, including stow before mouseup', async () => {
  const h = await createControls();
  h.context.artMeshes.push(artwork());
  mouse(h, 'mousedown', 2);
  assert.equal(h.api.zoomHeld, true);
  h.key('Digit3', true);
  assert.equal(h.api.zoomHeld, false, 'equipping clears an already held zoom');
  mouse(h, 'mouseup', 2);
  assert.equal(mouse(h, 'mousedown', 0).prevented, true);
  h.key('Digit1', true);
  mouse(h, 'mouseup', 0);
  assert.equal(mouse(h, 'click', 0).prevented, true);
  assert.equal(h.api.focusState, null, 'an attack release must not focus a painting after stowing');
  h.key('Digit3', true);
  mouse(h, 'mousedown', 2);
  mouse(h, 'mouseup', 2);
  assert.equal(h.api.zoomHeld, false);
  assert.deepEqual(h.museumKnife.attacks, ['light', 'heavy']);
  assert.equal(h.museumKnife.heldAttacks.size, 0);
  mouse(h, 'mousedown', 1);
  assert.equal(h.museumKnife.attacks.length, 2, 'middle button has no knife action');
  mouse(h, 'mousedown', 0);
  mouse(h, 'mouseup', 0);
  mouse(h, 'click', 0);
  assert.equal(h.api.focusState, null);
  h.key('KeyE', true);
  assert.ok(h.api.focusState, 'E still opens a painting while equipped');
  assert.equal(h.museumKnife.heldAttacks.size, 0);
  mouse(h, 'mousedown', 0);
  mouse(h, 'click', 0);
  assert.equal(h.api.focusState.phase, 'returning', 'click can still leave a focused painting');
});

test('empty-hand controls stay available and attacks clear on pause, focus, blur and hidden tabs', async () => {
  const h = await createControls();
  h.context.artMeshes.push(artwork());
  mouse(h, 'mousedown', 2);
  assert.equal(h.api.zoomHeld, true);
  mouse(h, 'mouseup', 2);
  assert.equal(h.api.zoomHeld, false);
  mouse(h, 'mousedown', 0);
  mouse(h, 'click', 0);
  assert.ok(h.api.focusState);
  h.lock(false);
  h.lock(true);
  h.key('Digit3', true);
  for (const interrupt of [
    () => h.lock(false),
    () => h.api.focusOn(artwork()),
    () => h.window.emit('blur'),
    () => { h.document.hidden = true; h.document.emit('visibilitychange'); },
  ]) {
    mouse(h, 'mousedown', 0);
    assert.equal(h.museumKnife.heldAttacks.size, 1);
    interrupt();
    assert.equal(h.museumKnife.heldAttacks.size, 0);
    const count = h.museumKnife.attacks.length;
    mouse(h, 'mousedown', 2);
    assert.equal(h.museumKnife.attacks.length, count);
    h.document.hidden = false;
    h.lock(false);
    h.lock(true);
  }
  h.context.plaqueSession = { id: 'reading' };
  const count = h.museumKnife.attacks.length;
  assert.equal(mouse(h, 'mousedown', 0).prevented, false);
  assert.equal(h.museumKnife.attacks.length, count);
});

test('equipping hides the painting hint immediately, and intact art remains discoverable after stowing', async () => {
  const h = await createControls();
  const mesh = artwork();
  h.context.artMeshes.push(mesh);
  h.tick();
  assert.equal(h.context.artHintEl.classList.contains('show'), true);
  h.key('Digit3', true);
  assert.equal(h.context.artHintEl.classList.contains('show'), false);
  h.tick();
  assert.equal(h.context.artHintEl.classList.contains('show'), false);
  h.key('Digit1', true);
  h.tick();
  assert.equal(h.context.artHintEl.classList.contains('show'), true);
  mesh.visible = false;
  h.tick();
  assert.equal(h.context.artHintEl.classList.contains('show'), false);
  h.key('KeyE', true);
  assert.equal(h.api.focusState, null, 'destroyed paintings cannot open a ghost focus target');
});
