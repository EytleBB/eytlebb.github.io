const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(new URL('../js/museum-horror.js', `file://${__filename}`), 'utf8')
  .replace(/^import .*?;\n/gm, '').replaceAll('export ', '');

function harness({ reducedMotion = false } = {}) {
  const made = { colors: [], fog: [], materials: [], art: [], ui: [] };
  class Color { constructor(value) { this.value = value; made.colors.push(this); } }
  class Fog { constructor(color, near, far) { Object.assign(this, { color, near, far }); made.fog.push(this); } }
  class Material {
    constructor(options) { Object.assign(this, options); this.isMeshStandardMaterial = true; this.disposals = 0; made.materials.push(this); }
    onBeforeCompile() {}
    customProgramCacheKey() { return this.onBeforeCompile.toString(); }
    dispose() { this.disposals++; }
  }
  const context = vm.createContext({
    THREE: { Color, Fog, MeshStandardMaterial: Material },
    createMuseumHorrorArt(options) {
      const art = { options, artTexture: { image: {} }, plaqueTexture: {}, nameTexture: {},
        updates: [], disposals: 0, update(dt) { this.updates.push(dt); }, dispose() { this.disposals++; } };
      made.art.push(art); return art;
    },
    createMuseumHorrorUI(options) {
      const ui = { options, enables: 0, updates: [], disposals: 0,
        enable() { this.enables++; }, update(dt) { this.updates.push(dt); }, dispose() { this.disposals++; } };
      made.ui.push(ui); return ui;
    },
  });
  vm.runInContext(`${source}\nthis.api = { createMuseumHorror, horrorLampGain, HORROR_BREAK_THRESHOLD };`, context);
  const mesh = role => ({ isMesh: true, userData: { museumSurface: role }, material: { normal: role } });
  const slot = () => ({ pic: mesh('artwork'), plaque: mesh('plaque'), titlePlaque: mesh('name') });
  const root = (...nodes) => ({ traverse(visit) { nodes.forEach(visit); } });
  const slots = [slot(), slot()];
  const debrisNodes = [mesh('artwork'), mesh('plaque'), mesh('name'), mesh('frame')];
  const debris = [root(...debrisNodes)];
  const lights = [{ isAmbientLight: true, intensity: .3 }, { isHemisphereLight: true, intensity: .75 },
    { isSpotLight: true, intensity: 4 }];
  const sceneNodes = [];
  const scene = { background: { normal: 'background' }, fog: { normal: 'fog' }, environmentIntensity: .8,
    traverse(visit) { lights.forEach(visit); sceneNodes.forEach(visit); } };
  const renderer = { toneMappingExposure: 1.12 };
  const architecture = { calls: [], reflections: [], setBlackout(value) { this.calls.push(value); },
    setReflectionsEnabled(value) { this.reflections.push(value); } };
  const atmosphere = { group: { visible: true } };
  const fixtures = [];
  for (let station = 0; station < 80; station++) for (const side of [-1, 1]) {
    fixtures.push({ parent: { position: { z: -station * 7 } }, lightLocalPosition: { z: side * .4 }, side });
  }
  let activations = 0;
  const controller = context.api.createMuseumHorror({ scene, renderer, architecture, atmosphere, fixtures,
    getSlots: () => slots, forEachDebris: callback => debris.forEach(callback), reducedMotion,
    onActivate: () => { activations++; } });
  return { ...context.api, controller, made, mesh, slot, root, slots, debris, debrisNodes,
    lights, scene, sceneNodes, renderer, architecture, atmosphere, fixtures, activations: () => activations,
    activate() { for (let i = 0; i < 24; i++) controller.recordBreak(); } };
}

test('first 23 newly broken objects leave the normal museum intact and allocate no horror resources', () => {
  const h = harness();
  const originals = h.slots.map(slot => [slot.pic.material, slot.plaque.material, slot.titlePlaque.material]);
  const background = h.scene.background;
  const fog = h.scene.fog;
  for (let i = 1; i <= 23; i++) {
    h.controller.recordBreak();
    h.controller.applySlot(h.slots[0]);
    h.controller.applyDebris(h.debris[0]);
    h.controller.update(.1); h.controller.updateUI(.1);
    assert.equal(h.controller.brokenCount, i);
    assert.equal(h.controller.active, false);
  }
  assert.ok(Object.values(h.made).every(items => items.length === 0));
  assert.equal(h.activations(), 0);
  assert.deepEqual(h.architecture.calls, []);
  assert.deepEqual(h.architecture.reflections, []);
  assert.equal(h.scene.background, background); assert.equal(h.scene.fog, fog);
  assert.equal(h.scene.environmentIntensity, .8);
  assert.equal(h.renderer.toneMappingExposure, 1.12);
  assert.equal(h.atmosphere.group.visible, true);
  assert.deepEqual(h.lights.map(light => light.intensity), [.3, .75, 4]);
  assert.ok(h.fixtures.every(fixture => !('horrorGain' in fixture)));
  h.slots.forEach((slot, i) => assert.deepEqual([slot.pic.material, slot.plaque.material, slot.titlePlaque.material], originals[i]));
  h.controller.dispose();
});

