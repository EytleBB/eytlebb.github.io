const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const museum = fs.readFileSync(path.join(root, 'js/museum.js'), 'utf8');
const physics = fs.readFileSync(path.join(root, 'js/museum-physics.js'), 'utf8');
const names = ['SPAWN_Z', 'CHUNK_LEN', 'INITIAL_TEXTURE_START', 'INITIAL_TEXTURE_COUNT',
  'PREFETCH_AHEAD_DISTANCE', 'KEEP_BEHIND_DISTANCE', 'MAX_RESIDENT_TEXTURES',
  'RECYCLE_BACK_BUFFER', 'INITIAL_REAR_WALL_DISTANCE', 'REAR_WALL_OFFSET', 'FORWARD_VIEW_BUFFER',
  'CHUNK_RETARGET_PREPARE_DISTANCE', 'CHUNK_RETARGET_FRAME_BUDGET_MS', 'POOL', 'FLOOR_LEN', 'ART_PER_SIDE', 'ART_SPACING'];
function declaration(source, name) {
  const match = source.match(new RegExp(`(?:export )?const ${name} = [\\s\\S]*?;`));
  assert.ok(match, `missing production constant ${name}`);
  return match[0].replace('export ', '');
}
const constants = names.map(name => declaration(museum, name)).join('\n');
const hallCode = museum.slice(museum.indexOf('function makeChunk('), museum.indexOf('const artWorldPos ='));
const near = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 1e-8,
  `${message}: ${actual} should equal ${expected}`);

function hall() {
  let id = 0;
  const recycled = [], prepared = [], collisions = [], created = [];
  class Group { constructor() { this.id = ++id; this.position = { z: 0 }; this.visible = true; } }
  const context = vm.createContext({
    THREE: { Group },
    scene: { add(group) { created.push(group); } },
    architecture: { attachChunk() {}, makeFloor: length => ({ position: { z: 0 }, length }), makeRearWall: () => ({ position: { z: 0 } }) },
    makeArtwork: (parent, side, z, imageIndex) => ({ parent, side, imageIndex, pic: { position: { z } } }),
    ensurePictureSpotPool() {}, buildSpeakerPool() {},
    destruction: { resetChunk() {}, syncHall(chunks, rearZ) { collisions.push({ rearZ, chunkCount: chunks.length }); } },
    setArtTexture(slot, index) { slot.imageIndex = index; },
    chunks: [], camera: { position: { z: 0 } }, floorRig: null, rearWall: null,
    nextImageIndex: 0, chunkRetargetQueue: [], museumHorror: { active: false },
    PERF_AUTOWALK: false, perfChunkRetargets: 0, performance: { now: () => 0 }, recycled, prepared,
  });
  const api = vm.runInContext(`${constants}\n${hallCode}
    const originalReserve = reserveChunkRetarget;
    reserveChunkRetarget = function(chunk) {
      if (!chunk.pendingRetarget) prepared.push({ id: chunk.group.id, distance: chunk.group.position.z - camera.position.z });
      return originalReserve(chunk);
    };
    const originalFinish = finishChunkRetarget;
    finishChunkRetarget = function(chunk) {
      recycled.push({ id: chunk.group.id, distance: chunk.group.position.z - camera.position.z,
        nearestPicture: Math.min(...chunk.slots.map(slot => chunk.group.position.z + slot.pic.position.z - camera.position.z)),
        prepared: Boolean(chunk.pendingRetarget) });
      return originalFinish(chunk);
    };
    ({ constants: { ${names.join(',')} }, chunks, buildHall, recycleChunks, prepareHiddenRearChunk,
      processChunkRetargetQueue, get rearWall() { return rearWall; }, get floor() { return floorRig; } });`, context);
  return { api, context, recycled, prepared, collisions, created,
    build() { api.buildHall(); },
    at(z) { context.camera.position.z = z; api.recycleChunks(); api.processChunkRetargetQueue(0); },
  };
}

test('birth rear wall is exactly two thirds of the former 58 m and prewarming does not move it', () => {
  const h = hall(); h.build();
  const expected = 58 * 2 / 3;
  near(h.api.rearWall.position.z - h.api.constants.SPAWN_Z, expected, 'physical rear wall');
  near(h.api.constants.REAR_WALL_OFFSET - h.api.constants.CHUNK_LEN, expected, 'offset includes one full chunk');
  assert.equal(h.api.chunks.length, 26);
  const positions = h.api.chunks.map(chunk => chunk.group.position.z);
  for (let i = 0; i < 12; i++) h.at(0);
  assert.deepEqual(h.api.chunks.map(chunk => chunk.group.position.z), positions);
  near(h.api.rearWall.position.z, expected);
  assert.equal(h.recycled.length, 0, 'the forward extension must not steal the initial rear chunks');
  assert.equal(h.prepared.length, 0);
  near(h.collisions.at(-1).rearZ, expected, 'collision wall matches the visual wall');
});

test('geometry and texture lookahead extend by three halves without changing cleanup budgets', () => {
  const { constants: c } = hall().api;
  assert.equal(c.FORWARD_VIEW_BUFFER, 255);
  assert.equal(c.PREFETCH_AHEAD_DISTANCE, 150);
  assert.equal(c.POOL, 26);
  assert.equal(c.RECYCLE_BACK_BUFFER, 112);
  assert.equal(c.KEEP_BEHIND_DISTANCE, 42);
  assert.equal(c.CHUNK_RETARGET_PREPARE_DISTANCE, 88);
  assert.equal(c.MAX_RESIDENT_TEXTURES, 60);
  const physical = vm.runInNewContext(`${declaration(physics, 'MAX_DISTANCE')}\n${declaration(physics, 'MAX_DEBRIS')}\n({ MAX_DISTANCE, MAX_DEBRIS });`);
  assert.equal(physical.MAX_DISTANCE, 88);
  assert.equal(physical.MAX_DEBRIS, 64);
});

