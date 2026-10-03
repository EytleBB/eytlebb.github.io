const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(new URL('../js/museum-horror-presence.js', `file://${__filename}`), 'utf8')
  .replace(/^import .*?;\n/gm, '').replaceAll('export ', '');
const context = vm.createContext({});
vm.runInContext(`${source}\nthis.plan = planHorrorPresencePosition; this.schedule = createHorrorPresenceSchedule;`, context);
const point = (x = 0, y = 1.65, z = 0) => ({ x, y, z });
const bounds = (progress = 0) => ({ frontZ: -70, rearZ: 14, progress });
const forward = () => point(0, 0, -1);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

function harness(reducedMotion = false) {
  const schedule = context.schedule({ reducedMotion });
  const pose = { player: point(), direction: forward(), bounds: bounds() };
  const cues = [];
  function advance(dt = .05) {
    const events = schedule.advance(dt, pose);
    for (const event of events) cues.push({ ...event, time: schedule.state.elapsed });
    return events;
  }
  function tick(seconds) { for (let n = 0; n < Math.round(seconds / .05); n++) advance(); }
  function spawn() {
    for (let n = 0; n < 160 && !schedule.state.visible; n++) advance();
    assert.equal(schedule.state.visible, true, 'an available corridor produces an apparition');
    return { ...schedule.state.position };
  }
  function aim() {
    const position = schedule.state.position;
    const dx = position.x - pose.player.x, dy = 2.1 - pose.player.y, dz = position.z - pose.player.z;
    const length = Math.hypot(dx, dy, dz);
    pose.direction = point(dx / length, dy / length, dz / length);
  }
  return { schedule, state: schedule.state, pose, cues, advance, tick, spawn, aim };
}

test('planned silhouettes fit the hall and sealed walls at finite 8–16 m distances', () => {
  let placements = 0;
  for (const frontZ of [-103.7, -70, 2.37]) for (const progress of [0, .25, .6, 1]) {
    const corridor = { frontZ, rearZ: frontZ + 84, progress };
    for (const x of [-2.6, 0, 2.6]) for (const zOffset of [8, 20, 42, 76]) {
      for (const dz of [-1, 1]) for (let encounter = 0; encounter < 4; encounter++) {
        const player = point(x, 1.65, frontZ + zOffset);
        const position = context.plan({ player, direction: point(.1, 0, dz), bounds: corridor, encounter });
        if (!position) continue;
        placements++;
        assert.ok(Object.values(position).every(Number.isFinite));
        assert.ok(Math.abs(position.x) <= 2, 'limbs stay within the existing collision margin');
        assert.ok(position.z >= corridor.frontZ + .9 - 1e-8);
        assert.ok(position.z <= corridor.rearZ - .9 + 1e-8);
        assert.ok(position.distance >= 8 - 1e-8 && position.distance <= 16 + 1e-8);
        near(Math.hypot(position.x - player.x, position.z - player.z), position.distance);
      }
    }
  }
  assert.ok(placements > 500, 'exercise both orientations, wall clipping and off-centre visitors');
});

test('the apparent distance closes with corridor progress while reduced motion stays farther away', () => {
  const options = { player: point(), direction: forward(), encounter: 1 };
  const distances = [0, .5, 1].map(progress => context.plan({ ...options, bounds: bounds(progress) }).distance);
  assert.deepEqual(distances, [16, 12, 8]);
  const quiet = [0, .5, 1].map(progress => context.plan({ ...options, bounds: bounds(progress), reducedMotion: true }).distance);
  assert.deepEqual(quiet, [16, 14, 12]);
  assert.equal(context.plan({ ...options, bounds: { frontZ: -5, rearZ: 5, progress: 1 } }), null);
  assert.equal(context.plan({ ...options, direction: point(1, 0, 0), bounds: bounds() }), null);
});

test('invalid coordinates and malformed corridors cannot schedule non-finite geometry', () => {
  const options = { player: point(), direction: forward(), bounds: bounds() };
  for (const overrides of [{ player: point(NaN) }, { direction: point(0, 0, Infinity) },
    { bounds: { frontZ: NaN, rearZ: 14, progress: 0 } }, { bounds: { frontZ: 14, rearZ: 0, progress: 0 } },
    { encounter: NaN }, { bounds: { frontZ: -70, rearZ: 14, progress: Infinity } }]) {
    assert.equal(context.plan({ ...options, ...overrides }), null);
  }
  const h = harness(); h.spawn();
  h.pose.bounds.rearZ = Infinity;
  const elapsed = h.state.elapsed;
  assert.equal(h.advance().length, 0);
  assert.equal(h.state.visible, false);
  assert.equal(h.state.elapsed, elapsed, 'invalid state does not advance active time');
});

