const test = require('node:test');
const assert = require('node:assert/strict');
const moduleReady = import('../js/museum-physics.js');
const at = (x, y, z) => ({ x, y, z });
const identity = { x: 0, y: 0, z: 0, w: 1 };
function prop(physics, options = {}) {
  return physics.add({ owner: {}, kind: 'artwork', position: at(0, 1.75, 0), quaternion: identity,
    halfExtents: [.65, .6, .06], mass: 3, ...options });
}
function step(physics, seconds, fps = 60) {
  for (let n = 0; n < Math.round(seconds * fps); n++) physics.update(1 / fps, 0);
}

test('physics has no world or prop bodies until the first detachment', async () => {
  const { createMuseumPhysics } = await moduleReady;
  const physics = createMuseumPhysics();
  physics.syncHall([0, -7], 50);
  step(physics, 1);
  assert.equal(physics.initialized, false);
  assert.equal(physics.bodyCount, 0);
  prop(physics);
  assert.equal(physics.entities.length, 1);
  assert.equal(physics.bodyCount, 8, 'one prop, five boundaries and two rib colliders');
  physics.dispose();
  assert.equal(physics.bodyCount, 0);
});

test('all 64 slots include sleeping props; overflow evicts the oldest creation, not the last hit', async () => {
  const { createMuseumPhysics, MAX_DEBRIS } = await moduleReady;
  const physics = createMuseumPhysics();
  const removed = [];
  for (let i = 0; i < MAX_DEBRIS; i++) prop(physics, { owner: i, onRemove: () => removed.push(i) }).body.sleep();
  const first = physics.entities[0];
  physics.hit(first, { direction: at(0, 0, -1), point: first.body.position });
  prop(physics, { owner: 64, onRemove: () => removed.push(64) });
  assert.equal(physics.entities.length, 64);
  assert.deepEqual(removed, [0]);
  assert.equal(physics.entities[0].owner, 1);
  assert.equal(physics.entities.at(-1).owner, 64);
  physics.dispose();
  assert.equal(new Set(removed).size, 65);
  assert.equal(removed.length, 65, 'each resource disposer is called once');
});

test('gravity, rotation and collisions give both stable upright and fallen resting poses', async () => {
  const { createMuseumPhysics } = await moduleReady;
  const physics = createMuseumPhysics();
  const upright = prop(physics, { position: at(-1, .61, -2) });
  const falling = prop(physics, { position: at(1, 1.7, 2), quaternion: { x: Math.sin(.2), y: 0, z: 0, w: Math.cos(.2) } });
  falling.body.angularVelocity.set(.8, .1, 0);
  step(physics, 12);
  assert.ok(upright.body.position.y > .55 && upright.body.position.y < .67);
  assert.ok(falling.body.position.y < .12, `fallen height ${falling.body.position.y}`);
  assert.ok(Math.abs(falling.body.quaternion.x) > .6);
  for (const entity of physics.entities) {
    assert.equal(entity.body.sleepState, 2, 'settled bodies sleep');
    assert.ok(entity.body.position.y >= .005);
  }
  physics.dispose();
});

test('loose props collide with each other and the walls instead of crossing them', async () => {
  const { createMuseumPhysics } = await moduleReady;
  const physics = createMuseumPhysics();
  const lower = prop(physics, { halfExtents: [.15, .15, .15], position: at(0, .16, 0) });
  const upper = prop(physics, { halfExtents: [.15, .15, .15], position: at(0, 1.5, 0) });
  const fast = prop(physics, { halfExtents: [.1, .1, .1], position: at(2.6, 1, 2) });
  fast.body.velocity.set(9, 0, 0);
  step(physics, 5);
  assert.ok(upper.body.position.y - lower.body.position.y > .28);
  assert.ok(Math.abs(fast.body.position.x) < 2.91);
  physics.dispose();
});

test('a sleeping prop can be hit again and heavy hits impart more lift and speed', async () => {
  const { createMuseumPhysics } = await moduleReady;
  const speeds = [];
  for (const heavy of [false, true]) {
    const physics = createMuseumPhysics();
    const entity = prop(physics, { halfExtents: [.2, .025, .15], position: at(0, .031, 0) });
    entity.body.sleep();
    physics.hit(entity, { direction: at(0, -.6, -.8), point: entity.body.position, heavy });
    assert.equal(entity.body.sleepState, 0);
    speeds.push(entity.body.velocity.length());
    step(physics, .2);
    assert.ok(entity.body.position.y > .05);
    assert.equal(physics.entities.length, 1, 're-hitting does not allocate another body');
    physics.dispose();
  }
  assert.ok(speeds[1] > speeds[0]);
});

