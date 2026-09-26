import * as THREE from 'three';
import { createHorrorCorridor } from './museum-horror-corridor.js?v=ending-20260926';

// The supplied 5.43-second scream starts at .43s; allow it to finish.
export const HORROR_FINALE_SECONDS = 6.1;

// Created only at break 24. Resident architecture stops moving; two opaque
// barriers enclose it and the rear one advances only outside the visitor's view.
export function createMuseumHorrorEnding({ scene, camera, chunks, architecture, rearWall,
  sectionLength = 7, chunkLength = 14, onBounds, onProgress, onStart, onImpact, onComplete,
  onAdd, onRemove, removeSlotDebris }) {
  const residentFrontZ = Math.min(...chunks.map(chunk => chunk.group.position.z)) - chunkLength;
  // Seal halfway from the activation position to the currently resident edge.
  // The wall stays fixed after this instant, independently of further walking.
  const frontZ = camera.position.z + (residentFrontZ - camera.position.z) / 2;
  const corridor = createHorrorCorridor({ frontZ, rearZ: rearWall.position.z,
    sectionLength, startZ: camera.position.z });
  const frontWall = architecture.makeRearWall();
  frontWall.name = 'Sealed end of the exhibition';
  frontWall.rotation.y = Math.PI;
  frontWall.position.z = frontZ;
  onAdd?.(frontWall);
  const finalSlots = chunks.flatMap(chunk => chunk.slots).filter(slot => {
    const z = slot.parent.position.z + slot.pic.position.z;
    // A half-open interval always keeps two complete pairs, even when the
    // exact midpoint lands on a painting row rather than an architectural rib.
    return z > frontZ && z <= frontZ + sectionLength * 2;
  }).sort((a, b) => a.pic.position.z + a.parent.position.z - b.pic.position.z - b.parent.position.z || a.side - b.side).slice(0, 4);
  let lastRear = NaN, lastSteps = -1, started = false, finished = false, disposed = false, elapsed = 0, impactPlayed = false;
  let faceMaterial = null;
  const flyers = [];
  const direction = new THREE.Vector3(), target = new THREE.Vector3(), cameraPosition = new THREE.Vector3();
  const cameraRotation = new THREE.Quaternion();

  function boundsChanged() {
    rearWall.position.z = corridor.state.rearZ;
    // Whole architectural chunks behind the wall become dormant. A chunk
    // straddling it stays intact; the opaque barrier occludes its rear half.
    for (const chunk of chunks) {
      chunk.group.visible = chunk.group.position.z > frontZ
        && chunk.group.position.z - chunkLength < corridor.state.rearZ;
    }
    onBounds?.(corridor.state);
    lastRear = corridor.state.rearZ;
  }

  function copyDisplay(source) {
    // Artwork userData points back to its live slot. Copy only presentation
    // state so circular application records never enter Object3D.clone().
    const copy = source.isMesh ? new THREE.Mesh(source.geometry, source.material) : new THREE.Group();
    copy.position.copy(source.position); copy.quaternion.copy(source.quaternion); copy.scale.copy(source.scale);
    copy.visible = source.visible; copy.renderOrder = source.renderOrder;
    copy.castShadow = source.castShadow; copy.receiveShadow = source.receiveShadow;
    for (const child of source.children) copy.add(copyDisplay(child));
    return copy;
  }

  function startFinale() {
    if (started || disposed) return;
    started = true;
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(cameraPosition);
    camera.getWorldQuaternion(cameraRotation);
    onStart?.();
    faceMaterial = new THREE.MeshBasicMaterial({ map: finalSlots[0]?.pic.material.map,
      color: 0xffffff, side: THREE.DoubleSide, toneMapped: false, fog: false });
    for (const [index, slot] of finalSlots.entries()) {
      removeSlotDebris?.(slot);
      const root = new THREE.Group();
      const start = slot.pic.getWorldPosition(new THREE.Vector3());
      const parts = [];
      for (const source of [slot.frame, slot.pic]) {
        source.updateWorldMatrix(true, true);
        const copy = copyDisplay(source);
        source.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
        copy.position.sub(start);
        copy.visible = true;
        if (source === slot.pic) copy.material = faceMaterial;
        parts.push({ copy, rotation: copy.quaternion.clone() });
        root.add(copy);
        source.visible = false;
      }
      slot.pic.geometry.computeBoundingBox();
      const size = slot.pic.geometry.boundingBox.getSize(new THREE.Vector3());
      root.position.copy(start); scene.add(root); onAdd?.(root);
      flyers.push({ root, start, parts, index, finalScale: .62 / Math.max(size.x, size.y, .2) });
    }
  }

  return {
    get state() { return corridor.state; },
    get active() { return started; },
    get frontLimitZ() { return frontZ + .6; },
    advance() {
      if (disposed || started) return;
      camera.getWorldDirection(direction);
      const horizontal = Math.hypot(direction.x, direction.z);
      const state = corridor.advance(camera.position.z, horizontal > .001 ? direction.z / horizontal : 0);
      if (state.rearZ !== lastRear) boundsChanged();
      if (state.steps !== lastSteps) { lastSteps = state.steps; onProgress?.(state.progress); }
      if (state.finaleReady) startFinale();
    },
    update(dt) {
      if (!started || finished || disposed || !Number.isFinite(dt) || dt <= 0) return;
      elapsed += Math.min(dt, .1);
      const t = Math.min(1, elapsed / .64), rush = t * t * t;
      for (const flyer of flyers) {
        const x = flyer.index % 2 ? .23 : -.23;
        const y = flyer.index < 2 ? -.15 : .15;
        target.set(x, y, -.62).applyQuaternion(cameraRotation).add(cameraPosition);
        flyer.root.position.lerpVectors(flyer.start, target, rush);
        flyer.root.scale.setScalar(1 + (flyer.finalScale - 1) * rush);
        for (const part of flyer.parts) part.copy.quaternion.slerpQuaternions(part.rotation, cameraRotation, Math.min(1, t * 1.6));
      }
      if (!impactPlayed && elapsed >= .43) { impactPlayed = true; onImpact?.(); }
      if (elapsed >= HORROR_FINALE_SECONDS) { finished = true; onComplete?.(); }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      onRemove?.(frontWall); scene.remove(frontWall);
      frontWall.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
      for (const { root } of flyers) { onRemove?.(root); scene.remove(root); }
      flyers.length = 0; faceMaterial?.dispose();
    },
  };
}
