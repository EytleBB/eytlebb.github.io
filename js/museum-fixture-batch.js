import * as THREE from 'three';

// The lamp objects remain the source of every transform and spotlight target.
// Rendering their nine repeated parts through instance buffers avoids one draw
// call for each tiny fitting, in both the main view and the floor reflection.
const PARTS = ['base', 'armA', 'armB', 'knuckle', 'head', 'rim', 'lens', 'glow', 'wash'];

export function createMuseumFixtureBatch({ scene, fixtures, camera, maxDistance = 90 }) {
  if (!fixtures.length) throw new Error('Build the museum fixtures before batching them.');
  const capacity = fixtures.length;
  const batches = [];
  const previousLayers = new WeakMap();
  const replacedGeometries = new Set();
  const keptGeometries = new Set(PARTS.map(part => fixtures[0][part].geometry));
  const parentMatrix = new THREE.Matrix4();
  const groupMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  let disposed = false;

  for (const part of PARTS) {
    const reference = fixtures[0][part];
    const mesh = new THREE.InstancedMesh(reference.geometry, reference.material, capacity);
    mesh.name = `Picture light instances: ${part}`;
    mesh.layers.mask = reference.layers.mask;
    mesh.renderOrder = reference.renderOrder;
    mesh.castShadow = reference.castShadow;
    mesh.receiveShadow = reference.receiveShadow;
    // Instances span recycled chunks. The compacted range below handles distance;
    // stale aggregate bounds must never hide nearby lamps after a chunk moves.
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    scene.add(mesh);
    batches.push({ part, mesh, count: 0 });

    for (const fixture of fixtures) {
      const source = fixture[part];
      previousLayers.set(source, source.layers.mask);
      // Do not change source/group visibility: the existing light pool and
      // resizePictureLight() use those flags to activate one or two lamps.
      source.layers.disableAll();
      if (source.geometry !== reference.geometry) {
        replacedGeometries.add(source.geometry);
        source.geometry = reference.geometry;
      }
    }
  }
  // The old builder constructs identical cylinders/spheres for each fixture.
  // Keep one geometry per component; lamp rods already use unit-length geometry
  // with length expressed through scale.y, so their transforms remain exact.
  for (const geometry of replacedGeometries) {
    if (!keptGeometries.has(geometry)) geometry.dispose();
  }
  replacedGeometries.clear();
  keptGeometries.clear();

  function update() {
    if (disposed) return;
    for (const batch of batches) batch.count = 0;
    for (const fixture of fixtures) {
      if (!fixture.group.visible || !fixture.parent.visible) continue;
      const z = fixture.parent.position.z + fixture.lightLocalPosition.z;
      if (Math.abs(z - camera.position.z) > maxDistance) continue;

      // Hall chunks are direct scene children. Compose from current transform
      // records so a just-recycled chunk never uses last frame's matrixWorld.
      fixture.parent.updateMatrix();
      fixture.group.updateMatrix();
      parentMatrix.copy(fixture.parent.matrix);
      groupMatrix.multiplyMatrices(parentMatrix, fixture.group.matrix);
      for (const batch of batches) {
        const source = fixture[batch.part];
        if (!source.visible) continue;
        if (fixture.horrorGain !== undefined && fixture.horrorGain < .1
          && (batch.part === 'lens' || batch.part === 'glow' || batch.part === 'wash')) continue;
        source.updateMatrix();
        worldMatrix.multiplyMatrices(groupMatrix, source.matrix);
        batch.mesh.setMatrixAt(batch.count++, worldMatrix);
      }
    }
    for (const batch of batches) {
      batch.mesh.count = batch.count;
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  update();
  return {
    update,
    meshes: batches.map(batch => batch.mesh),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const fixture of fixtures) for (const part of PARTS) {
        fixture[part].layers.mask = previousLayers.get(fixture[part]);
      }
      for (const batch of batches) {
        scene.remove(batch.mesh);
        // Geometry and materials still belong to the original transform records.
        batch.mesh.dispose();
      }
    },
  };
}
