import * as THREE from 'three';
import { createMuseumPhysics } from './museum-physics.js?v=audio-20260926';

const LAMP_PARTS = ['base', 'armA', 'armB', 'knuckle', 'head', 'rim', 'lens', 'glow'];

export function createMuseumDestruction({ scene, camera, reach = 3.5, halfWidth = 3, onAdd, onRemove, onFloorImpact }) {
  const physics = createMuseumPhysics({ halfWidth, onFloorImpact });
  const records = [];
  const debris = new Map();
  const raycaster = new THREE.Raycaster();
  raycaster.far = reach;
  const center = new THREE.Vector2();
  const worldPosition = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const inverse = new THREE.Matrix4();
  const scale = new THREE.Vector3();

  function registerSlot(slot) {
    const add = (kind, roots, fixture = null) => {
      const record = { kind, roots, fixture, slot, broken: false, visible: [] };
      records.push(record);
      return record;
    };
    slot.destructibles = [
      add('artwork', [slot.frame, slot.pic]),
      add('plaque', [slot.plaque]),
      add('title', [slot.titlePlaque]),
      ...slot.fixtures.map(fixture => add('lamp', LAMP_PARTS.map(part => fixture[part]), fixture)),
    ];
  }

  function available(record) {
    return !record.broken && record.slot.parent.visible &&
      (record.fixture ? record.fixture.group.visible : record.roots.some(root => root.visible));
  }

  function materialCopy(source, kind) {
    const copy = source.clone();
    if (kind === 'lamp' && 'emissiveIntensity' in copy) copy.emissiveIntensity = 0;
    return copy;
  }

  function detach(record) {
    const root = new THREE.Group();
    const ownedMaterials = new Set(), ownedGeometries = new Set();
    const reference = record.fixture?.group || record.roots[0];
    reference.updateWorldMatrix(true, true);
    inverse.copy(reference.matrixWorld).invert();
    for (const sourceRoot of record.roots) {
      sourceRoot.updateWorldMatrix(true, true);
      sourceRoot.traverse(source => {
        if (!source.isMesh || !source.visible) return;
        const materials = (Array.isArray(source.material) ? source.material : [source.material])
          .map(material => materialCopy(material, record.kind));
        materials.forEach(material => ownedMaterials.add(material));
        const copy = new THREE.Mesh(source.geometry, Array.isArray(source.material) ? materials : materials[0]);
        matrix.multiplyMatrices(inverse, source.matrixWorld);
        matrix.decompose(copy.position, copy.quaternion, copy.scale);
        copy.castShadow = true; copy.receiveShadow = true;
        // Lamp source layers are disabled by instancing; detached meshes render normally.
        copy.layers.set(0);
        root.add(copy);
      });
    }
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    const midpoint = bounds.getCenter(new THREE.Vector3());
    if ((record.kind === 'plaque' || record.kind === 'title') && size.z < .01) {
      const face = root.children[0];
      const edge = new THREE.MeshStandardMaterial({ color: 0x8b795a, roughness: .68, metalness: .3 });
      const geometry = new THREE.BoxGeometry(size.x, size.y, .028);
      ownedMaterials.add(edge); ownedGeometries.add(geometry);
      face.geometry = geometry;
      face.material = [edge, edge, edge, edge, face.material, edge];
      face.position.z -= .014;
    } else if (record.kind === 'artwork') {
      const backing = new THREE.MeshStandardMaterial({ color: 0x302a22, roughness: .95 });
      const geometry = new THREE.BoxGeometry(size.x * .97, size.y * .97, .018);
      ownedMaterials.add(backing); ownedGeometries.add(geometry);
      const panel = new THREE.Mesh(geometry, backing);
      panel.position.set(midpoint.x, midpoint.y, bounds.min.z + .01);
      root.add(panel);
    }
    root.updateMatrixWorld(true);
    bounds.setFromObject(root);
    bounds.getSize(size); bounds.getCenter(midpoint);
    for (const child of root.children) child.position.sub(midpoint);
    root.position.copy(midpoint).applyMatrix4(reference.matrixWorld);
    reference.matrixWorld.decompose(worldPosition, root.quaternion, scale);
    root.scale.copy(scale);
    scene.add(root);
    onAdd?.(root);
    root.updateMatrixWorld(true);
    record.visible = record.roots.map(source => source.visible);
    if (record.fixture) record.fixtureState = { visible: record.fixture.group.visible, lightActive: record.fixture.lightActive };
    record.roots.forEach(source => { source.visible = false; });
    record.broken = true;
    if (record.fixture) {
      record.fixture.broken = true;
      record.fixture.group.visible = false;
      record.fixture.lightActive = false;
    }
    const mass = record.kind === 'artwork' ? Math.max(1.2, size.x * size.y * 2.8)
      : record.kind === 'lamp' ? .9 : record.kind === 'plaque' ? .3 : .18;
    const item = { root, record, imageIndex: record.kind === 'artwork' ? record.slot.imageIndex : null };
    const entity = physics.add({
      owner: record.slot, kind: record.kind, position: root.position, quaternion: root.quaternion,
      halfExtents: [Math.max(.014, size.x * scale.x / 2), Math.max(.014, size.y * scale.y / 2), Math.max(.014, size.z * scale.z / 2)], mass,
      onRemove() {
        onRemove?.(root);
        scene.remove(root);
        for (const material of ownedMaterials) material.dispose();
        for (const geometry of ownedGeometries) geometry.dispose();
        debris.delete(entity);
      },
    });
    item.entity = entity;
    debris.set(entity, item);
    return item;
  }

  function strike(kind) {
    camera.updateMatrixWorld();
    raycaster.setFromCamera(center, camera);
    const hits = [];
    for (const record of records) {
      if (!available(record)) continue;
      const anchor = record.fixture?.head || record.roots[0];
      anchor.getWorldPosition(worldPosition);
      if (worldPosition.distanceTo(camera.position) > reach + 2.5) continue;
      for (const root of record.roots) {
        root.updateWorldMatrix(true, true);
        root.traverse(mesh => {
          if (!mesh.isMesh || !mesh.visible) return;
          // Direct raycast also handles the hidden instance-source layers of lamps.
          const intersections = [];
          mesh.raycast(raycaster, intersections);
          intersections.forEach(hit => hits.push({ ...hit, record }));
        });
      }
    }
    for (const item of debris.values()) {
      item.root.updateMatrixWorld(true);
      raycaster.intersectObject(item.root, true).forEach(hit => hits.push({ ...hit, item }));
    }
    hits.sort((a, b) => a.distance - b.distance);
    const hit = hits.find(candidate => candidate.distance <= reach);
    if (!hit) return false;
    const item = hit.item || detach(hit.record);
    physics.hit(item.entity, {
      direction: raycaster.ray.direction, point: hit.point, heavy: kind === 'heavy',
      detachSide: hit.item ? 0 : hit.record.slot.side,
    });
    return true;
  }

  function resetSlot(slot) {
    physics.removeOwner(slot);
    for (const record of slot.destructibles || []) {
      if (!record.broken) continue;
      record.roots.forEach((root, i) => { root.visible = record.visible[i]; });
      if (record.fixture) {
        record.fixture.broken = false;
        record.fixture.group.visible = record.fixtureState.visible;
        record.fixture.lightActive = record.fixtureState.lightActive;
      }
      record.broken = false;
    }
  }

  return {
    registerSlot, resetSlot, strike,
    resetChunk(chunk) { chunk.slots.forEach(resetSlot); },
    protectTextures(indices) { for (const item of debris.values()) if (item.imageIndex !== null) indices.add(item.imageIndex); },
    syncHall(chunks, rearZ) { physics.syncHall(chunks.flatMap(chunk => [chunk.group.position.z, chunk.group.position.z - 7]), rearZ); },
    update(dt) {
      physics.update(dt, camera.position.z);
      for (const { root, entity } of debris.values()) {
        root.position.copy(entity.body.position);
        root.quaternion.copy(entity.body.quaternion);
      }
    },
    get count() { return debris.size; },
    get bodies() { return physics.entities; },
    dispose() { physics.dispose(); records.length = 0; },
  };
}
