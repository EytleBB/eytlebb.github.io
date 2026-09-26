const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(new URL('../js/museum-horror-art.js', `file://${__filename}`), 'utf8')
  .replace(/^import .*?;\n/m, '').replace('export function', 'function');

function load() {
  const canvases = [];
  const textures = [];
  class CanvasTexture {
    constructor(image) { this.image = image; this.uploads = 0; this.disposals = 0; textures.push(this); }
    set needsUpdate(value) { if (value) this.uploads++; }
    dispose() { this.disposals++; }
  }
  const context = vm.createContext({
    THREE: { CanvasTexture, SRGBColorSpace: 'srgb', LinearFilter: 'linear', NearestFilter: 'nearest' },
    document: { createElement(type) {
      assert.equal(type, 'canvas');
      const methods = new Proxy({}, { get: (_object, key) => key === 'createRadialGradient'
        ? () => ({ addColorStop() {} }) : () => {} });
      const canvas = { width: 0, height: 0, getContext: () => methods };
      canvases.push(canvas);
      return canvas;
    } },
  });
  vm.runInContext(`${source}\nthis.createMuseumHorrorArt = createMuseumHorrorArt;`, context);
  return { create: context.createMuseumHorrorArt, canvases, textures };
}

test('art module stays inert until activation, then shares exactly three bounded textures', () => {
  const harness = load();
  assert.equal(harness.canvases.length, 0);
  assert.equal(harness.textures.length, 0);
  const art = harness.create();
  assert.equal(harness.canvases.length, 3);
  assert.deepEqual(harness.canvases.map(({ width, height }) => [width, height]), [[256, 256], [256, 160], [384, 64]]);
  assert.equal(art.artTexture, harness.textures[0]);
  assert.equal(art.plaqueTexture, harness.textures[1]);
  assert.equal(art.nameTexture, harness.textures[2]);
  assert.ok(harness.textures.every(texture => texture.colorSpace === 'srgb' && !texture.generateMipmaps));
  art.dispose();
});

test('texture uploads remain at eight frames per second regardless of render frequency', () => {
  for (const fps of [30, 60, 144]) {
    const harness = load();
    const art = harness.create();
    let updates = 0;
    for (let i = 0; i < fps * 3; i++) updates += Number(art.update(1 / fps));
    assert.equal(updates, 24, `${fps} Hz rendering`);
    assert.ok(harness.textures.every(texture => texture.uploads === 25));
    assert.equal(harness.canvases.length, 3, 'redraws reuse original canvases');
    assert.equal(harness.textures.length, 3, 'redraws reuse original textures');
    art.dispose();
  }
});

test('paused or invalid time never animates, and long frames do not cause redraw bursts', () => {
  const harness = load();
  const art = harness.create();
  for (const dt of [0, -1, NaN, Infinity, -Infinity]) assert.equal(art.update(dt), false);
  assert.equal(art.update(30), true);
  assert.ok(harness.textures.every(texture => texture.uploads === 2));
  assert.equal(art.update(.001), false);
});

test('reduced motion keeps a completed eerie frame without flickering textures', () => {
  const harness = load();
  const art = harness.create({ reducedMotion: true });
  for (let i = 0; i < 120; i++) assert.equal(art.update(.5), false);
  assert.ok(harness.textures.every(texture => texture.uploads === 1));
  art.dispose();
});

test('disposing releases GPU resources once and stops future canvas work', () => {
  const harness = load();
  const art = harness.create();
  art.dispose(); art.dispose();
  assert.equal(art.update(1), false);
  assert.ok(harness.textures.every(texture => texture.disposals === 1 && texture.uploads === 1));
  assert.ok(harness.canvases.every(canvas => canvas.width === 1 && canvas.height === 1));
});
