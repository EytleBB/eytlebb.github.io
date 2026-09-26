const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/museum-touch.js'), 'utf8');

function element() {
  const listeners = new Map(), classes = new Set(), capture = new Set();
  return {
    style: {}, textContent: '', attrs: {}, hidden: false,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), toggle(name, yes) { yes ? classes.add(name) : classes.delete(name); } },
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    emit(type, data = {}) { const e = { button: 0, preventDefault() {}, ...data }; (listeners.get(type) || []).forEach(fn => fn(e)); },
    setPointerCapture: id => capture.add(id), hasPointerCapture: id => capture.has(id), releasePointerCapture: id => capture.delete(id),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 126, height: 126 }),
  };
}
function harness() {
  const root = element(), canvas = element();
  const nodes = Object.fromEntries(['stick','pause','inspect','jump','zoom','crouch','thumb'].map(name => [name, element()]));
  root.querySelector = selector => nodes[selector === '.touch-stick-thumb' ? 'thumb' : selector.match(/"(\w+)"/)[1]];
  const context = { document: { createElement: () => root, body: { append() {} } } };
  vm.runInNewContext(source.replaceAll('export function', 'function') + '\nthis.create = createMuseumTouchControls;', context);
  const state = { moves: [], looks: [], jump: false, zoom: false, crouch: false, inspected: 0, paused: 0 };
  const controls = context.create({ canvas, T: (zh, en) => en,
    onMove: (...xy) => state.moves.push(xy), onLook: (...xy) => state.looks.push(xy),
    onJump: held => { state.jump = held; }, onZoom: held => { state.zoom = held; }, onCrouch: held => { state.crouch = held; },
    onInspect: () => state.inspected++, onPause: () => state.paused++,
  });
  controls.update({ playing: true });
  return { root, canvas, nodes, state, controls };
}

test('independent pointer ownership supports simultaneous movement and look, then cancels each finger', () => {
  const h = harness();
  h.nodes.stick.emit('pointerdown', { pointerId: 1, clientX: 63, clientY: 10 });
  assert.equal(h.state.moves.at(-1)[1], 1);
  h.canvas.emit('pointerdown', { pointerId: 2, clientX: 250, clientY: 300 });
  h.canvas.emit('pointermove', { pointerId: 1, clientX: 230, clientY: 280 });
  assert.equal(h.state.looks.length, 0, 'joystick finger must not change look');
  h.canvas.emit('pointermove', { pointerId: 2, clientX: 280, clientY: 295 });
  assert.deepEqual(h.state.looks.at(-1), [30, -5]);
  h.nodes.stick.emit('pointercancel', { pointerId: 1 });
  assert.deepEqual(h.state.moves.at(-1), [0, 0]);
  h.canvas.emit('lostpointercapture', { pointerId: 2 });
  h.canvas.emit('pointermove', { pointerId: 2, clientX: 500, clientY: 300 });
  assert.equal(h.state.looks.length, 1);
});

test('joystick dead zone, diagonal clamp and lost capture prevent drift and runaway speed', () => {
  const h = harness();
  h.nodes.stick.emit('pointerdown', { pointerId: 1, clientX: 64, clientY: 63 });
  assert.equal(Math.hypot(...h.state.moves.at(-1)), 0);
  h.nodes.stick.emit('pointermove', { pointerId: 1, clientX: 500, clientY: 500 });
  assert.ok(Math.abs(Math.hypot(...h.state.moves.at(-1)) - 1) < 1e-9);
  h.nodes.stick.emit('lostpointercapture', { pointerId: 1 });
  assert.equal(Math.hypot(...h.state.moves.at(-1)), 0);
});

test('pause, focus and plaque transitions release held actions and make hidden controls inert', () => {
  const h = harness();
  h.nodes.jump.emit('pointerdown', { pointerId: 3 });
  h.nodes.zoom.emit('pointerdown', { pointerId: 4 });
  h.nodes.crouch.emit('click');
  assert.equal(h.state.jump && h.state.zoom && h.state.crouch, true);
  h.controls.update({ playing: true, focus: true });
  assert.equal(h.state.jump || h.state.zoom || h.state.crouch, false);
  assert.equal(h.nodes.inspect.textContent, 'Back');
  assert.equal(h.nodes.inspect.disabled, false);
  h.nodes.stick.emit('pointerdown', { pointerId: 5, clientX: 63, clientY: 0 });
  assert.deepEqual(h.state.moves.at(-1), [0, 0]);
  h.controls.update({ playing: true, focus: true, plaque: true });
  assert.equal(h.root.hidden && h.root.inert, true);
  h.controls.update({ playing: false });
  h.nodes.inspect.emit('click');
  assert.equal(h.state.inspected, 0);
});

test('releasing a zoom finger or clearing a rotated viewport never leaves a held action', () => {
  const h = harness();
  h.nodes.zoom.emit('pointerdown', { pointerId: 1 });
  h.nodes.zoom.emit('pointercancel', { pointerId: 2 });
  assert.equal(h.state.zoom, true);
  h.nodes.zoom.emit('pointercancel', { pointerId: 1 });
  assert.equal(h.state.zoom, false);
  h.nodes.jump.emit('pointerdown', { pointerId: 2 });
  h.controls.reset();
  assert.equal(h.state.jump, false);
  assert.equal(h.nodes.jump.hasPointerCapture(2), false);
});

test('mobile memory budgets preserve aspect ratio and desktop pixel density', async () => {
  const { museumPixelRatio, museumTextureSize, museumFocusDistance } = await import('../js/museum-touch.js');
  assert.equal(museumPixelRatio(true, 3), 1.25);
  assert.equal(museumPixelRatio(false, 3), 2);
  assert.equal(museumPixelRatio(true, 1), 1);
  assert.deepEqual(museumTextureSize(2048, 1024), { resizeWidth: 1024, resizeHeight: 512 });
  assert.deepEqual(museumTextureSize(512, 256), { resizeWidth: 512, resizeHeight: 256 });
  assert.deepEqual(museumTextureSize(null, null), {});
  assert.ok(museumFocusDistance({ width: 2.6, height: 1.52 }, 390 / 844) > 3.5);
  assert.ok(museumFocusDistance({ width: 20, height: 1 }, 0.3) <= 5);
});

test('gallery entry admits touch WebGL2 without pointer lock and keeps unsupported fallback', () => {
  const main = fs.readFileSync(require('node:path').join(__dirname, '../js/main.js'), 'utf8');
  const gate = main.match(/function isMuseumCapable\(\) \{[^]*?\n\}/)[0];
  function supported(touch, pointerLock, webgl) {
    const context = { window: { matchMedia: () => ({ matches: touch }) }, Element: { prototype: pointerLock ? { requestPointerLock() {} } : {} },
      document: { createElement: () => ({ getContext: () => webgl ? { getExtension: () => null } : null }) } };
    return vm.runInNewContext(gate + '\nisMuseumCapable()', context);
  }
  assert.equal(supported(true, false, true), true);
  assert.equal(supported(false, true, true), true);
  assert.equal(supported(true, false, false), false);
  assert.equal(supported(false, false, true), false);
});
