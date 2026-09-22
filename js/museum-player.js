/**
 * Small, renderer-independent first-person controller for the gallery.
 * Source-inspired acceleration and counter-strafing, with restrained air control.
 * All distances are metres; yaw follows Three.js (zero looks along -Z).
 */
export const MUSEUM_PLAYER_DEFAULTS = Object.freeze({
  eyeHeight: 1.65,
  crouchEyeHeight: 1.08,
  runSpeed: 4.5,
  walkSpeed: 2.1,
  crouchSpeed: 1.25,
  groundAcceleration: 12,
  groundFriction: 7.6,
  stopSpeed: 1,
  airAcceleration: 5.5,
  airWishSpeed: 1.4,
  jumpSpeed: 4.6,
  gravity: 15.2,
  stanceResponse: 15,
  halfWidth: 3,
  wallMargin: 0.4,
  rearLimitZ: 71.4,
  fixedStep: 1 / 120,
  maxFrameTime: 0.1,
});

/**
 * Input: { forward, back, left, right, walk, crouch, jump } (booleans).
 * Optional jumpPressed preserves keydown edges when release/repress occurs between frames.
 * rearLimitZ may be a number or a function for the hall's moving rear wall.
 * Returned state and its position/velocity objects are reused; no per-frame GC.
 */
