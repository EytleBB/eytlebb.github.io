const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(new URL('../js/museum-architecture.js', `file://${__filename}`), 'utf8')
  .replace(/^import .*?;\n/gm, '').replace('export function', 'function');

function harness() {
  class Color {
    constructor(value) { this.value = value; }
    clone() { return new Color(this.value); }
    copy(other) { this.value = other.value; }
    setRGB(...value) { this.value = value; }
  }
  class Material {
    constructor(options) { Object.assign(this, options); if (!(this.color instanceof Color)) this.color = new Color(this.color); }
    dispose() { this.disposed = true; }
  }
  class Vector {
    copy(other) { Object.assign(this, other); }
  }
  class Mesh {
    constructor(geometry, material) { this.geometry = geometry; this.material = material; this.position = new Vector(); this.rotation = new Vector(); this.visible = true; }
    removeFromParent() { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  }
  class Group {
    constructor() { this.children = []; }
    add(child) { child.parent = this; this.children.push(child); }
  }
  class Reflector extends Mesh {
    constructor(geometry, { shader }) {
      super(geometry, { uniforms: Object.fromEntries(Object.entries(shader.uniforms).map(([name, uniform]) => [name, { ...uniform }])) });
      this.target = { texture: {}, resizes: 0, setSize: () => this.target.resizes++ };
    }
    getRenderTarget() { return this.target; }
    getReflectionCamera() { return { clear() {}, layers: { set() {} } }; }
  }
  const scene = new Group();
  const context = vm.createContext({
    THREE: { MeshStandardMaterial: Material, MeshPhysicalMaterial: Material,
      MeshBasicMaterial: Material, MeshLambertMaterial: Material, Color, Mesh, Group,
      PlaneGeometry: class { dispose() { this.disposed = true; } } },
    Reflector,
    LIGHTING_LAYOUT: { stationSpacing: 10, stationOffset: 5, sourceX: 0, poolRadius: 3, lensY: 6, floorY: .01 },
    window: { innerWidth: 1280, innerHeight: 720 },
  });
  vm.runInContext(`${source}\nthis.createMuseumArchitecture = createMuseumArchitecture;`, context);
  const architecture = context.createMuseumArchitecture({ scene,
    renderer: { capabilities: { maxSamples: 4 }, getPixelRatio: () => 1 }, camera: {},
    halfWidth: 3, ceilingY: 6.7, springY: 3.7, chunkLength: 14 });
  return { architecture, scene };
}

test('horror disables the reflection pass, adds a diffuse floor, and restores normal rendering without leaking the replacement', () => {
  const { architecture } = harness();
  const floor = architecture.makeFloor(200);
  const reflection = floor.children[0];
  assert.equal(floor.children.length, 1);
  assert.equal(reflection.visible, true);
  assert.equal(reflection.target.resizes, 1);
  architecture.setReflectionsEnabled(false);
  const matte = floor.children[1];
  assert.equal(reflection.visible, false, 'invisible Reflector cannot enter its onBeforeRender secondary pass');
  assert.equal(reflection.material.uniforms.poolStrength.value, 0);
  assert.equal(matte.geometry, reflection.geometry, 'reuse the floor plane');
  assert.equal(matte.material.reflectivity, 0);
  assert.equal(matte.material.fog, true);
  architecture.resize();
  architecture.setReflectionsEnabled(false);
  assert.equal(reflection.target.resizes, 1, 'disabled reflections need no framebuffer resize');
  assert.equal(floor.children.length, 2, 'repeat disable cannot allocate more planes');
  architecture.setReflectionsEnabled(true);
  assert.equal(reflection.visible, true);
  assert.equal(reflection.material.uniforms.poolStrength.value, 1);
  assert.equal(reflection.target.resizes, 2);
  assert.equal(floor.children.length, 1);
  assert.equal(matte.material.disposed, true);
  assert.equal(reflection.geometry.disposed, undefined, 'shared plane stays alive');
});

test('blackout and reflection controls remain independent, including activation before floor construction', () => {
  const { architecture } = harness();
  architecture.setReflectionsEnabled(false);
  const floor = architecture.makeFloor(200);
  const reflection = floor.children[0];
  assert.equal(reflection.visible, false);
  assert.equal(reflection.target.resizes, 0);
  architecture.setBlackout(true);
  architecture.setReflectionsEnabled(true);
  assert.equal(reflection.material.uniforms.poolStrength.value, 0, 'restoring reflections cannot relight a blacked-out hall');
  architecture.setBlackout(false);
  assert.equal(reflection.material.uniforms.poolStrength.value, 1);
  architecture.setReflectionsEnabled(false);
  architecture.setBlackout(false);
  assert.equal(reflection.material.uniforms.poolStrength.value, 0, 'disabled reflection pools stay off');
});