test('the 24th break switches existing pictures, plaques, debris and lighting exactly once', () => {
  const h = harness();
  const frameMaterial = h.debrisNodes[3].material;
  assert.equal(h.HORROR_BREAK_THRESHOLD, 24);
  h.activate();
  assert.equal(h.controller.active, true);
  assert.equal(h.controller.brokenCount, 24);
  assert.equal(h.activations(), 1);
  assert.equal(h.made.art.length, 1); assert.equal(h.made.ui.length, 1);
  assert.equal(h.made.materials.length, 3);
  assert.equal(h.made.colors.length, 1); assert.equal(h.made.fog.length, 1);
  assert.deepEqual(h.architecture.calls, [true]);
  assert.deepEqual(h.architecture.reflections, [false]);
  assert.equal(h.atmosphere.group.visible, false);
  assert.equal(h.scene.environmentIntensity, 0);
  assert.ok(h.renderer.toneMappingExposure < 1.12 && h.renderer.toneMappingExposure > 0);
  assert.ok(h.lights[0].intensity < .3 && h.lights[0].intensity > 0);
  assert.ok(h.lights[1].intensity < .75 && h.lights[1].intensity > 0);
  assert.equal(h.lights[2].intensity, 4, 'fixture controller owns spot intensity');
  h.slots.forEach(slot => {
    assert.equal(slot.pic.material.map, h.made.art[0].artTexture);
    assert.equal(slot.plaque.material.map, h.made.art[0].plaqueTexture);
    assert.equal(slot.titlePlaque.material.map, h.made.art[0].nameTexture);
  });
  for (let i = 0; i < 3; i++) assert.equal(h.debrisNodes[i].material, h.made.materials[i]);
  assert.equal(h.debrisNodes[3].material, frameMaterial, 'frame geometry is not painted over');
  assert.ok(h.fixtures.every(fixture => fixture.horrorGain >= 0 && fixture.horrorGain <= .9));
  assert.ok(h.fixtures.filter(fixture => fixture.horrorGain > 0).length < h.fixtures.length * .3);
  assert.equal(h.made.ui[0].enables, 1);
  assert.equal(h.made.ui[0].options.artCanvas, h.made.art[0].artTexture.image);
  for (let i = 0; i < 80; i++) h.controller.recordBreak();
  assert.equal(h.controller.brokenCount, 104);
  assert.equal(h.activations(), 1);
  assert.equal(h.made.materials.length, 3);
  assert.equal(h.made.art.length, 1); assert.equal(h.made.ui.length, 1);
  h.controller.dispose();
});

test('streamed slots and later debris inherit the shared surfaces without allocating more materials', () => {
  const h = harness();
  h.activate();
  const lateSlot = h.slot();
  const lateNodes = [h.mesh('artwork'), h.mesh('plaque'), h.mesh('name'), h.mesh('lamp')];
  const lampMaterial = lateNodes[3].material;
  const lateDebris = h.root(...lateNodes);
  h.controller.applySlot(lateSlot); h.controller.applySlot(lateSlot);
  h.controller.applyDebris(lateDebris); h.controller.applyDebris(lateDebris);
  assert.equal(lateSlot.pic.material, h.slots[0].pic.material);
  assert.equal(lateSlot.plaque.material, h.slots[0].plaque.material);
  assert.equal(lateSlot.titlePlaque.material, h.slots[0].titlePlaque.material);
  for (let i = 0; i < 3; i++) assert.equal(lateNodes[i].material, h.made.materials[i]);
  assert.equal(lateNodes[3].material, lampMaterial);
  assert.equal(h.made.materials.length, 3);
  const reboundPlaque = { normal: 'new streamed plaque' };
  lateSlot.plaque.material = reboundPlaque;
  h.controller.applySlot(lateSlot);
  assert.equal(lateSlot.plaque.material, h.slots[0].plaque.material);
  h.controller.dispose();
  assert.equal(lateSlot.plaque.material, reboundPlaque, 'dispose restores the latest streamed resource');
});