export function createMuseumPlayer(options = {}) {
  const config = { ...MUSEUM_PLAYER_DEFAULTS, ...options };
  const step = Math.max(1 / 240, Math.min(1 / 30, config.fixedStep));
  const maxFrameTime = Math.max(step, Math.min(0.25, config.maxFrameTime));
  const xLimit = Math.max(0, config.halfWidth - config.wallMargin);
  const position = { x: 0, y: config.eyeHeight, z: 0 };
  const previous = { ...position };
  const viewPosition = { ...position };
  const velocity = { x: 0, y: 0, z: 0 };
  const state = { position: viewPosition, velocity, grounded: true, crouched: false, speed: 0 };
  let feetY = 0;
  let eyeHeight = config.eyeHeight;
  let accumulator = 0;
  let jumpWasDown = false;
  let jumpPending = false;

  function rearLimit() {
    const value = typeof config.rearLimitZ === 'function'
      ? config.rearLimitZ()
      : config.rearLimitZ;
    return Number.isFinite(value) ? value : Infinity;
  }

  function clampToHall() {
    if (position.x > xLimit) {
      position.x = xLimit;
      if (velocity.x > 0) velocity.x = 0;
    } else if (position.x < -xLimit) {
      position.x = -xLimit;
      if (velocity.x < 0) velocity.x = 0;
    }
    const back = rearLimit();
    if (position.z > back) {
      position.z = back;
      if (velocity.z > 0) velocity.z = 0;
    }
  }

  function reset(pose = {}) {
    position.x = Number.isFinite(pose.x) ? pose.x : 0;
    position.z = Number.isFinite(pose.z) ? pose.z : 0;
    // Camera poses can be above the floor when returning from an artwork view.
    feetY = Number.isFinite(pose.y) ? Math.max(0, pose.y - config.eyeHeight) : 0;
    eyeHeight = config.eyeHeight;
    position.y = feetY + eyeHeight;
    velocity.x = velocity.y = velocity.z = 0;
    accumulator = 0;
    jumpWasDown = jumpPending = false;
    state.grounded = feetY === 0;
    state.crouched = false;
    state.speed = 0;
    clampToHall();
    Object.assign(previous, position);
    Object.assign(viewPosition, position);
    return state;
  }

  function stop() {
    velocity.x = velocity.y = velocity.z = 0;
    accumulator = 0;
    jumpWasDown = jumpPending = false;
    state.speed = 0;
    Object.assign(previous, position);
    Object.assign(viewPosition, position);
    return state;
  }

  function advance(dt, input = {}, yaw = 0) {
    if (!Number.isFinite(dt) || dt <= 0) return state;
    const jumpDown = Boolean(input.jump);
    if (input.jumpPressed || (jumpDown && !jumpWasDown)) jumpPending = true;
    jumpWasDown = jumpDown;
    accumulator += Math.min(dt, maxFrameTime);

    // Normalize in local space first: W+D must never run faster than W.
    let forward = Number(Boolean(input.forward)) - Number(Boolean(input.back));
    let right = Number(Boolean(input.right)) - Number(Boolean(input.left));
    const intentLength = Math.hypot(forward, right);
    if (intentLength > 0) {
      forward /= intentLength;
      right /= intentLength;
    }
    const heading = Number.isFinite(yaw) ? yaw : 0;
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    const wishX = -sin * forward + cos * right;
    const wishZ = -cos * forward - sin * right;
    const crouched = Boolean(input.crouch);
    const desiredSpeed = crouched ? config.crouchSpeed : input.walk ? config.walkSpeed : config.runSpeed;

    while (accumulator + 1e-10 >= step) {
      accumulator = Math.max(0, accumulator - step);
      previous.x = position.x;
      previous.y = position.y;
      previous.z = position.z;
      state.crouched = crouched;
      eyeHeight += ((crouched ? config.crouchEyeHeight : config.eyeHeight) - eyeHeight)
        * (1 - Math.exp(-config.stanceResponse * step));
      if (Math.abs(eyeHeight - (crouched ? config.crouchEyeHeight : config.eyeHeight)) < 0.00001) {
        eyeHeight = crouched ? config.crouchEyeHeight : config.eyeHeight;
      }

      if (state.grounded) {
        const speed = Math.hypot(velocity.x, velocity.z);
        if (speed > 0) {
          const nextSpeed = Math.max(0, speed - Math.max(speed, config.stopSpeed) * config.groundFriction * step);
          const scale = nextSpeed / speed;
          velocity.x *= scale;
          velocity.z *= scale;
        }
      }

      if (intentLength > 0) {
        const projectedSpeed = velocity.x * wishX + velocity.z * wishZ;
        const wishSpeed = state.grounded ? desiredSpeed : Math.min(desiredSpeed, config.airWishSpeed);
        const availableSpeed = wishSpeed - projectedSpeed;
        if (availableSpeed > 0) {
          const acceleration = state.grounded ? config.groundAcceleration : config.airAcceleration;
          const addedSpeed = Math.min(availableSpeed, acceleration * desiredSpeed * step);
          velocity.x += wishX * addedSpeed;
          velocity.z += wishZ * addedSpeed;
        }
      }

      // Air strafing changes direction but cannot build unlimited bunny-hop speed.
      const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
      if (horizontalSpeed > config.runSpeed) {
        const scale = config.runSpeed / horizontalSpeed;
        velocity.x *= scale;
        velocity.z *= scale;
      }

      // A held Space repeats on landing; queued edges still preserve quick taps.
      if ((jumpDown || jumpPending) && state.grounded) {
        velocity.y = config.jumpSpeed;
        state.grounded = false;
      }
      jumpPending = false;
      position.x += velocity.x * step;
      position.z += velocity.z * step;
      if (!state.grounded) {
        // Constant-acceleration integration avoids jump-height drift.
        feetY += velocity.y * step - 0.5 * config.gravity * step * step;
        velocity.y -= config.gravity * step;
        if (feetY <= 0) {
          feetY = 0;
          velocity.y = 0;
          state.grounded = true;
        }
      }
      position.y = feetY + eyeHeight;
      clampToHall();
    }
    // Interpolate the fixed simulation for smooth camera travel at any display rate.
    const alpha = Math.min(1, accumulator / step);
    viewPosition.x = previous.x + (position.x - previous.x) * alpha;
    viewPosition.y = previous.y + (position.y - previous.y) * alpha;
    viewPosition.z = Math.min(previous.z + (position.z - previous.z) * alpha, rearLimit());
    state.speed = Math.hypot(velocity.x, velocity.z);
    return state;
  }

  reset();
  return { state, reset, stop, advance };
}
