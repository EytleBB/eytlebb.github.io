const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const portraits = fs.readFileSync(path.join(root, 'js/site-horror-portraits.js'), 'utf8');
const visual = fs.readFileSync(path.join(root, 'js/site-horror-aftereffects-visual.js'), 'utf8');

function loadFactory(context = {}) {
  return vm.runInNewContext(`${portraits.replace('export function', 'function')}\n${visual
    .replace(/^import .*;\n/gm, '').replace('export function', 'function')}\ncreateAftereffectsVisual;`, context);
}

function harness({ width = 1280, height = 720, forest = true } = {}) {
  const canvases = [], placements = [], handlers = new Map();
  let painterDisposals = 0;
  const noop = () => {};
  const window = { innerHeight: height,
    addEventListener: (type, callback) => handlers.set(type, callback),
    removeEventListener(type, callback) { if (handlers.get(type) === callback) handlers.delete(type); },
  };
  const document = {
    documentElement: { clientWidth: width },
    querySelector: selector => selector === '.forest-scene' && forest ? { after: canvas => placements.push(['after', canvas]) } : null,
    body: { prepend: canvas => placements.push(['prepend', canvas]) },
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const stack = [];
      const context = {
        globalAlpha: 1, draws: [], clears: [], rectangles: [], transforms: [],
        beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, fill: noop, clip: noop,
        save() { stack.push(this.globalAlpha); }, restore() { this.globalAlpha = stack.pop(); },
        translate(...args) { this.transforms.push(['translate', ...args]); },
        scale(...args) { this.transforms.push(['scale', ...args]); },
        clearRect(...args) { this.clears.push(args); },
        fillRect(...args) { this.rectangles.push([this.fillStyle, ...args]); },
        drawImage(...args) { this.draws.push({ args, alpha: this.globalAlpha }); },
      };
      const canvas = { style: {}, dataset: {}, attributes: {}, context,
        setAttribute(name, value) { this.attributes[name] = value; },
        getContext: () => context, remove() { this.removed = true; },
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  const create = loadFactory({ createPixelGlyphPainter: () => ({ line: noop, dispose: () => painterDisposals++ }) });
  const api = create({ document, window });
  return { api, canvases, field: canvases[0], document, window, placements, handlers,
    get painterDisposals() { return painterDisposals; } };
}

test('importing the shared portraits and aftereffects renderer leaves the ordinary page untouched', () => {
  const forbid = () => assert.fail('module evaluation must not touch the page');
  const create = loadFactory({ document: { createElement: forbid }, window: { addEventListener: forbid }, createPixelGlyphPainter: forbid });
  assert.equal(typeof create, 'function');
});

test('the transparent visual-only canvas stays hidden and inert until an event begins', () => {
  const h = harness();
  assert.equal(h.field.id, 'site-horror-aftereffects-field');
  assert.equal(h.field.attributes['aria-hidden'], 'true');
  assert.equal(h.field.style.pointerEvents, 'none');
  assert.equal(h.field.style.position, 'fixed');
  assert.equal(h.field.dataset.active, 'false');
  assert.equal(h.field.hidden, true);
  assert.equal(h.placements[0][0], 'after');
  assert.equal(h.api.active, false);
  assert.equal(h.api.update(0.5), false);
  assert.equal(h.field.context.draws.length, 0);
  assert.equal(h.field.context.rectangles.length, 0, 'no opaque whole-screen background is painted');
  assert.equal(h.api.show('unknown'), false);
  h.api.dispose();
});

test('all three apparition kinds finish, clear their canvas and stop drawing between events', () => {
  for (const [kind, duration] of [['glimpse', 1.05], ['reflection', 1.45], ['rush', 0.9]]) {
    const h = harness();
    assert.equal(h.api.show(kind, { identity: 2 }), true);
    assert.equal(h.field.dataset.kind, kind);
    assert.equal(h.field.dataset.active, 'true');
    assert.equal(h.field.hidden, false);
    assert.equal(h.api.update(duration - 0.001), true);
    assert.equal(h.field.context.draws.at(-1).args[0], h.canvases[3], 'the selected shared portrait is used');
    assert.equal(h.api.update(duration), false);
    assert.equal(h.api.active, false);
    assert.equal(h.field.hidden, true);
    assert.equal(h.field.dataset.active, 'false');
    assert.deepEqual(h.field.context.clears.at(-1), [0, 0, h.field.width, h.field.height]);
    const paints = h.field.context.draws.length;
    assert.equal(h.api.update(duration + 10), false);
    assert.equal(h.field.context.draws.length, paints);
    h.api.dispose();
  }
});

test('a rush approaches at the edge, holds briefly and fades without a full-screen flash', () => {
  const h = harness();
  h.api.show('rush', { identity: 1 });
  h.api.update(0.08);
  const early = h.field.context.draws.at(-1);
  h.api.update(0.17);
  const near = h.field.context.draws.at(-1);
  assert.ok(near.args[7] > early.args[7] * 1.5, 'the approach grows over multiple frames');
  assert.ok(near.args[5] > h.field.width * 0.66, 'the large face stays to the side of hero copy');
  h.api.update(0.48);
  assert.equal(h.field.context.draws.at(-1).args[7], near.args[7], 'the approach ends before the hold');
  h.api.update(0.7);
  assert.ok(h.field.context.draws.at(-1).alpha < near.alpha, 'the sustained face fades');
  assert.ok(h.field.context.draws.every(draw => draw.alpha <= 0.84));
  assert.equal(h.field.context.rectangles.length, 0);
  assert.equal(h.api.update(0.9), false);
  h.api.dispose();
});

test('the reflection is dim and inverted low in the water, while a glimpse is partly occluded', () => {
  const h = harness();
  h.api.show('reflection'); h.api.update(0.5);
  const reflected = h.field.context.draws.at(-1);
  assert.ok(reflected.args[6] > h.field.height * 0.6);
  assert.ok(reflected.alpha < 0.3);
  assert.ok(h.field.context.transforms.some(operation => operation.join(',') === 'scale,1,-1'));
  assert.ok(h.field.context.clears.some(args => args[3] === 2), 'transparent gaps break up the water image');
  h.api.show('glimpse'); h.api.update(0.5);
  const glimpse = h.field.context.draws.at(-1);
  const gap = h.field.context.clears.at(-1);
  assert.ok(gap[0] > glimpse.args[5] && gap[0] < glimpse.args[5] + glimpse.args[7]);
  assert.ok(gap[3] > glimpse.args[8], 'the underlying forest occludes both head and body');
  h.api.dispose();
});

test('the renderer accepts cumulative event time without exceeding twenty-four draws per second', () => {
  for (const fps of [30, 60, 120, 144]) {
    const h = harness();
    h.api.show('glimpse');
    for (let i = 0; i < fps; i++) h.api.update(i / fps);
    assert.equal(h.field.context.draws.length, 24, `${fps} Hz display paints twenty-four distinct visual frames`);
    h.api.dispose();
  }
});

test('mobile placement, resizing, replacement and disposal keep ownership bounded', () => {
  const h = harness({ width: 375, height: 812, forest: false });
  assert.equal(h.placements[0][0], 'prepend');
  assert.ok(h.field.width < h.field.height);
  h.api.show('glimpse', { identity: -1, side: -1 }); h.api.update(0.3);
  assert.equal(h.field.context.draws.at(-1).args[0], h.canvases[3], 'identity normalization stays inside the three portraits');
  const left = h.field.context.draws.at(-1).args[5];
  h.api.show('rush', { side: 1 }); h.api.update(0.3);
  assert.ok(h.field.context.draws.at(-1).args[5] > left);
  h.document.documentElement.clientWidth = 812;
  h.window.innerHeight = 375;
  h.handlers.get('resize')();
  assert.ok(h.field.width > h.field.height);
  h.api.update(0.3);
  h.api.stop();
  h.api.dispose(); h.api.dispose();
  assert.equal(h.handlers.size, 0);
  assert.equal(h.painterDisposals, 1);
  assert.equal(h.field.removed, true);
  assert.ok(h.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
  assert.equal(h.api.active, false);
  assert.equal(h.api.show('rush'), false);
  assert.equal(h.api.update(0.5), false);
});
