const test = require('node:test');
const assert = require('node:assert/strict');

const playerModule = import('../js/museum-player.js');
const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be near ${expected}`);

function simulate(player, seconds, input = {}, yaw = 0, fps = 120) {
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) player.advance(1 / fps, input, yaw);
  return player.state;
}

function snapshot(state) {
  return { position: { ...state.position }, velocity: { ...state.velocity }, grounded: state.grounded };
}

test('fixed movement and jumping agree at 30, 60, 120, and 144 fps', async () => {
  const { createMuseumPlayer } = await playerModule;
  const results = [30, 60, 120, 144].map(fps => {
    const player = createMuseumPlayer({ halfWidth: 100 });
    simulate(player, 1, { forward: true }, 0, fps);
    simulate(player, 0.5, { forward: true, jump: true }, 0.3, fps);
    simulate(player, 0.5, { forward: true, walk: true }, 0.3, fps);
    simulate(player, 0.5, { left: true, crouch: true }, 0.3, fps);
    simulate(player, 0.5, {}, 0.3, fps);
    return snapshot(player.state);
  });
  for (const state of results.slice(1)) {
    for (const coordinate of ['x', 'y', 'z']) {
      near(state.position[coordinate], results[0].position[coordinate]);
      near(state.velocity[coordinate], results[0].velocity[coordinate]);
    }
    assert.equal(state.grounded, true);
  }
});

test('WASD diagonals are normalized and yaw changes the travel direction', async () => {
  const { createMuseumPlayer } = await playerModule;
  const straight = createMuseumPlayer({ halfWidth: 100 });
  const diagonal = createMuseumPlayer({ halfWidth: 100 });
  const turned = createMuseumPlayer({ halfWidth: 100 });
  simulate(straight, 1, { forward: true });
  simulate(diagonal, 1, { forward: true, right: true });
  simulate(turned, 1, { forward: true }, Math.PI / 2);
  near(straight.state.speed, 4.5);
  near(diagonal.state.speed, straight.state.speed);
  near(Math.hypot(diagonal.state.position.x, diagonal.state.position.z), -straight.state.position.z);
  near(turned.state.position.x, straight.state.position.z);
  near(turned.state.position.z, 0);
  near(diagonal.state.position.x, -diagonal.state.position.z);
});

test('releasing movement settles and counter-strafing brakes sooner', async () => {
  const { createMuseumPlayer } = await playerModule;
  const released = createMuseumPlayer();
  const counter = createMuseumPlayer();
  simulate(released, 1, { forward: true });
  simulate(counter, 1, { forward: true });
  const startZ = released.state.position.z;
  simulate(released, 0.05);
  simulate(counter, 0.05, { back: true });
  assert.ok(Math.abs(counter.state.velocity.z) < Math.abs(released.state.velocity.z));
  simulate(counter, 0.1, { back: true });
  assert.ok(counter.state.velocity.z > 0, 'opposite input must take over promptly');
  simulate(released, 0.5);
  near(released.state.speed, 0);
  assert.ok(startZ - released.state.position.z < 0.6, 'release has a short, controlled coast');
});

test('Shift walking and crouching reach their own speeds with a smooth, stable eye height', async () => {
  const { createMuseumPlayer } = await playerModule;
  const player = createMuseumPlayer();
  simulate(player, 1, { forward: true, walk: true });
  near(player.state.speed, 2.1);
  player.advance(1 / 60, { forward: true, crouch: true });
  assert.ok(player.state.position.y < 1.65 && player.state.position.y > 1.08);
  let previousHeight = player.state.position.y;
  for (let i = 0; i < 120; i++) {
    player.advance(1 / 120, { forward: true, crouch: true });
    assert.ok(player.state.position.y <= previousHeight + 1e-10, 'crouching cannot bob upward');
    previousHeight = player.state.position.y;
  }
  near(player.state.speed, 1.25);
  near(player.state.position.y, 1.08);
  simulate(player, 1, { forward: true });
  near(player.state.position.y, 1.65);
  near(player.state.speed, 4.5);
  assert.equal(player.state.crouched, false);
});

test('holding Space repeats bounded jumps and releasing it settles on the floor', async () => {
  const { createMuseumPlayer } = await playerModule;
  const player = createMuseumPlayer();
  let peak = 1.65;
  let takeoffs = 0;
  let wasGrounded = true;
  for (let i = 0; i < 240; i++) {
    const state = player.advance(1 / 120, { jump: true });
    if (!state.grounded && wasGrounded) takeoffs++;
    wasGrounded = state.grounded;
    peak = Math.max(peak, state.position.y);
    assert.ok(state.position.y >= 1.65);
  }
  assert.equal(takeoffs, 4);
  assert.ok(peak > 2.3 && peak < 2.4, `unexpected jump peak ${peak}`);
  simulate(player, 1, {});
  assert.equal(player.state.grounded, true);
  near(player.state.position.y, 1.65);
  player.advance(1 / 120, {});
  player.advance(1 / 120, { jump: true, crouch: true });
  assert.equal(player.state.grounded, false);
  assert.equal(player.state.crouched, true);
  simulate(player, 1, { crouch: true });
  near(player.state.position.y, 1.08);
  assert.equal(player.state.grounded, true);
});

test('brief Space presses survive a render frame shorter than the physics step', async () => {
  const { createMuseumPlayer } = await playerModule;
  const player = createMuseumPlayer();
  player.advance(0.002, { jump: true });
  player.advance(0.002, {});
  player.advance(0.005, {});
  assert.equal(player.state.grounded, false);
  assert.ok(player.state.velocity.y > 0);
});

test('air control preserves momentum, permits limited steering, and cannot build speed', async () => {
  const { createMuseumPlayer } = await playerModule;
  const player = createMuseumPlayer({ halfWidth: 100 });
  simulate(player, 1, { forward: true });
  player.advance(1 / 120, { forward: true, jump: true });
  simulate(player, 0.05, { back: true });
  assert.ok(player.state.velocity.z < -3, 'airborne input cannot instantly reverse momentum');
  simulate(player, 0.1, { right: true });
  assert.ok(player.state.velocity.x > 0 && player.state.velocity.x <= 1.4);
  assert.ok(player.state.speed <= 4.5 + 1e-10);
  for (let i = 0; i < 24; i++) {
    player.advance(1 / 120, { forward: true, right: true }, i * 0.08);
    assert.ok(player.state.speed <= 4.5 + 1e-10);
  }
});

test('side walls allow sliding; the moving rear wall blocks backward travel; forward travel stays open', async () => {
  const { createMuseumPlayer } = await playerModule;
  let rear = 4.4;
  const player = createMuseumPlayer({ rearLimitZ: () => rear });
  simulate(player, 2, { right: true, forward: true });
  near(player.state.position.x, 2.6);
  near(player.state.velocity.x, 0);
  assert.ok(player.state.position.z < -5);
  player.reset();
  simulate(player, 2, { back: true });
  near(player.state.position.z, rear);
  near(player.state.velocity.z, 0);
  rear = 2;
  player.advance(1 / 60, {});
  near(player.state.position.z, rear);
  player.reset({ x: -100, y: 1.65, z: -1000 });
  near(player.state.position.x, -2.6);
  simulate(player, 1, { forward: true });
  assert.ok(player.state.position.z < -1004);
});

test('long or invalid frames cannot teleport, and stopping clears residual movement', async () => {
  const { createMuseumPlayer } = await playerModule;
  const player = createMuseumPlayer();
  simulate(player, 1, { forward: true });
  const before = snapshot(player.state);
  player.advance(1000, { forward: true });
  assert.ok(before.position.z - player.state.position.z <= 0.45 + 1e-9);
  const after = snapshot(player.state);
  for (const dt of [0, -1, NaN, Infinity]) player.advance(dt, { right: true });
  assert.deepEqual(snapshot(player.state), after);
  player.stop();
  near(player.state.speed, 0);
  near(player.state.velocity.x, 0);
  near(player.state.velocity.z, 0);
  const stopped = snapshot(player.state);
  simulate(player, 1);
  assert.deepEqual(snapshot(player.state), stopped);
});

test('camera output interpolates between fixed steps at high refresh rates', async () => {
  const { createMuseumPlayer } = await playerModule;
  const player = createMuseumPlayer();
  simulate(player, 1, { forward: true });
  const positions = [];
  for (let i = 0; i < 8; i++) {
    positions.push(player.advance(1 / 480, { forward: true }).position.z);
  }
  for (let i = 1; i < positions.length; i++) near(positions[i - 1] - positions[i], 4.5 / 480);
});


test('explicit jump edges survive a release and repress between rendered frames', async () => {
  const { createMuseumPlayer } = await playerModule;
  const player = createMuseumPlayer();
  player.advance(1 / 120, { jump: true });
  for (let i = 0; i < 120 && !player.state.grounded; i++) player.advance(1 / 120, { jump: true });
  assert.equal(player.state.grounded, true);
  player.advance(1 / 120, { jump: true, jumpPressed: true });
  assert.equal(player.state.grounded, false);
  simulate(player, 1, {});
  assert.equal(player.state.grounded, true);
  near(player.state.position.y, 1.65);
});

test('analog movement scales speed, respects yaw and cannot exceed keyboard diagonals', async () => {
  const { createMuseumPlayer } = await import('../js/museum-player.js');
  const advance = (input, yaw = 0) => {
    const player = createMuseumPlayer({ halfWidth: 100 });
    for (let i = 0; i < 120; i++) player.advance(1 / 60, input, yaw);
    return player.state;
  };
  assert.ok(Math.abs(advance({ moveForward: 0.5 }).speed - 2.25) < 1e-6);
  assert.ok(Math.abs(advance({ moveForward: 1, moveRight: 1 }).speed - 4.5) < 1e-6);
  assert.equal(advance({ moveRight: NaN, moveForward: Infinity }).speed, 0);
  assert.ok(advance({ moveForward: 1 }, Math.PI).position.z > 0);
});

test('a finite front wall blocks forward motion and jumping while still allowing side sliding', async () => {
  const { createMuseumPlayer } = await playerModule;
  const player = createMuseumPlayer({ frontLimitZ: -2, rearLimitZ: 2 });
  simulate(player, 2, { forward: true, right: true, jump: true });
  near(player.state.position.z, -2);
  near(player.state.velocity.z, 0);
  near(player.state.position.x, 2.6);
  simulate(player, 2, { back: true });
  near(player.state.position.z, 2);
  player.reset({ z: -100 });
  near(player.state.position.z, -2);
});

test('dynamic front bounds clamp simulation, interpolation and stopped poses immediately', async () => {
  const { createMuseumPlayer } = await playerModule;
  let front = -Infinity;
  const player = createMuseumPlayer({ frontLimitZ: () => front });
  simulate(player, 1, { forward: true });
  assert.ok(player.state.position.z < -3);
  front = -2;
  player.advance(1 / 1000, { forward: true });
  near(player.state.position.z, front, 1e-10);
  near(player.state.velocity.z, 0);
  for (let i = 0; i < 40; i++) {
    player.advance(1 / 480, { forward: true });
    assert.ok(player.state.position.z >= front, 'interpolation cannot expose a view past the new front wall');
  }
  front = -1;
  player.stop();
  near(player.state.position.z, front);
  front = -Infinity;
  simulate(player, 1, { forward: true });
  assert.ok(player.state.position.z < -4, 'removing the limit restores the original open hallway');
});
