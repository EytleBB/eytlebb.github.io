import * as THREE from 'three';

const MAX_X = 2;
const WALL_MARGIN = .9;
const GAZE_SECONDS = .65;
const fract = value => value - Math.floor(value);
const hash = value => fract(Math.sin(value * 73.17 + 19.41) * 43758.5453);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finitePoint = point => point && [point.x, point.y, point.z].every(Number.isFinite);
const validBounds = bounds => bounds && [bounds.frontZ, bounds.rearZ, bounds.progress].every(Number.isFinite)
  && bounds.rearZ - bounds.frontZ > WALL_MARGIN * 2;

// Pure placement math also serves the diagnostic harness. The figure occupies
// less than .45 m around its origin and never enters the hall's .4 m wall margin.
export function planHorrorPresencePosition({ player, direction, bounds, encounter = 0, reducedMotion = false }) {
  if (!finitePoint(player) || !finitePoint(direction) || !validBounds(bounds) || !Number.isFinite(encounter)) return null;
  encounter = Math.max(0, Math.floor(encounter));
  const horizontal = Math.hypot(direction.x, direction.z);
  if (horizontal < .001 || Math.abs(direction.z) / horizontal < .35) return null;
  const progress = clamp(bounds.progress, 0, 1);
  const minimum = reducedMotion ? 12 : 8;
  const desired = (reducedMotion ? 16 - 4 * progress : 16 - 8 * progress);
  const side = encounter % 2 ? -1 : 1;
  const x = clamp(player.x + direction.x / horizontal * desired + side * (1.1 + hash(encounter + 3) * .9), -MAX_X, MAX_X);
  const dx = x - player.x;
  const forward = Math.sign(direction.z);
  const available = forward < 0 ? player.z - bounds.frontZ - WALL_MARGIN
    : bounds.rearZ - WALL_MARGIN - player.z;
  if (available <= 0 || Math.abs(dx) >= minimum) return null;
  const distance = Math.min(desired, Math.hypot(available, dx));
  if (distance < minimum) return null;
  const dz = forward * Math.sqrt(Math.max(0, distance * distance - dx * dx));
  // Looking across the hall should not produce a whisper from a figure that
  // appeared completely behind the visitor's field of view.
  if ((dx * direction.x + dz * direction.z) / (distance * horizontal) < .66) return null;
  return { x, y: 0, z: player.z + dz, distance,
    yaw: Math.atan2(player.x - x, -dz) };
}

export function createHorrorPresenceSchedule({ reducedMotion = false } = {}) {
  const state = { enabled: true, phase: 'hidden', visible: false, opacity: 0,
    position: { x: 0, y: 0, z: 0 }, yaw: 0, distance: 0, progress: 0,
    elapsed: 0, encounters: 0, cooldown: reducedMotion ? 6 : 1.8 };
  let disposed = false, age = 0, gaze = 0, fadeStart = 0, spotted = false, noticed = false;
  let cueAge = Infinity, stepWait = reducedMotion ? 16 : 7.5;
  const fadeSeconds = reducedMotion ? 1.2 : .5;

  function hide() {
    state.phase = 'hidden'; state.visible = false; state.opacity = 0;
    state.cooldown = (reducedMotion ? 13 : 5.5) + hash(state.encounters + 17) * (reducedMotion ? 5 : 3);
    gaze = 0; age = 0; spotted = false; noticed = false;
  }

  function beginFade() {
    if (state.phase === 'fading') return;
    state.phase = 'fading'; fadeStart = state.opacity; age = 0;
  }

  function emit(cues, kind, position) {
    if (cueAge < 1 || cues.length) return false;
    cues.push({ kind, position: { x: position.x, y: position.y, z: position.z } });
    cueAge = 0;
    return true;
  }

  return {
    state,
    setEnabled(enabled) {
      if (disposed || state.enabled === Boolean(enabled)) return;
      state.enabled = Boolean(enabled);
      // Pausing or opening an artwork hides the apparition immediately. Resume
      // starts with quiet active time instead of resurrecting a close figure.
      if (!state.enabled) hide();
    },
    advance(dt, { player, direction, bounds } = {}) {
      const cues = [];
      if (disposed || !state.enabled || !Number.isFinite(dt) || dt <= 0) return cues;
      if (!finitePoint(player) || !finitePoint(direction) || !validBounds(bounds)) {
        if (state.visible) hide();
        return cues;
      }
      dt = Math.min(dt, .1);
      state.elapsed += dt; cueAge += dt; stepWait -= dt;
      state.progress = clamp(bounds.progress, 0, 1);
      const clearance = reducedMotion ? 10 : 3.8;
      if (state.visible) {
        const dx = state.position.x - player.x, dz = state.position.z - player.z;
        state.distance = Math.hypot(dx, dz);
        // A newly sealed wall can invalidate a rear apparition in one frame.
        // Remove it before drawing rather than moving it through opaque stone.
        if (state.position.z < bounds.frontZ + WALL_MARGIN - 1e-8
          || state.position.z > bounds.rearZ - WALL_MARGIN + 1e-8
          || state.distance <= clearance) hide();
      }
      if (!state.visible) {
        state.cooldown -= dt;
        if (state.cooldown <= 0) {
          const position = planHorrorPresencePosition({ player, direction, bounds,
            encounter: state.encounters, reducedMotion });
          if (position) {
            Object.assign(state.position, { x: position.x, y: 0, z: position.z });
            state.distance = position.distance; state.yaw = position.yaw;
            state.phase = 'appearing'; state.visible = true; state.opacity = 0;
            state.encounters++; age = 0; gaze = 0; spotted = false; noticed = false;
            emit(cues, 'whisper', { ...state.position, y: 2.7 });
          } else state.cooldown = 1;
        }
      } else {
        age += dt;
        if (state.phase === 'fading') {
          state.opacity = fadeStart * Math.max(0, 1 - age / fadeSeconds);
          if (age >= fadeSeconds) hide();
        } else {
          state.opacity = Math.min(1, age / fadeSeconds);
          if (age >= fadeSeconds) state.phase = 'watching';
          const dx = state.position.x - player.x, dy = 2.1 - player.y, dz = state.position.z - player.z;
          const length = Math.hypot(dx, dy, dz) * Math.hypot(direction.x, direction.y, direction.z);
          const dot = length > .001 ? (dx * direction.x + dy * direction.y + dz * direction.z) / length : -1;
          if (dot > .975) noticed = true;
          gaze = dot > .9945 ? gaze + dt : 0;
          if (gaze >= GAZE_SECONDS || age >= (reducedMotion ? 8 : 5.5)
            || state.distance < clearance + 2) beginFade();
        }
        if (state.visible && noticed && !spotted) spotted = emit(cues, 'sighting', { ...state.position, y: 2.1 });
      }
      if (stepWait <= 0) {
        const horizontal = Math.hypot(direction.x, direction.z);
        const pendingAppearance = !state.visible && state.cooldown <= 1.15
          && planHorrorPresencePosition({ player, direction, bounds, encounter: state.encounters, reducedMotion });
        if (horizontal > .001 && !pendingAppearance) {
          const position = { x: clamp(player.x - direction.x / horizontal * 2.4, -MAX_X, MAX_X), y: .05,
            z: clamp(player.z - direction.z / horizontal * 2.4, bounds.frontZ + WALL_MARGIN, bounds.rearZ - WALL_MARGIN) };
          const dx = position.x - player.x, dz = position.z - player.z;
          const distance = Math.hypot(dx, dz);
          if (distance >= 1.4 && distance <= 3.5
            && (dx * -direction.x + dz * -direction.z) / (distance * horizontal) > .2) emit(cues, 'step', position);
        }
        // Even a blocked cue consumes its turn: a nearby wall never causes a
        // repeated sound attempt on every frame.
        stepWait = (reducedMotion ? 16 : 7.5 - state.progress) + hash(state.encounters + 51) * 4;
      }
      return cues;
    },
    dispose() {
      if (disposed) return;
      disposed = true; state.enabled = false; state.visible = false;
      state.opacity = 0; state.phase = 'disposed';
    },
  };
}

