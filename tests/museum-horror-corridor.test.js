const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(new URL('../js/museum-horror-corridor.js', `file://${__filename}`), 'utf8')
  .replaceAll('export ', '');
const context = vm.createContext({});
vm.runInContext(`${source}\nthis.createHorrorCorridor = createHorrorCorridor;`, context);
const { createHorrorCorridor } = context;
const make = options => createHorrorCorridor({ frontZ: -70, rearZ: 14, startZ: 0, ...options });

function assertState(corridor, expected) {
  for (const [key, value] of Object.entries(expected)) assert.equal(corridor.state[key], value, key);
}

test('activation while facing backwards keeps the existing rear wall in place', () => {
  const corridor = make();
  const state = corridor.state;
  assert.equal(corridor.advance(0, 1), state, 'updates reuse the readable state object');
  assertState(corridor, { frontZ: -70, rearZ: 14, steps: 0, progress: 0, remainingSections: 12, finaleReady: false });
});

test('walking backwards toward the front advances darkness but never the rear wall', () => {
  const corridor = make();
  corridor.advance(-8, 1);
  assertState(corridor, { rearZ: 14, steps: 2, progress: 2 / 9, remainingSections: 12, finaleReady: false });
  corridor.advance(-30, .4);
  assertState(corridor, { rearZ: 14, steps: 5, progress: 5 / 9 });
  corridor.advance(-4, 1);
  assertState(corridor, { rearZ: 14, steps: 5, progress: 5 / 9 });
});

test('turning forward in place instantly catches the wall up to the nearest safe boundary', () => {
  const corridor = make();
  corridor.advance(-30, 1);
  corridor.advance(-30, -.15);
  assert.equal(corridor.state.rearZ, 14, 'the exact facing threshold still freezes the wall');
  corridor.advance(-30, -.151);
  assertState(corridor, { rearZ: -28, remainingSections: 6 });
  assert.ok(corridor.state.rearZ >= -30 + .6);
});

test('forward movement catches up across multiple sections without moving a wall through the player', () => {
  const corridor = make();
  corridor.advance(0, -1);
  assert.equal(corridor.state.rearZ, 7);
  corridor.advance(-22, -1);
  assertState(corridor, { rearZ: -21, remainingSections: 7 });
  corridor.advance(-27.5, -1);
  assert.equal(corridor.state.rearZ, -21, 'a boundary less than the margin behind the player is not usable');
  corridor.advance(-28.6, -1);
  assert.equal(corridor.state.rearZ, -28, 'the boundary becomes usable at the margin');
  corridor.advance(-10, -1);
  assert.equal(corridor.state.rearZ, -28, 'a backward teleport never pulls the wall backwards');
});

test('the final two sections latch the finale and cannot shrink farther', () => {
  const corridor = make();
  corridor.advance(-57, -1);
  assertState(corridor, { rearZ: -56, remainingSections: 2, steps: 9, progress: 1, finaleReady: true });
  corridor.advance(-69.4, -1);
  corridor.advance(0, 1);
  assertState(corridor, { rearZ: -56, remainingSections: 2, steps: 9, progress: 1, finaleReady: true });
});

test('reaching the front wall while looking backwards waits for the player to turn', () => {
  const corridor = make();
  corridor.advance(-69.4, 1);
  assertState(corridor, { rearZ: 14, remainingSections: 12, steps: 9, progress: 1, finaleReady: false });
  corridor.advance(-69.4, -.5);
  assertState(corridor, { rearZ: -56, remainingSections: 2, finaleReady: true });
});

test('the section grid is anchored to an arbitrary front wall, not the world origin', () => {
  const corridor = make({ frontZ: -73.25, rearZ: 13.2, startZ: -.1 });
  corridor.advance(-28.5, -1);
  assertState(corridor, { frontZ: -73.25, rearZ: -24.25, remainingSections: 7 });
  assert.equal(corridor.state.remainingSections, 7);
  corridor.advance(-45.85, -1);
  assert.equal(corridor.state.rearZ, -45.25);
  corridor.advance(-70, -1);
  assertState(corridor, { rearZ: -59.25, remainingSections: 2, finaleReady: true });
});

test('a corridor already limited to two sections is finale-ready without moving its walls', () => {
  const corridor = make({ frontZ: -14, rearZ: 0, startZ: -7 });
  assertState(corridor, { rearZ: 0, remainingSections: 2, finaleReady: true });
  corridor.advance(-13.4, -1);
  assertState(corridor, { rearZ: 0, remainingSections: 2, finaleReady: true });
});

test('wall steps remain monotone and safe across varied continuous coordinates', () => {
  for (const frontZ of [-103.14159, -71.25, 2.37]) {
    const corridor = make({ frontZ, rearZ: frontZ + 112, startZ: frontZ + 98 });
    let previousRear = corridor.state.rearZ;
    let previousProgress = 0;
    for (let z = frontZ + 98; z >= frontZ + .6; z -= .113) {
      corridor.advance(z, Math.sin(z) < 0 ? 1 : -1);
      assert.ok(corridor.state.rearZ <= previousRear);
      assert.ok(corridor.state.rearZ + 1e-10 >= z + .6);
      assert.ok(corridor.state.rearZ >= frontZ + 14);
      assert.ok(corridor.state.remainingSections >= 2);
      assert.ok(corridor.state.progress >= previousProgress && corridor.state.progress <= 1);
      previousRear = corridor.state.rearZ;
      previousProgress = corridor.state.progress;
    }
  }
});

test('invalid frame coordinates leave the corridor state untouched', () => {
  const corridor = make();
  const snapshot = JSON.stringify(corridor.state);
  corridor.advance(NaN, -1);
  corridor.advance(-40, Infinity);
  assert.equal(JSON.stringify(corridor.state), snapshot);
  assert.throws(() => make({ frontZ: NaN }), /finite/);
  assert.throws(() => make({ sectionLength: 0 }), /invalid/);
  assert.throws(() => make({ rearZ: -60 }), /two sections/);
});
