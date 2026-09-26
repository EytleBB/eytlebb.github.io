import * as THREE from 'three';
import { createMuseumHorrorArt } from './museum-horror-art.js?v=ending-20260926';
import { createMuseumHorrorUI } from './museum-horror-ui.js?v=horror-immersion-20260926';

export const HORROR_BREAK_THRESHOLD = 24;
const fract = value => value - Math.floor(value);
const hash = value => fract(Math.sin(value * 127.1 + 311.7) * 43758.5453);

// Only a few wall spots survive. Local, asynchronous faults avoid a hall-wide
// flash, and world-space seeds remain stable when the resident chunks recycle.
export function horrorLampGain(z, side, seconds, reducedMotion = false) {
  const seed = Math.round(z * 8) + side * 73;
  if (hash(seed) > .23) return 0;
  if (reducedMotion) return .62;
  const episode = Math.floor(seconds / 1.7);
  if (hash(seed + 41.3 + episode * 19.7) < .3) return 0;
  const tick = Math.floor(seconds * 7);
  if (hash(seed + 83.7 + tick * 3.17) < .24) return .04;
  return .38 + hash(seed + 101.4 + Math.floor(seconds * 3) * 11.3) * .52;
}

export function createMuseumHorror({ scene, renderer, architecture, atmosphere, fixtures,
  getSlots, forEachDebris, onActivate, reducedMotion = false }) {
  let breaks = 0, active = false, disposed = false, elapsed = 0, lightingTick = -1;
  let art = null, ui = null, materials = null, before = null;
  const replaced = new Map();
  const matte = new Map();
  let progress = 0;

  function makeMatte(material) {
    if (!material || matte.has(material) || !material.isMeshStandardMaterial) return;
    const saved = { roughness: material.roughness, metalness: material.metalness,
      envMapIntensity: material.envMapIntensity, clearcoat: material.clearcoat,
      reflectivity: material.reflectivity, anisotropy: material.anisotropy,
      onBeforeCompile: material.onBeforeCompile, customProgramCacheKey: material.customProgramCacheKey };
    matte.set(material, saved);
    material.roughness = 1; material.metalness = 0; material.envMapIntensity = 0;
    if ('clearcoat' in material) material.clearcoat = 0;
    if ('reflectivity' in material) material.reflectivity = 0;
    if ('anisotropy' in material) material.anisotropy = 0;
    const key = saved.customProgramCacheKey.call(material);
    material.onBeforeCompile = function(shader, renderer) {
      saved.onBeforeCompile.call(this, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>',
        '#include <lights_physical_fragment>\nmaterial.specularColor = vec3(0.0); material.specularF90 = 0.0;');
    };
    material.customProgramCacheKey = () => key + ':horror-matte';
    material.needsUpdate = true;
  }

  function applyMatte(root) {
    root.traverse(object => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) makeMatte(material);
    });
  }

  function setProgress(value) {
    if (!active || !Number.isFinite(value)) return;
    progress = Math.max(progress, Math.min(1, Math.max(0, value)));
    renderer.toneMappingExposure = .82 - .28 * progress;
    scene.fog.near = 9 - 6 * progress; scene.fog.far = 48 - 26 * progress;
    for (const [light, intensity] of before.lights) {
      light.intensity = intensity * (light.isHemisphereLight ? .48 : .55) * (1 - .45 * progress);
    }
    for (const [kind, glow] of [['artwork', .55], ['plaque', .36], ['name', .42]]) {
      materials[kind].emissiveIntensity = glow * (1 - .45 * progress);
    }
    updateLighting();
  }

  function swap(mesh, material) {
    if (!mesh || mesh.material === material) return;
    // A streamed plaque may have acquired a different normal material since
    // this slot last appeared. Retain only its current material, never a history.
    replaced.set(mesh, { original: mesh.material, applied: material });
    mesh.material = material;
  }

  function applySlot(slot) {
    if (!active) return;
    swap(slot.pic, materials.artwork);
    swap(slot.plaque, materials.plaque);
    swap(slot.titlePlaque, materials.name);
    for (const mesh of [slot.pic, slot.plaque, slot.titlePlaque]) makeMatte(mesh?.material);
  }

  function applyDebris(root) {
    if (!active) return;
    root.traverse(mesh => {
      const role = mesh.userData?.museumSurface;
      if (mesh.isMesh && materials[role]) swap(mesh, materials[role]);
    });
    applyMatte(root);
  }

  function updateLighting() {
    for (const fixture of fixtures) {
      fixture.horrorGain = horrorLampGain(fixture.parent.position.z + fixture.lightLocalPosition.z,
        fixture.side, elapsed, reducedMotion) * (1 - .4 * progress);
    }
  }

  function activate() {
    if (active || disposed) return;
    active = true;
    before = { background: scene.background, fog: scene.fog,
      exposure: renderer.toneMappingExposure, environment: scene.environmentIntensity,
      lights: [] };
    scene.traverse(object => {
      if (object.isAmbientLight || object.isHemisphereLight) {
        before.lights.push([object, object.intensity]);
        object.intensity *= object.isHemisphereLight ? .48 : .55;
      }
    });
    scene.background = new THREE.Color(0x080407);
    scene.fog = new THREE.Fog(0x0c070b, 9, 48);
    scene.environmentIntensity = 0;
    renderer.toneMappingExposure = .82;
    architecture.setBlackout(true);
    architecture.setReflectionsEnabled?.(false);
    applyMatte(scene);
    atmosphere.group.visible = false;
    art = createMuseumHorrorArt({ reducedMotion });
    const surface = (texture, glow) => new THREE.MeshStandardMaterial({
      map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: glow,
      roughness: 1, metalness: 0, envMapIntensity: 0, color: 0xffffff,
    });
    materials = { artwork: surface(art.artTexture, .55), plaque: surface(art.plaqueTexture, .36), name: surface(art.nameTexture, .42) };
    materials.plaque.polygonOffset = true;
    materials.plaque.polygonOffsetFactor = -1;
    getSlots().forEach(applySlot);
    forEachDebris(applyDebris);
    updateLighting();
    ui = createMuseumHorrorUI({ reducedMotion, artCanvas: art.artTexture.image });
    ui.enable();
    onActivate?.();
  }

  return {
    get active() { return active; },
    get brokenCount() { return breaks; },
    recordBreak() {
      if (disposed) return;
      breaks++;
      if (breaks === HORROR_BREAK_THRESHOLD) activate();
    },
    restore() {
      if (disposed) return false;
      // A returning horror visit restores the scene without replaying the
      // destruction callbacks or manufacturing any new broken props.
      breaks = Math.max(breaks, HORROR_BREAK_THRESHOLD);
      activate();
      return active;
    },
    applySlot, applyDebris, applyMatte, setProgress,
    releaseDebris(root) { root.traverse(mesh => {
      replaced.delete(mesh);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material && !Object.values(materials || {}).includes(material)) matte.delete(material);
      }
    }); },
    updateUI(dt) {
      if (!active) return;
      // The guestbook parks the 3D scene, but its shared artwork canvas must
      // keep animating alongside the text without forcing another scene draw.
      art.update(dt);
      ui.update(dt);
    },
    update(dt) {
      if (!active) return;
      elapsed += Math.min(Math.max(dt, 0), .1);
      const tick = Math.floor(elapsed * 8);
      if (tick !== lightingTick) { lightingTick = tick; updateLighting(); }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (!active) return;
      active = false;
      ui.dispose();
      for (const [mesh, { original, applied }] of replaced) if (mesh.material === applied) mesh.material = original;
      replaced.clear();
      for (const [material, saved] of matte) {
        Object.assign(material, saved); material.needsUpdate = true;
      }
      matte.clear();
      Object.values(materials).forEach(material => material.dispose());
      art.dispose();
      for (const fixture of fixtures) delete fixture.horrorGain;
      architecture.setBlackout(false);
      architecture.setReflectionsEnabled?.(true);
      atmosphere.group.visible = true;
      scene.background = before.background; scene.fog = before.fog;
      scene.environmentIntensity = before.environment;
      renderer.toneMappingExposure = before.exposure;
      for (const [light, intensity] of before.lights) light.intensity = intensity;
    },
  };
}