test('the schedule caps delayed frames and never uses wall-clock time', () => {
  const h = harness();
  for (const dt of [NaN, Infinity, -1, 0]) assert.equal(h.advance(dt).length, 0);
  assert.equal(h.state.elapsed, 0);
  h.advance(1000);
  near(h.state.elapsed, .1);
  assert.equal(h.state.visible, false);
  h.tick(1.6);
  assert.equal(h.state.visible, false, 'a resumed frame cannot jump over the initial quiet interval');
  h.tick(.15);
  assert.equal(h.state.visible, true);
});

test('a stationary apparition fades after .65 seconds of uninterrupted aimed gaze', () => {
  const h = harness(); const position = h.spawn();
  h.pose.direction = point(0, 1, 0); h.tick(.8);
  assert.equal(h.state.opacity, 1);
  assert.equal(h.state.phase, 'watching');
  h.aim(); h.tick(.6);
  assert.equal(h.state.phase, 'watching');
  assert.deepEqual(JSON.parse(JSON.stringify(h.state.position)), position);
  h.tick(.1);
  assert.equal(h.state.phase, 'fading');
  const startOpacity = h.state.opacity;
  h.tick(.2);
  assert.ok(h.state.opacity > 0 && h.state.opacity < startOpacity, 'no one-frame flash');
  h.tick(.4);
  assert.equal(h.state.visible, false);
  assert.ok(h.state.cooldown >= 5.5);
  assert.equal(h.cues.filter(cue => cue.kind === 'whisper').length, 1);
  assert.equal(h.cues.filter(cue => cue.kind === 'sighting').length, 1);
});

test('looking away resets gaze and relocation waits for a hidden cooldown', () => {
  const h = harness(); h.spawn();
  h.aim(); h.tick(.4);
  h.pose.direction = point(0, 1, 0); h.tick(.1);
  h.aim(); h.tick(.4);
  assert.notEqual(h.state.phase, 'fading');
  h.tick(.3); h.tick(.6);
  assert.equal(h.state.visible, false);
  const encounters = h.state.encounters;
  h.pose.direction = forward(); h.tick(5);
  assert.equal(h.state.encounters, encounters);
  assert.equal(h.state.visible, false);
  h.tick(4);
  assert.equal(h.state.encounters, encounters + 1, 'one new appearance follows the entire quiet interval');
});

test('walls shrinking through a rear figure and a visitor approaching it hide it safely', () => {
  const h = harness(); h.pose.direction.z = 1; const position = h.spawn();
  h.pose.direction = point(0, 1, 0); h.tick(.8);
  h.pose.bounds.rearZ = position.z + .4; h.advance();
  assert.equal(h.state.visible, false, 'the rear wall never clips a visible figure');
  const front = harness(); const figure = front.spawn();
  front.pose.direction = point(0, 1, 0); front.tick(.8);
  front.pose.player = point(figure.x, 1.65, figure.z + 5); front.advance();
  assert.equal(front.state.phase, 'fading', 'fade begins before the overlap clearance');
  front.pose.player.z = figure.z + 3.7; front.advance();
  assert.equal(front.state.visible, false);
  assert.ok(front.state.cooldown > 5, 'safety hiding cannot respawn beside the visitor');
});

test('audio cues are finite, spatial, sparse and emitted once for each sighting', () => {
  const h = harness();
  for (let n = 0; n < 3600; n++) {
    h.pose.direction = forward();
    if (h.state.visible) h.aim();
    h.advance();
  }
  assert.ok(h.state.encounters > 10);
  assert.equal(h.cues.filter(cue => cue.kind === 'whisper').length, h.state.encounters);
  assert.ok(h.cues.filter(cue => cue.kind === 'sighting').length <= h.state.encounters);
  const steps = h.cues.filter(cue => cue.kind === 'step');
  assert.ok(steps.length > 5 && steps.length < 30);
  for (let n = 0; n < h.cues.length; n++) {
    const cue = h.cues[n];
    assert.ok(['step', 'whisper', 'sighting'].includes(cue.kind));
    assert.ok(Object.values(cue.position).every(Number.isFinite));
    assert.ok(Math.abs(cue.position.x) <= 2);
    assert.ok(cue.position.z >= -69.1 && cue.position.z <= 13.1);
    if (n) assert.ok(cue.time - h.cues[n - 1].time >= 1 - 1e-8, 'no per-frame cue bursts');
  }
  for (const cue of steps) assert.ok(Math.hypot(cue.position.x, cue.position.z) >= 1.4);
});