export function createMuseumHorrorPresence({ scene, camera, artTexture, getBounds, onCue, reducedMotion = false }) {
  const schedule = createHorrorPresenceSchedule({ reducedMotion });
  const group = new THREE.Group(); group.name = 'Horror corridor presence'; group.visible = false;
  const limbGeometry = new THREE.CylinderGeometry(1, 1, 1, 6);
  const headGeometry = new THREE.SphereGeometry(1, 8, 6);
  const faceGeometry = new THREE.PlaneGeometry(.34, .46);
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x030205, transparent: true, opacity: 0,
    depthWrite: false, fog: true });
  const faceMaterial = new THREE.MeshBasicMaterial({ map: artTexture, color: 0x88777c,
    transparent: true, opacity: 0, depthWrite: false, fog: true });
  function part(geometry, material, position, scale, tilt = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position); mesh.scale.set(...scale); mesh.rotation.z = tilt;
    mesh.castShadow = false; mesh.receiveShadow = false; group.add(mesh); return mesh;
  }
  part(limbGeometry, shadowMaterial, [0, 1.99, 0], [.23, 1.42, .13]);
  part(headGeometry, shadowMaterial, [0, 2.87, 0], [.22, .3, .19]);
  part(limbGeometry, shadowMaterial, [-.35, 1.49, 0], [.052, 1.92, .052], -.07);
  part(limbGeometry, shadowMaterial, [.35, 1.49, 0], [.052, 1.92, .052], .07);
  part(limbGeometry, shadowMaterial, [-.115, .65, 0], [.062, 1.28, .062], -.035);
  part(limbGeometry, shadowMaterial, [.115, .65, 0], [.062, 1.28, .062], .035);
  part(faceGeometry, faceMaterial, [0, 2.875, .194], [1, 1, 1]);
  scene.add(group);
  const player = new THREE.Vector3(), direction = new THREE.Vector3();
  let disposed = false;
  function sync() {
    const state = schedule.state;
    group.visible = state.visible;
    group.position.set(state.position.x, state.position.y, state.position.z);
    group.rotation.y = state.yaw;
    shadowMaterial.opacity = state.opacity; faceMaterial.opacity = state.opacity * .8;
  }
  return {
    get state() { return schedule.state; },
    update(dt) {
      if (disposed || !schedule.state.enabled) return;
      camera.getWorldPosition(player); camera.getWorldDirection(direction);
      const cues = schedule.advance(dt, { player, direction, bounds: getBounds() });
      sync();
      for (const cue of cues) onCue?.(cue.kind, cue.position);
    },
    setEnabled(enabled) { if (!disposed) { schedule.setEnabled(enabled); sync(); } },
    dispose() {
      if (disposed) return;
      disposed = true; schedule.dispose(); scene.remove(group);
      for (const geometry of [limbGeometry, headGeometry, faceGeometry]) geometry.dispose();
      shadowMaterial.dispose(); faceMaterial.dispose();
    },
  };
}
