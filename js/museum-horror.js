import * as THREE from 'three';
import { createMuseumHorrorArt } from './museum-horror-art.js?v=horror-20260926';
import { createMuseumHorrorUI } from './museum-horror-ui.js?v=horror-20260926';

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
  }

  function applyDebris(root) {
    if (!active) return;
    root.traverse(mesh => {
      const role = mesh.userData?.museumSurface;
      if (mesh.isMesh && materials[role]) swap(mesh, materials[role]);
    });
  }

  function updateLighting() {
    for (const fixture of fixtures) {
      fixture.horrorGain = horrorLampGain(fixture.parent.position.z + fixture.lightLocalPosition.z,
        fixture.side, elapsed, reducedMotion);
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
    scene.environmentIntensity *= .42;
    renderer.toneMappingExposure = .82;
    architecture.setBlackout(true);
    atmosphere.group.visible = false;
    art = createMuseumHorrorArt({ reducedMotion });
    const surface = (texture, glow) => new THREE.MeshStandardMaterial({
      map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: glow,
      roughness: .92, metalness: .02, color: 0xffffff,
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
    applySlot, applyDebris,
    releaseDebris(root) { root.traverse(mesh => replaced.delete(mesh)); },
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
      Object.values(materials).forEach(material => material.dispose());
      art.dispose();
      for (const fixture of fixtures) delete fixture.horrorGain;
      architecture.setBlackout(false);
      atmosphere.group.visible = true;
      scene.background = before.background; scene.fog = before.fog;
      scene.environmentIntensity = before.environment;
      renderer.toneMappingExposure = before.exposure;
      for (const [light, intensity] of before.lights) light.intensity = intensity;
    },
  };
}