test('reduced motion uses slower static appearances and stops them before a close encounter', () => {
  const h = harness(true); h.tick(5.9);
  assert.equal(h.state.visible, false);
  const position = h.spawn();
  assert.ok(h.state.distance >= 12);
  h.pose.direction = point(0, 1, 0); h.tick(.5);
  assert.ok(h.state.opacity > 0 && h.state.opacity < .5, 'the appearance fades gently over 1.2 s');
  assert.deepEqual(JSON.parse(JSON.stringify(h.state.position)), position);
  h.tick(1);
  assert.equal(h.state.opacity, 1);
  h.pose.player = point(position.x, 1.65, position.z + 9.9); h.advance();
  assert.equal(h.state.visible, false);
  assert.ok(h.state.cooldown >= 13);
});

test('pause, focus and finale disable visibility, cues and all active timers; disposal is permanent', () => {
  const h = harness(); h.spawn(); h.tick(.2);
  h.schedule.setEnabled(false);
  assert.equal(h.state.visible, false);
  const elapsed = h.state.elapsed, cooldown = h.state.cooldown, cues = h.cues.length;
  for (let n = 0; n < 100; n++) { h.schedule.setEnabled(false); h.advance(1000); }
  assert.equal(h.state.elapsed, elapsed);
  assert.equal(h.state.cooldown, cooldown);
  assert.equal(h.cues.length, cues);
  h.schedule.setEnabled(true); h.tick(2);
  assert.equal(h.state.visible, false, 'resume leaves a quiet interval');
  h.schedule.dispose(); h.schedule.dispose(); h.schedule.setEnabled(true); h.tick(20);
  assert.equal(h.state.phase, 'disposed');
  assert.equal(h.state.enabled, false);
  assert.equal(h.state.visible, false);
  assert.equal(h.cues.length, cues);
});

test('scene controller has a bounded geometry budget and releases only its owned resources', () => {
  const geometries = [], materials = [];
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
    set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
    copy(point) { return this.set(point.x, point.y, point.z); }
  }
  class Group {
    constructor() { this.position = new Vector3(); this.scale = new Vector3(1, 1, 1); this.rotation = { x: 0, y: 0, z: 0 }; this.children = []; }
    add(child) { this.children.push(child); child.parent = this; }
    remove(child) { this.children = this.children.filter(item => item !== child); }
  }
  class Mesh extends Group { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
  class Geometry { constructor() { this.disposals = 0; geometries.push(this); } dispose() { this.disposals++; } }
  class Material { constructor(options) { Object.assign(this, options); this.disposals = 0; materials.push(this); } dispose() { this.disposals++; } }
  const scene = new Group(), camera = new Group(), texture = { disposals: 0, dispose() { this.disposals++; } };
  camera.position.set(0, 1.65, 0);
  camera.getWorldPosition = target => target.copy(camera.position);
  camera.getWorldDirection = target => target.set(0, 0, -1);
  const wrapped = vm.createContext({ THREE: { Vector3, Group, Mesh, CylinderGeometry: Geometry, SphereGeometry: Geometry,
    PlaneGeometry: Geometry, MeshBasicMaterial: Material } });
  vm.runInContext(`${source}\nthis.create = createMuseumHorrorPresence;`, wrapped);
  const cues = [];
  const controller = wrapped.create({ scene, camera, artTexture: texture, getBounds: () => bounds(),
    onCue: (kind, position) => cues.push({ kind, position }) });
  assert.equal(scene.children.length, 1);
  const group = scene.children[0];
  assert.equal(group.children.length, 7);
  assert.equal(geometries.length, 3); assert.equal(materials.length, 2);
  assert.equal(materials[1].map, texture);
  for (let n = 0; n < 24; n++) controller.update(.1);
  assert.equal(controller.state.visible, true);
  assert.equal(group.visible, true);
  near(group.position.z, controller.state.position.z);
  assert.ok(materials[0].opacity > 0);
  assert.equal(cues.filter(cue => cue.kind === 'whisper').length, 1);
  controller.setEnabled(false);
  assert.equal(group.visible, false);
  assert.equal(materials[0].opacity, 0);
  controller.dispose(); controller.dispose(); controller.update(1000); controller.setEnabled(true);
  assert.equal(scene.children.length, 0);
  assert.ok(geometries.every(resource => resource.disposals === 1));
  assert.ok(materials.every(resource => resource.disposals === 1));
  assert.equal(texture.disposals, 0, 'the shared horror artwork remains owned by its original module');
  assert.equal(controller.state.phase, 'disposed');
});
