import * as CANNON from './vendor/cannon-es-0.20.0/cannon-es.js';

export const MAX_DEBRIS = 64;
const STEP = 1 / 120;
const MAX_DISTANCE = 88;

// Only detached props become dynamic bodies. Sleeping props still occupy a slot.
export function createMuseumPhysics({ halfWidth = 3, floorY = .006, ceilingY = 6.7, onFloorImpact } = {}) {
  let world = null, rear = null, floor = null, accumulator = 0;
  const bodyEntities = new Map();
  const entities = [];
  const ribs = new Map();
  let ribStations = [];
  let rearZ = 72;

  function plane(position, rotation) {
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    body.position.set(...position);
    body.quaternion.setFromEuler(...rotation);
    world.addBody(body);
    return body;
  }

  function ensureWorld() {
    if (world) return;
    world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0), allowSleep: true });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.broadphase.axisIndex = 2;
    world.solver.iterations = 12;
    world.solver.tolerance = .0001;
    world.defaultContactMaterial.friction = .58;
    world.defaultContactMaterial.restitution = .12;
    world.defaultContactMaterial.contactEquationStiffness = 1e7;
    world.defaultContactMaterial.contactEquationRelaxation = 4;
    floor = plane([0, floorY, 0], [-Math.PI / 2, 0, 0]);
    plane([-halfWidth, 0, 0], [0, Math.PI / 2, 0]);
    plane([halfWidth, 0, 0], [0, -Math.PI / 2, 0]);
    plane([0, ceilingY, 0], [Math.PI / 2, 0, 0]);
    rear = plane([0, 0, rearZ], [0, Math.PI, 0]);
    syncRibs();
  }

  function syncRibs() {
    if (!world) return;
    const wanted = new Set(ribStations);
    for (const [z, body] of ribs) if (!wanted.has(z)) { world.removeBody(body); ribs.delete(z); }
    for (const z of wanted) {
      if (ribs.has(z)) continue;
      const body = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(0, 0, z) });
      for (const side of [-1, 1]) {
        body.addShape(new CANNON.Box(new CANNON.Vec3(.128, 1.85, .155)), new CANNON.Vec3(side * (halfWidth - .128), 1.85, 0));
        body.addShape(new CANNON.Box(new CANNON.Vec3(.16, .11, .225)), new CANNON.Vec3(side * (halfWidth - .155), .11, 0));
      }
      world.addBody(body);
      ribs.set(z, body);
    }
  }

  function remove(entity) {
    const index = entities.indexOf(entity);
    if (index < 0) return;
    entities.splice(index, 1);
    world.removeBody(entity.body);
    bodyEntities.delete(entity.body);
    entity.onRemove?.();
  }

  function add({ owner, kind, position, quaternion, halfExtents, mass, onRemove }) {
    ensureWorld();
    // FIFO is creation order; re-hitting a body never makes it newer.
    while (entities.length >= MAX_DEBRIS) remove(entities[0]);
    const body = new CANNON.Body({
      mass, shape: new CANNON.Box(new CANNON.Vec3(...halfExtents)),
      position: new CANNON.Vec3(position.x, position.y, position.z),
      quaternion: new CANNON.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w),
      linearDamping: .12, angularDamping: .22,
      allowSleep: true, sleepSpeedLimit: .12, sleepTimeLimit: .9,
    });
    world.addBody(body);
    const entity = { owner, kind, body, onRemove, lastImpactAt: -Infinity,
      impactVelocity: new CANNON.Vec3(), impactRotation: new CANNON.Vec3(), impactSpeed: 0,
      impactPoint: new CANNON.Vec3() };
    bodyEntities.set(body, entity);
    entities.push(entity);
    return entity;
  }

  function hit(entity, { direction, point, heavy = false, detachSide = 0 }) {
    if (!entities.includes(entity)) return;
    const body = entity.body;
    body.wakeUp();
    const speed = (heavy ? 5.6 : 2.8) / Math.pow(body.mass, .22);
    const impulse = new CANNON.Vec3(direction.x * speed, direction.y * speed, direction.z * speed);
    if (detachSide) {
      // The wall resists the blade; the loosened prop is knocked back into the hall.
      impulse.x = -detachSide * (heavy ? 2.4 : .85);
      impulse.y = Math.max(-.2, impulse.y * .2) + (heavy ? 1 : .35);
    } else {
      // Ground strikes lift the loose prop enough for a kick instead of pinning it.
      impulse.y = Math.max(.9, impulse.y + (heavy ? 2.8 : 1.5));
    }
    const relative = new CANNON.Vec3(point.x - body.position.x, point.y - body.position.y, point.z - body.position.z);
    impulse.scale(body.mass, impulse);
    body.applyImpulse(impulse, relative);
    // Bound energy under repeated hits, especially very thin name plates.
    const angularSpeed = body.angularVelocity.length();
    if (angularSpeed > 9) body.angularVelocity.scale(9 / angularSpeed, body.angularVelocity);
    const velocity = body.velocity.length();
    if (velocity > 10) body.velocity.scale(10 / velocity, body.velocity);
  }

  function reportFloorImpacts() {
    // Read every floor contact, including a new corner of an already touching
    // frame. Pair-begin events alone miss the slap when that frame tips flat.
    for (const contact of world.contacts) {
      const floorFirst = contact.bi === floor;
      if (!floorFirst && contact.bj !== floor) continue;
      const entity = bodyEntities.get(floorFirst ? contact.bj : contact.bi);
      if (!entity) continue;
      const r = floorFirst ? contact.rj : contact.ri;
      const v = entity.impactVelocity, w = entity.impactRotation;
      // Pre-solve velocity at the contact, projected towards the floor.
      const speed = -(v.y + w.z * r.x - w.x * r.z);
      if (speed <= entity.impactSpeed) continue;
      entity.impactSpeed = speed;
      floor.position.vadd(floorFirst ? contact.ri : contact.rj, entity.impactPoint);
    }
    for (const entity of entities) {
      if (entity.impactSpeed < .7 || world.time - entity.lastImpactAt < .12) continue;
      entity.lastImpactAt = world.time;
      onFloorImpact({ kind: entity.kind, mass: entity.body.mass, speed: entity.impactSpeed,
        position: { x: entity.impactPoint.x, y: entity.impactPoint.y, z: entity.impactPoint.z } });
    }
  }

  function update(dt, playerZ) {
    for (const entity of [...entities]) {
      const p = entity.body.position;
      if (!Number.isFinite(p.x + p.y + p.z) || p.y < -3 || Math.abs(p.z - playerZ) > MAX_DISTANCE || p.z > rearZ + 1) remove(entity);
    }
    if (!world || !entities.length || !Number.isFinite(dt) || dt <= 0) { accumulator = 0; return; }
    if (entities.every(entity => entity.body.sleepState === CANNON.Body.SLEEPING)) { accumulator = 0; return; }
    accumulator += Math.min(dt, .1);
    while (accumulator + 1e-10 >= STEP) {
      if (onFloorImpact) for (const entity of entities) {
        entity.impactVelocity.copy(entity.body.velocity);
        entity.impactRotation.copy(entity.body.angularVelocity);
        entity.impactSpeed = 0;
      }
      world.step(STEP);
      if (onFloorImpact) reportFloorImpacts();
      accumulator -= STEP;
    }
  }

  return {
    add, hit, remove, update,
    get entities() { return entities; },
    get initialized() { return Boolean(world); },
    get bodyCount() { return world?.bodies.length || 0; },
    removeOwner(owner) { for (const entity of [...entities]) if (entity.owner === owner) remove(entity); },
    syncHall(stations, nextRearZ) {
      rearZ = nextRearZ;
      if (rear) { rear.position.z = rearZ; rear.aabbNeedsUpdate = true; }
      if (ribStations.length !== stations.length || ribStations.some((z, i) => z !== stations[i])) {
        ribStations = [...stations];
        syncRibs();
      }
    },
    dispose() {
      for (const entity of [...entities]) remove(entity);
      world = null; rear = null; floor = null; accumulator = 0; ribs.clear(); bodyEntities.clear();
    },
  };
}
