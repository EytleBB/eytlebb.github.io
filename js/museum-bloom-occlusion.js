import * as THREE from 'three';

/**
 * Build once after the hall and its instance batches have been attached. The
 * bloom camera stays on the normal scene layer: dark opaque surfaces still
 * write depth, so a lamp behind a pier cannot shine through it in this pass.
 */
export function createMuseumBloomOcclusion(scene, { bloomLayer = 1 } = {}) {
  const bloom = new THREE.Layers();
  bloom.set(bloomLayer);
  const main = new THREE.Layers();
  main.set(0);
  const renderables = [];
  const blackMaterials = new Map();
  const noReflection = () => {};

  scene.traverse(object => {
    if (object.isMesh || object.isPoints || object.isLine || object.isSprite) {
      renderables.push(object);
    }
  });

  function blackFor(material) {
    const side = material.side;
    if (!blackMaterials.has(side)) {
      blackMaterials.set(side, new THREE.MeshBasicMaterial({
        color: 0x000000, side, fog: false, toneMapped: false,
      }));
    }
    return blackMaterials.get(side);
  }

  return {
    // The callback is synchronous, like EffectComposer.render(). Save the
    // current materials on every pass: streaming may have replaced them since
    // the previous frame, even though the renderable pool is stable.
    render(callback) {
      const restored = [];
      try {
        for (const object of renderables) {
          // Original lamp transform records have all layers disabled after
          // batching; leave them alone and process their visible instances.
          if (!object.visible || !object.layers.test(main) || object.layers.test(bloom)) continue;
          const material = object.material;
          const materials = Array.isArray(material) ? material : [material];
          const state = { object, material, visible: object.visible };
          restored.push(state);
          // Air, dust and light-wash cards have no opaque silhouette. Making
          // them black depth writers would mask rectangular holes in the bloom.
          if (!object.isMesh || materials.some(item => item.transparent)) {
            object.visible = false;
            continue;
          }
          object.material = Array.isArray(material) ? materials.map(blackFor) : blackFor(material);
          if (object.isReflector) {
            // Keep the floor as a depth occluder without rendering another
            // scene or overwriting the main pass's reflected image.
            state.onBeforeRender = object.onBeforeRender;
            object.onBeforeRender = noReflection;
          }
        }
        return callback();
      } finally {
        for (const state of restored) {
          state.object.material = state.material;
          state.object.visible = state.visible;
          if ('onBeforeRender' in state) state.object.onBeforeRender = state.onBeforeRender;
        }
      }
    },
    dispose() {
      for (const material of blackMaterials.values()) material.dispose();
      blackMaterials.clear();
    },
  };
}