test('releasing removed debris forgets its material mapping and dispose restores only live replacements', () => {
  const h = harness();
  const originals = h.slots.map(slot => [slot.pic.material, slot.plaque.material, slot.titlePlaque.material]);
  const background = h.scene.background;
  const fog = h.scene.fog;
  h.activate();
  const forgotten = h.debrisNodes[0];
  const deletedNodeMaterial = forgotten.material;
  h.controller.releaseDebris(h.root(forgotten));
  const anotherOwnerMaterial = { normal: 'replacement from another owner' };
  h.slots[0].pic.material = anotherOwnerMaterial;
  h.controller.dispose(); h.controller.dispose();
  assert.equal(h.controller.active, false);
  assert.equal(forgotten.material, deletedNodeMaterial, 'forgotten nodes are not touched during disposal');
  assert.equal(h.slots[0].pic.material, anotherOwnerMaterial, 'a newer external assignment is not overwritten');
  assert.equal(h.slots[0].plaque.material, originals[0][1]);
  assert.equal(h.slots[1].pic.material, originals[1][0]);
  assert.equal(h.scene.background, background); assert.equal(h.scene.fog, fog);
  assert.equal(h.scene.environmentIntensity, .8);
  assert.equal(h.renderer.toneMappingExposure, 1.12);
  assert.equal(h.atmosphere.group.visible, true);
  assert.deepEqual(h.lights.map(light => light.intensity), [.3, .75, 4]);
  assert.deepEqual(h.architecture.calls, [true, false]);
  assert.deepEqual(h.architecture.reflections, [false, true]);
  assert.ok(h.fixtures.every(fixture => !('horrorGain' in fixture)));
  assert.ok(h.made.materials.every(material => material.disposals === 1));
  assert.equal(h.made.art[0].disposals, 1); assert.equal(h.made.ui[0].disposals, 1);
  h.controller.recordBreak(); h.controller.update(.2); h.controller.updateUI(.2);
  assert.equal(h.controller.brokenCount, 24);
  assert.equal(h.made.art[0].updates.length, 0); assert.equal(h.made.ui[0].updates.length, 0);
});

test('surviving light positions stay sparse across distant chunks and flash independently over time', () => {
  const { horrorLampGain } = harness();
  const times = [0, .137, .571, 1.701, 3.417, 13.619, 119.173, 500.093];
  const fixtures = [];
  for (let station = -200; station < 200; station++) for (const side of [-1, 1]) fixtures.push({ z: station * 7 + side * .4, side });
  const survivors = fixtures.filter(({ z, side }) => horrorLampGain(z, side, 0, true) > 0);
  assert.ok(survivors.length > fixtures.length * .1 && survivors.length < fixtures.length * .3);
  for (const time of times) {
    const gains = fixtures.map(({ z, side }) => horrorLampGain(z, side, time));
    assert.ok(gains.every(gain => Number.isFinite(gain) && gain >= 0 && gain <= .9));
    const on = gains.filter(gain => gain > 0).length;
    assert.ok(on > 0 && on < fixtures.length * .3, `sparse fixtures at ${time} seconds`);
    for (let i = 0; i < fixtures.length; i++) {
      const { z, side } = fixtures[i];
      if (horrorLampGain(z, side, 0, true) === 0) assert.equal(gains[i], 0, 'blacked-out fixtures stay off');
      assert.equal(gains[i], horrorLampGain(z, side, time), 'the same world position and time are deterministic');
    }
  }
  const patterns = survivors.map(({ z, side }) => times.map(time => horrorLampGain(z, side, time)).join(','));
  assert.ok(new Set(patterns).size > survivors.length * .8, 'local flicker patterns differ instead of flashing together');
});