test('fixed stepping agrees across frame rates and limits a long resumed frame', async () => {
  const { createMuseumPhysics } = await moduleReady;
  const positions = [];
  for (const fps of [30, 60, 144]) {
    const physics = createMuseumPhysics();
    const entity = prop(physics);
    physics.hit(entity, { direction: at(0, 0, -1), point: at(.3, 1.8, .06), heavy: true });
    step(physics, 2, fps);
    positions.push(entity.body.position.clone());
    physics.dispose();
  }
  for (const p of positions.slice(1)) assert.ok(p.distanceTo(positions[0]) < .025);
  const physics = createMuseumPhysics();
  const entity = prop(physics);
  physics.update(100, 0);
  assert.ok(entity.body.position.y > 1.6, 'no catch-up fall after a paused tab');
  physics.dispose();
});

test('distance cleanup and owner recycling release bodies once, even after re-hitting them', async () => {
  const { createMuseumPhysics } = await moduleReady;
  const physics = createMuseumPhysics();
  const owner = {}, removed = [];
  const a = prop(physics, { owner, onRemove: () => removed.push('a') });
  prop(physics, { owner, onRemove: () => removed.push('b') });
  prop(physics, { position: at(0, 1, -90), onRemove: () => removed.push('far') });
  physics.update(1 / 60, 0);
  assert.deepEqual(removed, ['far']);
  physics.hit(a, { direction: at(0, 0, -1), point: a.body.position });
  physics.removeOwner(owner);
  physics.removeOwner(owner);
  assert.deepEqual(removed, ['far', 'a', 'b']);
  assert.equal(physics.entities.length, 0);
  physics.dispose();
});

test('different blade contact heights leave a wall painting leaning or flat through contacts alone', async () => {
  const { createMuseumPhysics } = await moduleReady;
  const heights = [];
  for (const offset of [-.4, .4]) {
    const physics = createMuseumPhysics();
    const entity = prop(physics, { position: at(2.86, 1.75, 0), halfExtents: [.75, .6, .065],
      quaternion: { x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 } });
    physics.hit(entity, { direction: at(1, 0, 0), point: at(2.79, 1.75 + offset, 0), detachSide: 1 });
    step(physics, 10);
    heights.push(entity.body.position.y);
    assert.equal(entity.body.sleepState, 2);
    physics.dispose();
  }
  assert.ok(heights[0] > .4, 'a lower contact can leave the frame propped against the wall');
  assert.ok(heights[1] < .08, 'a higher contact can topple the frame flat');
});


test('floor impact reports material, contact point and pre-solve speed; resting props are silent', async () => {
  const { createMuseumPhysics } = await moduleReady;
  for (const fps of [30, 60, 144]) {
    const impacts = [], physics = createMuseumPhysics({ onFloorImpact: impact => impacts.push(impact) });
    const entity = prop(physics, { kind: 'lamp', mass: .9, halfExtents: [.1, .1, .1], position: at(1, 2, -3) });
    step(physics, .2, fps);
    assert.equal(impacts.length, 0, 'no sound while still in mid-air');
    step(physics, 6, fps);
    assert.ok(impacts.length >= 1 && impacts.length <= 4, 'only audible bounces, no contact chatter');
    assert.equal(impacts[0].kind, 'lamp');
    assert.equal(impacts[0].mass, .9);
    assert.ok(impacts[0].speed > 5 && impacts[0].speed < 7);
    assert.ok(Math.abs(impacts[0].position.y - .006) < 1e-5);
    const settled = impacts.length;
    step(physics, 3, fps);
    assert.equal(impacts.length, settled);
    physics.hit(entity, { direction: at(0, 0, -1), point: entity.body.position, heavy: true });
    step(physics, 3, fps);
    assert.ok(impacts.length > settled, 'a kicked prop sounds on its next landing');
    physics.dispose();
  }
});

test('wall contact stays silent; tipping an already-grounded frame still emits its floor slap', async () => {
  const { createMuseumPhysics } = await moduleReady;
  const impacts = [], physics = createMuseumPhysics({ onFloorImpact: impact => impacts.push(impact) });
  const wall = prop(physics, { position: at(2.7, 3, -4), halfExtents: [.1, .1, .1] });
  wall.body.velocity.set(8, 0, 0);
  step(physics, .15);
  assert.equal(impacts.length, 0);
  physics.remove(wall);
  const frame = prop(physics, { position: at(0, .608, 0) });
  step(physics, 3);
  impacts.length = 0;
  physics.hit(frame, { direction: at(0, 0, -1), point: at(0, 1.15, .06), heavy: true });
  step(physics, 5);
  assert.ok(impacts.some(impact => impact.speed > 1.5), 'rotation contributes to the floor impact');
  const count = impacts.length;
  physics.removeOwner(frame.owner); step(physics, 3);
  assert.equal(impacts.length, count, 'removed bodies cannot leave delayed sound callbacks');
  physics.dispose();
});