test('initial 56-texture preload covers all 54 art slots in the effective 150 m forward range', () => {
  const h = hall(); h.build();
  const c = h.api.constants;
  const protectedSlots = h.api.chunks.flatMap(chunk => chunk.slots).filter(slot => {
    const ahead = c.SPAWN_Z - slot.parent.position.z - slot.pic.position.z;
    return ahead >= -c.KEEP_BEHIND_DISTANCE && ahead <= c.PREFETCH_AHEAD_DISTANCE;
  });
  assert.equal(protectedSlots.length, 54);
  assert.equal(c.INITIAL_TEXTURE_START, 0);
  assert.equal(c.INITIAL_TEXTURE_COUNT, 56);
  for (const slot of protectedSlots) assert.ok(slot.imageIndex >= c.INITIAL_TEXTURE_START &&
    slot.imageIndex < c.INITIAL_TEXTURE_START + c.INITIAL_TEXTURE_COUNT, `slot ${slot.imageIndex} misses the entrance preload`);
  assert.ok(c.INITIAL_TEXTURE_COUNT <= c.MAX_RESIDENT_TEXTURES);
  assert.ok(protectedSlots.some(slot => slot.parent.position.z + slot.pic.position.z < -140), 'verification reaches the newly extended front range');
});

test('rear preparation begins at the existing 88 m boundary and does not duplicate a pending plan', () => {
  const h = hall(); h.build();
  const rear = h.api.chunks.reduce((a, b) => a.group.position.z > b.group.position.z ? a : b);
  h.context.camera.position.z = rear.group.position.z - 88 + .001;
  h.api.prepareHiddenRearChunk(h.context.camera.position.z);
  assert.equal(h.prepared.length, 0);
  h.context.camera.position.z = rear.group.position.z - 88;
  h.api.prepareHiddenRearChunk(h.context.camera.position.z);
  assert.equal(h.prepared.length, 1);
  near(h.prepared[0].distance, 88);
  const pending = rear.pendingRetarget;
  h.api.prepareHiddenRearChunk(h.context.camera.position.z);
  assert.equal(h.prepared.length, 1);
  assert.equal(rear.pendingRetarget, pending);
});

test('a long forward walk keeps 26 contiguous unique chunks and only recycles fully hidden artwork', () => {
  const h = hall(); h.build();
  const c = h.api.constants;
  const originalChunks = new Set(h.api.chunks);
  for (let step = 0; step <= 5600; step++) {
    const z = -step * .5;
    h.at(z);
    assert.equal(h.api.chunks.length, 26);
    assert.ok(h.api.chunks.every(chunk => originalChunks.has(chunk)), 'all chunks are reused');
    const positions = h.api.chunks.map(chunk => chunk.group.position.z).sort((a, b) => b - a);
    assert.equal(new Set(positions).size, 26);
    for (let index = 1; index < positions.length; index++) near(positions[index - 1] - positions[index], c.CHUNK_LEN, 'no structural gap');
    assert.ok(z - positions.at(-1) >= c.FORWARD_VIEW_BUFFER - 1e-8);
    assert.ok(positions[0] > z, 'a rear boundary remains behind the player');
    near(h.api.rearWall.position.z, positions[0]);
    near(h.api.floor.position.z, z);
    assert.equal(new Set(h.api.chunks.flatMap(chunk => chunk.slots.map(slot => slot.imageIndex))).size, 104);
  }
  assert.ok(h.recycled.length > 180, 'walk crosses many complete pool lengths');
  for (const item of h.recycled) {
    assert.ok(item.distance >= 88, `chunk recycled at only ${item.distance} m`);
    assert.ok(item.nearestPicture > 82, `nearest picture remains visible at ${item.nearestPicture} m`);
    assert.equal(item.prepared, true, 'incremental retarget preparation precedes the actual move');
  }
  assert.ok(h.prepared.every(item => item.distance >= 88));
  assert.equal(h.created.length, 26, 'walking never allocates additional scene chunks');
});

test('horror freezes resident chunks and retarget work while the floor can still follow the player', () => {
  const h = hall(); h.build();
  h.at(-100);
  h.context.museumHorror.active = true;
  const positions = h.api.chunks.map(chunk => chunk.group.position.z);
  const indices = h.api.chunks.flatMap(chunk => chunk.slots.map(slot => slot.imageIndex));
  const rear = h.api.rearWall.position.z;
  const moved = h.recycled.length, plans = h.prepared.length, bounds = h.collisions.length;
  for (const z of [-150, -300, -1000]) h.at(z);
  assert.deepEqual(h.api.chunks.map(chunk => chunk.group.position.z), positions);
  assert.deepEqual(h.api.chunks.flatMap(chunk => chunk.slots.map(slot => slot.imageIndex)), indices);
  assert.equal(h.recycled.length, moved); assert.equal(h.prepared.length, plans);
  assert.equal(h.collisions.length, bounds, 'the ending controller owns horror wall bounds');
  near(h.api.rearWall.position.z, rear);
  near(h.api.floor.position.z, -1000);
});