test('reduced motion preserves the sparse composition with completely steady fixture gains', () => {
  const h = harness({ reducedMotion: true });
  h.activate();
  assert.equal(h.made.art[0].options.reducedMotion, true);
  assert.equal(h.made.ui[0].options.reducedMotion, true);
  const gains = h.fixtures.map(fixture => fixture.horrorGain);
  assert.ok(gains.every(gain => gain === 0 || gain === .62));
  for (let i = 0; i < 120; i++) { h.controller.update(.1); h.controller.updateUI(.1); }
  assert.deepEqual(h.fixtures.map(fixture => fixture.horrorGain), gains);
  assert.equal(h.made.art[0].updates.length, 120, 'art owns its reduced-motion drawing policy');
  assert.equal(h.made.ui[0].updates.length, 120, 'UI owns its reduced-motion text policy');
  for (const fixture of h.fixtures) {
    const z = fixture.parent.position.z + fixture.lightLocalPosition.z;
    assert.equal(h.horrorLampGain(z, fixture.side, 5000, true), fixture.horrorGain);
  }
  h.controller.dispose();
});


test('parked menus and plaques keep shared artwork animating without a scene update', () => {
  const h = harness(); h.activate();
  const gains = h.fixtures.map(fixture => fixture.horrorGain);
  for (let i=0;i<8;i++) h.controller.updateUI(.125);
  assert.equal(h.made.art[0].updates.length, 8);
  assert.equal(h.made.ui[0].updates.length, 8);
  assert.deepEqual(h.fixtures.map(fixture => fixture.horrorGain), gains);
  h.controller.dispose();
});

function reflectiveMaterial(overrides = {}) {
  return {
    isMeshStandardMaterial: true, roughness: .3, metalness: .88,
    envMapIntensity: 1.2, clearcoat: .4, reflectivity: .7, anisotropy: .45,
    onBeforeCompile() {}, customProgramCacheKey() { return this.onBeforeCompile.toString(); },
    ...overrides,
  };
}

test('all standard and physical surfaces lose real shader specular while original shader hooks remain callable and restorable', () => {
  const h = harness();
  const calls = [];
  const originalHook = function(shader, renderer) {
    calls.push({ material: this, renderer });
    shader.fragmentShader = '// Original stone grain\n' + shader.fragmentShader;
  };
  const originalKey = function() { return 'original-stone'; };
  const material = reflectiveMaterial({ onBeforeCompile: originalHook, customProgramCacheKey: originalKey });
  const secondMaterial = reflectiveMaterial();
  const basic = { isMeshBasicMaterial: true, color: 'bronze emitter' };
  const saved = { ...material };
  h.sceneNodes.push({ isMesh: true, material: [material, secondMaterial, basic] });
  h.activate();
  for (const item of [material, secondMaterial, ...h.made.materials]) {
    assert.equal(item.roughness, 1);
    assert.equal(item.metalness, 0);
    assert.equal(item.envMapIntensity, 0);
    const shader = { fragmentShader: 'void main() {\n#include <lights_physical_fragment>\n}' };
    item.onBeforeCompile(shader, h.renderer);
    assert.match(shader.fragmentShader, /#include <lights_physical_fragment>\s+material\.specularColor = vec3\(0\.0\); material\.specularF90 = 0\.0;/,
      'roughness alone still reflects; the physical shader specular terms must be zero');
  }
  assert.equal(material.clearcoat, 0);
  assert.equal(material.reflectivity, 0);
  assert.equal(material.anisotropy, 0);
  assert.deepEqual(basic, { isMeshBasicMaterial: true, color: 'bronze emitter' });
  assert.deepEqual(calls, [{ material, renderer: h.renderer }]);
  const shader = { fragmentShader: '#include <lights_physical_fragment>' };
  material.onBeforeCompile(shader, h.renderer);
  assert.match(shader.fragmentShader, /^\/\/ Original stone grain/);
  assert.equal(material.customProgramCacheKey(), 'original-stone:horror-matte');
  h.controller.applyMatte(h.root({ isMesh: true, material }));
  const repeated = { fragmentShader: '#include <lights_physical_fragment>' };
  material.onBeforeCompile(repeated, h.renderer);
  assert.equal(repeated.fragmentShader.match(/specularColor/g).length, 1, 'applying matte twice cannot nest shader wrappers');
  h.controller.dispose();
  for (const [key, value] of Object.entries(saved)) assert.equal(material[key], value, `restore ${key}`);
  assert.equal(material.customProgramCacheKey(), 'original-stone');
  const restored = { fragmentShader: '#include <lights_physical_fragment>' };
  material.onBeforeCompile(restored, h.renderer);
  assert.match(restored.fragmentShader, /^\/\/ Original stone grain/);
  assert.doesNotMatch(restored.fragmentShader, /specularColor/);
});

test('matte shader caching retains each original hook key even with the Three default cache-key implementation', () => {
  const h = harness();
  const first = reflectiveMaterial({ onBeforeCompile(shader) { shader.fragmentShader += '\n// Material one'; } });
  const second = reflectiveMaterial({ onBeforeCompile(shader) { shader.fragmentShader += '\n// Material two'; } });
  const firstKey = first.customProgramCacheKey();
  const secondKey = second.customProgramCacheKey();
  assert.notEqual(firstKey, secondKey);
  h.sceneNodes.push({ isMesh: true, material: [first, second] });
  h.activate();
  assert.equal(first.customProgramCacheKey(), firstKey + ':horror-matte');
  assert.equal(second.customProgramCacheKey(), secondKey + ':horror-matte');
  assert.notEqual(first.customProgramCacheKey(), second.customProgramCacheKey(), 'different source hooks must not share a cached shader');
  h.controller.dispose();
  assert.equal(first.customProgramCacheKey(), firstKey);
  assert.equal(second.customProgramCacheKey(), secondKey);
});

test('progress darkens monotonically, clamps at a readable positive floor, and does not brighten on backward travel or bad input', () => {
  const h = harness({ reducedMotion: true });
  h.controller.setProgress(1);
  assert.equal(h.renderer.toneMappingExposure, 1.12, 'progress is inert before activation');
  h.activate();
  const brightness = () => [h.renderer.toneMappingExposure, ...h.lights.slice(0, 2).map(light => light.intensity),
    ...h.made.materials.map(material => material.emissiveIntensity),
    ...h.fixtures.filter(fixture => fixture.horrorGain > 0).map(fixture => fixture.horrorGain),
    h.scene.fog.near, h.scene.fog.far];
  let previous = brightness();
  for (const progress of [.25, .5, .75, 1, 10]) {
    h.controller.setProgress(progress);
    const current = brightness();
    assert.equal(current.length, previous.length);
    current.forEach((value, index) => {
      assert.ok(Number.isFinite(value) && value > 0, `readable positive lighting channel ${index}`);
      assert.ok(value <= previous[index], `lighting channel ${index} cannot brighten`);
    });
    assert.ok(h.scene.fog.far > h.scene.fog.near);
    assert.equal(h.scene.environmentIntensity, 0);
    assert.equal(h.lights[2].intensity, 4, 'fixture owner still controls direct spots');
    previous = current;
  }
  assert.ok(h.renderer.toneMappingExposure >= .5, 'retain floor visibility at the final section');
  assert.ok(h.scene.fog.far >= 20, 'the last two sections remain discernible');
  for (const progress of [.8, .1, 0, -20, NaN, Infinity, -Infinity]) {
    h.controller.setProgress(progress);
    assert.deepEqual(brightness(), previous);
  }
  h.controller.dispose();
  assert.equal(h.renderer.toneMappingExposure, 1.12);
  assert.deepEqual(h.lights.map(light => light.intensity), [.3, .75, 4]);
});

test('a returning horror visit restores the scene once without replaying break events', () => {
  const h = harness();
  assert.equal(h.controller.brokenCount, 0);
  assert.equal(h.controller.restore(), true);
  assert.equal(h.controller.active, true);
  assert.equal(h.controller.brokenCount, 24);
  assert.equal(h.activations(), 1);
  assert.equal(h.made.art.length, 1);
  assert.equal(h.made.ui.length, 1);
  assert.equal(h.slots[0].pic.material.map, h.made.art[0].artTexture);
  assert.deepEqual(h.architecture.calls, [true]);
  for (let i = 0; i < 3; i++) h.controller.restore();
  assert.equal(h.activations(), 1);
  assert.equal(h.controller.brokenCount, 24);
  assert.equal(h.made.materials.length, 3);
  h.controller.recordBreak();
  h.controller.restore();
  assert.equal(h.controller.brokenCount, 25, 'restoration never rolls back later real destruction counts');
  assert.equal(h.activations(), 1);
  h.controller.dispose();
  assert.equal(h.controller.restore(), false);
  assert.equal(h.controller.active, false);
  assert.equal(h.controller.brokenCount, 25);
  assert.equal(h.made.art.length, 1, 'disposed controllers cannot recreate horror resources');
});

test('restoring a partially completed destruction count raises it directly to the trigger', () => {
  const h = harness();
  for (let i = 0; i < 9; i++) h.controller.recordBreak();
  h.controller.restore();
  assert.equal(h.controller.brokenCount, 24);
  assert.equal(h.activations(), 1);
  h.controller.dispose();
});
