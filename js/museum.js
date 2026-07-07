import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ---- language (mirror main.js: localStorage 'lang', default zh) ---- */
const lang = (() => {
  const v = localStorage.getItem('lang');
  return v === 'en' || v === 'ko' ? v : 'zh';
})();
document.documentElement.lang = lang;
const T = (zh, en, ko) => (lang === 'en' ? en : lang === 'ko' ? ko : zh);

/* ---- overlay / chrome DOM ---- */
const enterEl = document.getElementById('enter');
const enterGo = document.getElementById('enter-go');
const enterSub = document.getElementById('enter-sub');
const enterKeys = document.getElementById('enter-keys');
const enterProg = document.getElementById('enter-prog');
const enterBack = document.getElementById('enter-back');
const titleEl = document.getElementById('title');
const hudEl = document.getElementById('hud');
const exitBtn = document.getElementById('exit-btn');

enterSub.textContent = T('一座灯光下的私人博物馆', 'A private museum under gallery light', '갤러리 조명 아래의 개인 미술관');
enterKeys.textContent = T('WASD 移动 · 鼠标转视角 · Shift 快走 · ESC 暂停',
  'WASD move · mouse look · Shift run · ESC pause', 'WASD 이동 · 마우스 시점 · Shift 달리기 · ESC 일시정지');
enterBack.textContent = T('返回主站', 'Back to site', '메인으로');
titleEl.textContent = T('画廊 — This is Eytle', 'Gallery — This is Eytle', '갤러리 — This is Eytle');
hudEl.innerHTML = T(
  '<b>WASD</b> 移动 · 鼠标 转视角 · <b>Shift</b> 快走 · <b>ESC</b> 暂停',
  '<b>WASD</b> move · mouse look · <b>Shift</b> run · <b>ESC</b> pause',
  '<b>WASD</b> 이동 · 마우스 시점 · <b>Shift</b> 달리기 · <b>ESC</b> 일시정지'
);
exitBtn.addEventListener('click', () => { location.href = 'index.html'; });
enterBack.addEventListener('click', (e) => { e.stopPropagation(); location.href = 'index.html'; });

let preloaded = false, entered = false;
function setProgress(loaded, total) {
  enterProg.textContent = T(`加载中 ${loaded} / ${total}`, `Loading ${loaded} / ${total}`, `로딩 중 ${loaded} / ${total}`);
}
function readyToEnter() {
  preloaded = true;
  enterProg.textContent = '';
  enterGo.textContent = T('点击进入', 'Enter', '입장');
  enterGo.disabled = false;
}
function fail(zh, en, ko) {
  enterSub.textContent = T(zh, en, ko);
  enterProg.textContent = '';
  enterGo.hidden = true;
}

/* ---- gallery list ---- */
let IMAGES = [];
async function loadImageList() {
  const res = await fetch('./images/gallery/index.json');
  if (!res.ok) throw new Error('index ' + res.status);
  const files = await res.json();
  if (!Array.isArray(files) || files.length === 0) throw new Error('empty');
  IMAGES = files.map(f => `images/gallery/${encodeURIComponent(f)}`);
}

/* ============================================================
   RENDERER · SCENE · CAMERA · LOOP
   ============================================================ */
const EYE_Y = 1.6;
const HALL_HALF_WIDTH = 3;
const CEIL_Y = 4.72;
const VAULT_RISE = 0.84;
const VAULT_SPRING_Y = CEIL_Y - VAULT_RISE;
const WALL_HEIGHT = VAULT_SPRING_Y;
const VAULT_SEGMENTS = 18;
const STAR_INSET = 0.028;
const LAMP_BASE_DEPTH = 0.045;

const canvas = document.getElementById('scene-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  renderer.setAnimationLoop(null);
  document.body.classList.remove('locked');
  fail('渲染上下文丢失，请刷新页面。', 'Rendering context lost — please reload.', '렌더링 컨텍스트가 손실되었습니다. 새로고침하세요.');
}, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
scene.fog = new THREE.Fog(0x0b1220, 18, 85);

/* ---- IBL + ambient fill (amber & teal) ---- */
const _pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = _pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
_pmrem.dispose();
scene.environmentIntensity = 0.7;
scene.add(new THREE.AmbientLight(0x33425f, 0.5));
scene.add(new THREE.HemisphereLight(0x3a4f78, 0x140e06, 0.4));

const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, EYE_Y, 0);

const clock = new THREE.Clock();
const updaters = [];
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const fn of updaters) fn(dt);
  composer.render();
}
let looping = false;
function startLoop() {
  if (looping) return;
  looping = true;
  renderer.setAnimationLoop(frame);
}

/* ============================================================
   POST: subtle bloom + tone-mapped output
   ============================================================ */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.3,   // strength — picks up the cove strips, restrained
  0.7,   // radius
  1.35   // threshold — keep white artwork from blooming like a light source
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
});

/* ============================================================
   MATERIALS  (+ procedural surface texture, generated on a canvas —
   no external files, keeping the no-build constraint)
   ============================================================ */
function makeNoiseTexture(size = 256, spread = 26) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const img = x.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 205 + (Math.random() * spread - spread / 2);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeStarShape(outer = 1, inner = 0.45) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 === 0 ? outer : inner;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function vaultYAtX(x) {
  const t = THREE.MathUtils.clamp(x / HALL_HALF_WIDTH, -1, 1);
  return VAULT_SPRING_Y + VAULT_RISE * (1 - t * t);
}

function vaultNormalAtX(x, target = new THREE.Vector3()) {
  const slope = -2 * VAULT_RISE * x / (HALL_HALF_WIDTH * HALL_HALF_WIDTH);
  return target.set(slope, -1, 0).normalize();
}

function makeVaultCeilingGeometry(width, length, xSegments = VAULT_SEGMENTS, zSegments = 1) {
  const half = width / 2;
  const vertices = [];
  const uvs = [];
  const indices = [];

  for (let z = 0; z <= zSegments; z++) {
    const vz = -(z / zSegments) * length;
    for (let x = 0; x <= xSegments; x++) {
      const px = -half + (x / xSegments) * width;
      vertices.push(px, vaultYAtX(px), vz);
      uvs.push(x / xSegments, z / zSegments);
    }
  }

  for (let z = 0; z < zSegments; z++) {
    for (let x = 0; x < xSegments; x++) {
      const a = z * (xSegments + 1) + x;
      const b = a + 1;
      const d = (z + 1) * (xSegments + 1) + x;
      const c = d + 1;
      indices.push(a, c, b, a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeArchedEndWallGeometry(width, xSegments = VAULT_SEGMENTS) {
  const half = width / 2;
  const vertices = [];
  const uvs = [];
  const indices = [];

  for (let x = 0; x <= xSegments; x++) {
    const px = -half + (x / xSegments) * width;
    const topY = vaultYAtX(px);
    vertices.push(px, 0, 0, px, topY, 0);
    uvs.push(x / xSegments, 0, x / xSegments, topY / CEIL_Y);
  }

  for (let x = 0; x < xSegments; x++) {
    const b0 = x * 2;
    const t0 = b0 + 1;
    const b1 = b0 + 2;
    const t1 = b0 + 3;
    indices.push(b0, t1, t0, b0, b1, t1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const starGeo = new THREE.ShapeGeometry(makeStarShape());
const wallBump = makeNoiseTexture(256, 30);  wallBump.repeat.set(8, 3);   // plaster grain
function loadRepeatedTexture(url, repeatX, repeatY, colorSpace = THREE.NoColorSpace) {
  const tex = new THREE.TextureLoader().load(url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.colorSpace = colorSpace;
  return tex;
}
const wallMap = loadRepeatedTexture('images/textures/gallery-wall-plaster.png', 3.2, 1.15, THREE.SRGBColorSpace);
const wallDetail = loadRepeatedTexture('images/textures/gallery-wall-plaster.png', 3.2, 1.15);
const floorMap = loadRepeatedTexture('images/textures/gallery-floor-microcement.png', 2.4, 64, THREE.SRGBColorSpace);
function lockFloorTextureToWorld(worldZ) {
  const offsetY = -(worldZ / FLOOR_LEN) * floorMap.repeat.y;
  floorMap.offset.y = offsetY;
}

const mats = {
  wall: new THREE.MeshStandardMaterial({ color: 0x7f8daa, roughness: 1.0, metalness: 0.0,
    map: wallMap, bumpMap: wallDetail, bumpScale: 0.012 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0x0e1626, roughness: 1.0, metalness: 0.0 }),
  endWall: new THREE.MeshStandardMaterial({ color: 0x8290ac, roughness: 1.0, metalness: 0.0,
    map: wallMap, bumpMap: wallDetail, bumpScale: 0.012 }),
  // gilt bronze frame — ties to the amber accent
  frame: new THREE.MeshStandardMaterial({ color: 0xb98a2a, roughness: 0.5, metalness: 0.45 }),
  floorTexture: new THREE.MeshBasicMaterial({
    color: 0xa9b0ba, transparent: true, opacity: 0.92, depthWrite: false, fog: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, map: floorMap,
  }),
  floorVeil: new THREE.MeshBasicMaterial({
    color: 0x02050a, transparent: true, opacity: 0.18, depthWrite: false, fog: true,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }),
  // architectural rhythm: pilasters + moldings
  trim: new THREE.MeshStandardMaterial({ color: 0x202a3e, roughness: 0.6, metalness: 0.35,
    bumpMap: wallBump, bumpScale: 0.01 }),
  molding: new THREE.MeshStandardMaterial({ color: 0x344563, roughness: 0.55, metalness: 0.3 }),
  // emissive fixtures: picture lights over each piece + recessed ceiling panels
  pictureLight: new THREE.MeshStandardMaterial({
    color: 0xffedcc, emissive: 0xffd28a, emissiveIntensity: 1.35, roughness: 0.35,
    transparent: true, opacity: 0.86, toneMapped: false,
  }),
  ceilPanel: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xbfd0ff, emissiveIntensity: 0.8 }),
};

/* ============================================================
   INFINITE HALL — fixed chunk pool, recycled as the player walks.
   All gallery textures are loaded once up front, then assigned in order.
   ============================================================ */
const CHUNK_LEN = 14;
const POOL = 20;
const FLOOR_LEN = CHUNK_LEN * (POOL + 1);
const RECYCLE_BACK_BUFFER = 112;
const REAR_WALL_OFFSET = 72;
const FORWARD_VIEW_BUFFER = 170;
const ART_PER_SIDE = 2;
const ART_SPACING = CHUNK_LEN / ART_PER_SIDE;
const ART_H = 1.52;           // artwork height (width derives from aspect)
const ART_MAX_W = 2.16;       // clamp very wide images
const ART_Y = 1.75;           // centre height of artwork

const texLoader = new THREE.TextureLoader();
const texCache = [];          // one THREE.Texture (or null) per IMAGES entry
const artMeshes = [];         // pickable picture meshes for raycasting
const chunks = [];
let floorRig = null;
let rearWall = null;
let nextImageIndex = 0;

function preloadTextures(onProgress) {
  return Promise.all(IMAGES.map((url, i) => new Promise((resolve) => {
    texLoader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texCache[i] = tex;
      if (typeof renderer.initTexture === 'function') renderer.initTexture(tex);
      onProgress();
      resolve();
    }, undefined, () => { texCache[i] = null; onProgress(); resolve(); });
  })));
}

function fitArtwork(pic, frame, tex) {
  if (!tex || !tex.image) return;
  const ar = tex.image.width / tex.image.height;
  let h = ART_H, w = h * ar;
  if (w > ART_MAX_W) { w = ART_MAX_W; h = w / ar; }
  pic.geometry.dispose();
  pic.geometry = new THREE.PlaneGeometry(w, h);
  frame.geometry.dispose();
  frame.geometry = new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.06);
  if (pic.userData.slot) resizePictureLight(pic.userData.slot, w, h);
}

function setArtTexture(slot, imageIndex) {
  const tex = texCache[imageIndex % texCache.length];
  if (!tex) return;
  slot.pic.material.map = tex;
  slot.pic.material.needsUpdate = true;
  fitArtwork(slot.pic, slot.frame, tex);
}

function pictureLightY(artH) {
  return Math.min(ART_Y + artH / 2 + 1.05, VAULT_SPRING_Y - 0.32);
}

function makeArtwork(parent, side, localZ, imageIndex) {
  const x = side * (HALL_HALF_WIDTH - 0.05);
  const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;

  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, ART_H + 0.2, 0.06), mats.frame);
  frame.position.set(x, ART_Y, localZ);
  frame.rotation.y = ry;
  frame.castShadow = true;
  parent.add(frame);

  const pic = new THREE.Mesh(
    new THREE.PlaneGeometry(2, ART_H),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.0 }));
  pic.position.set(x + side * -0.05, ART_Y, localZ);
  pic.rotation.y = ry;
  pic.userData.pickable = true;
  parent.add(pic);
  artMeshes.push(pic);

  const sx = x + (-side) * 0.32;
  const sy = pictureLightY(ART_H);
  const spot = new THREE.SpotLight(0xffe9c8, 34, 9, Math.PI / 6.5, 0.5, 2);
  spot.position.set(sx, sy, localZ);
  const target = new THREE.Object3D();
  target.position.set(x, ART_Y, localZ);
  spot.target = target;
  spot.castShadow = false;
  spot.visible = true;
  parent.add(spot, target);

  const lamp = makePictureLight(parent, side, x, ART_Y, localZ, sx, sy);

  const slot = { pic, frame, spot, target, lamp };
  pic.userData.slot = slot;
  setArtTexture(slot, imageIndex);
  return slot;
}

function alignObjectToVector(obj, from, to) {
  obj.quaternion.setFromUnitVectors(from, to.clone().normalize());
}

function makeRod(start, end, radius, material) {
  const dir = end.clone().sub(start);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 14), material);
  rod.userData.radius = radius;
  rod.position.copy(start).addScaledVector(dir, 0.5);
  alignObjectToVector(rod, new THREE.Vector3(0, 1, 0), dir);
  return rod;
}

function updateRod(rod, start, end) {
  const dir = end.clone().sub(start);
  rod.geometry.dispose();
  rod.geometry = new THREE.CylinderGeometry(rod.userData.radius || 0.025, rod.userData.radius || 0.025, dir.length(), 14);
  rod.position.copy(start).addScaledVector(dir, 0.5);
  alignObjectToVector(rod, new THREE.Vector3(0, 1, 0), dir);
}

function makePictureLight(parent, side, wallX, targetY, localZ, sx, sy) {
  const group = new THREE.Group();
  parent.add(group);

  const inward = new THREE.Vector3(-side, 0, 0);
  const wallSurfaceX = side * HALL_HALF_WIDTH;
  const wallPoint = new THREE.Vector3(wallSurfaceX + inward.x * (LAMP_BASE_DEPTH / 2), sy, localZ);
  const jointPoint = new THREE.Vector3(wallX + (-side) * 0.14, sy - 0.02, localZ);
  const headPoint = new THREE.Vector3(sx, sy - 0.055, localZ);
  const targetPoint = new THREE.Vector3(wallX, targetY + 0.1, localZ);
  const aimDir = targetPoint.clone().sub(headPoint).normalize();

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, LAMP_BASE_DEPTH, 20), mats.frame);
  base.position.copy(wallPoint);
  alignObjectToVector(base, new THREE.Vector3(0, 1, 0), inward);
  group.add(base);

  const armA = makeRod(wallPoint.clone().addScaledVector(inward, 0.03), jointPoint, 0.016, mats.frame);
  const armB = makeRod(jointPoint, headPoint, 0.016, mats.frame);
  group.add(armA, armB);

  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 10), mats.frame);
  knuckle.position.copy(jointPoint);
  group.add(knuckle);

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.22, 24), mats.frame);
  head.position.copy(headPoint);
  alignObjectToVector(head, new THREE.Vector3(0, 1, 0), aimDir);
  group.add(head);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.01, 8, 24), mats.frame);
  rim.position.copy(headPoint).addScaledVector(aimDir, 0.125);
  alignObjectToVector(rim, new THREE.Vector3(0, 0, 1), aimDir);
  group.add(rim);

  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.068, 24), mats.pictureLight);
  lens.position.copy(headPoint).addScaledVector(aimDir, 0.132);
  alignObjectToVector(lens, new THREE.Vector3(0, 0, 1), aimDir);
  group.add(lens);

  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.082, 24), mats.pictureLight);
  glow.position.copy(headPoint).addScaledVector(aimDir, 0.138);
  alignObjectToVector(glow, new THREE.Vector3(0, 0, 1), aimDir);
  group.add(glow);

  return { group, base, armA, armB, knuckle, glow, lens, head, rim, side };
}

function resizePictureLight(slot, artW, artH) {
  const lamp = slot.lamp;
  if (!lamp) return;
  const y = pictureLightY(artH);
  const x = slot.frame.position.x;
  const z = slot.frame.position.z;
  const side = lamp.side;
  const inward = new THREE.Vector3(-side, 0, 0);
  const wallSurfaceX = side * HALL_HALF_WIDTH;
  const wallPoint = new THREE.Vector3(wallSurfaceX + inward.x * (LAMP_BASE_DEPTH / 2), y, z);
  const jointPoint = new THREE.Vector3(x + (-side) * 0.14, y - 0.02, z);
  const headPoint = new THREE.Vector3(x + (-side) * 0.32, y - 0.055, z);
  const targetPoint = new THREE.Vector3(x, ART_Y + 0.1, z);
  const aimDir = targetPoint.clone().sub(headPoint).normalize();
  slot.spot.position.set(headPoint.x, y, z);
  slot.target.position.copy(targetPoint);
  lamp.group.position.set(0, 0, 0);
  lamp.base.position.copy(wallPoint);
  alignObjectToVector(lamp.base, new THREE.Vector3(0, 1, 0), inward);
  updateRod(lamp.armA, wallPoint.clone().addScaledVector(inward, 0.03), jointPoint);
  updateRod(lamp.armB, jointPoint, headPoint);
  lamp.knuckle.position.copy(jointPoint);
  lamp.head.position.copy(headPoint);
  alignObjectToVector(lamp.head, new THREE.Vector3(0, 1, 0), aimDir);
  lamp.rim.position.copy(headPoint).addScaledVector(aimDir, 0.125);
  alignObjectToVector(lamp.rim, new THREE.Vector3(0, 0, 1), aimDir);
  lamp.lens.position.copy(headPoint).addScaledVector(aimDir, 0.132);
  alignObjectToVector(lamp.lens, new THREE.Vector3(0, 0, 1), aimDir);
  lamp.glow.position.copy(headPoint).addScaledVector(aimDir, 0.138);
  alignObjectToVector(lamp.glow, new THREE.Vector3(0, 0, 1), aimDir);
}

function makeChunk(z, slotOffset) {
  const group = new THREE.Group();
  group.position.z = z;
  scene.add(group);

  const width = HALL_HALF_WIDTH * 2;
  const ceil = new THREE.Mesh(makeVaultCeilingGeometry(width, CHUNK_LEN), mats.ceiling);
  group.add(ceil);

  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK_LEN, WALL_HEIGHT), mats.wall);
    wall.position.set(side * HALL_HALF_WIDTH, WALL_HEIGHT / 2, -CHUNK_LEN / 2);
    wall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(wall);

    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, CHUNK_LEN), mats.molding);
    crown.position.set(side * (HALL_HALF_WIDTH - 0.04), VAULT_SPRING_Y - 0.035, -CHUNK_LEN / 2);
    group.add(crown);

    for (let k = 1; k < ART_PER_SIDE; k++) {
      const pz = -(k * ART_SPACING);
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.12, WALL_HEIGHT - 0.1, 0.26), mats.trim);
      pil.position.set(side * (HALL_HALF_WIDTH - 0.08), (WALL_HEIGHT - 0.1) / 2, pz);
      group.add(pil);
    }
  }

  const rand = seededRandom(Math.round((z + 1000) * 97));
  const starCount = 59;
  const stars = new THREE.InstancedMesh(starGeo, mats.ceilPanel, starCount);
  const starXform = new THREE.Object3D();
  const starNormal = new THREE.Vector3();
  const starNormalSource = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < starCount; i++) {
    const x = (rand() - 0.5) * (HALL_HALF_WIDTH * 1.85);
    vaultNormalAtX(x, starNormal);
    const size = 0.035 + Math.pow(rand(), 1.8) * 0.11;
    starXform.scale.set(size, size, 1);
    starXform.quaternion.setFromUnitVectors(starNormalSource, starNormal);
    starXform.rotateZ(rand() * Math.PI * 2);
    starXform.position.set(
      x + starNormal.x * STAR_INSET,
      vaultYAtX(x) + starNormal.y * STAR_INSET,
      -0.8 - rand() * (CHUNK_LEN - 1.6)
    );
    starXform.updateMatrix();
    stars.setMatrixAt(i, starXform.matrix);
  }
  stars.instanceMatrix.needsUpdate = true;
  group.add(stars);

  const slots = [];
  for (let k = 0; k < ART_PER_SIDE; k++) {
    const localZ = -((k + 0.5) * ART_SPACING);
    slots.push(makeArtwork(group, -1, localZ, slotOffset + slots.length));
    slots.push(makeArtwork(group,  1, localZ, slotOffset + slots.length));
  }
  return { group, slots };
}

function buildMovingFloor() {
  const group = new THREE.Group();
  const width = HALL_HALF_WIDTH * 2;
  const fgeo = new THREE.PlaneGeometry(width, FLOOR_LEN);
  const reflector = new Reflector(fgeo, {
    color: 0x020305,
    textureWidth: Math.min(window.innerWidth, 1024) * renderer.getPixelRatio(),
    textureHeight: Math.min(window.innerHeight, 1024) * renderer.getPixelRatio(),
  });
  reflector.renderOrder = 10;
  reflector.material.depthWrite = false;
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set(0, 0.001, 0);
  group.add(reflector);
  const textureLayer = new THREE.Mesh(fgeo, mats.floorTexture);
  textureLayer.renderOrder = 11;
  textureLayer.rotation.x = -Math.PI / 2;
  textureLayer.position.set(0, 0.006, 0);
  group.add(textureLayer);
  const veil = new THREE.Mesh(fgeo, mats.floorVeil);
  veil.renderOrder = 12;
  veil.rotation.x = -Math.PI / 2;
  veil.position.set(0, 0.008, 0);
  group.add(veil);
  scene.add(group);
  floorRig = group;
}

function buildRearWall() {
  const group = new THREE.Group();
  const width = HALL_HALF_WIDTH * 2;
  const wall = new THREE.Mesh(makeArchedEndWallGeometry(width), mats.endWall);
  wall.rotation.y = Math.PI;
  group.add(wall);

  scene.add(group);
  rearWall = group;
}

function positionRearWall() {
  if (!rearWall || chunks.length === 0) return;
  rearWall.position.z = Math.max(...chunks.map(chunk => chunk.group.position.z));
}

function retargetChunk(chunk) {
  for (const slot of chunk.slots) setArtTexture(slot, nextImageIndex++);
}

function buildHall() {
  nextImageIndex = 0;
  buildMovingFloor();
  for (let i = 0; i < POOL; i++) {
    const chunk = makeChunk(REAR_WALL_OFFSET - (i + 1) * CHUNK_LEN, nextImageIndex);
    nextImageIndex += chunk.slots.length;
    chunks.push(chunk);
  }
  buildRearWall();
  positionRearWall();
}

function recycleChunks() {
  const playerZ = camera.position.z;
  if (floorRig) {
    floorRig.position.z = playerZ;
    lockFloorTextureToWorld(playerZ);
  }

  let leadingZ = Math.min(...chunks.map(chunk => chunk.group.position.z));
  let rearZ = Math.max(...chunks.map(chunk => chunk.group.position.z));
  while (playerZ - leadingZ < FORWARD_VIEW_BUFFER) {
    const rearChunk = chunks.find(chunk => chunk.group.position.z === rearZ);
    if (!rearChunk) break;
    rearChunk.group.position.z = leadingZ - CHUNK_LEN;
    leadingZ = rearChunk.group.position.z;
    rearZ = Math.max(...chunks.map(chunk => chunk.group.position.z));
    retargetChunk(rearChunk);
  }

  const farBehind = playerZ + RECYCLE_BACK_BUFFER;
  for (const chunk of chunks) {
    if (chunk.group.position.z > farBehind && playerZ - leadingZ > FORWARD_VIEW_BUFFER + CHUNK_LEN) {
      chunk.group.position.z = leadingZ - CHUNK_LEN;
      leadingZ = chunk.group.position.z;
      retargetChunk(chunk);
    }
  }
  positionRearWall();
}

function getRearWallZ() {
  return rearWall ? rearWall.position.z : REAR_WALL_OFFSET;
}

async function prewarmScene() {
  recycleChunks();
  if (typeof renderer.compileAsync === 'function') {
    await renderer.compileAsync(scene, camera);
  } else {
    renderer.compile(scene, camera);
  }
  const rotations = [
    [0, 0],
    [Math.PI / 2, 0],
    [-Math.PI / 2, 0],
    [Math.PI, 0],
    [0, 0.35],
    [0, -0.35],
  ];
  for (const [ry, rx] of rotations) {
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.rotateY(ry);
    camera.rotateX(rx);
    composer.render();
  }
  camera.rotation.set(0, 0, 0, 'YXZ');
  camera.rotateY(yaw);
  camera.rotateX(pitch);
}

/* ============================================================
   FIRST-PERSON CONTROLS + MOVEMENT (with Shift run)
   ============================================================ */
const WALK_SPEED = 3.2, RUN_SPEED = 6.5;   // m/s
const MOVE_ACCEL = 10.5, MOVE_DECEL = 13.5; // m/s^2
const LOOK_SENS = 0.0015;
const MAX_DELTA = 200;                       // safety cap for glitch spikes (raw input rarely hits it)
let yaw = 0, pitch = 0;                      // start facing -Z (into the hall)
let roamEnabled = true;
const isLocked = () => document.pointerLockElement === canvas;

const keys = { f: false, b: false, l: false, r: false, run: false };
function onKey(e, down) {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp':    keys.f = down; break;
    case 'KeyS': case 'ArrowDown':  keys.b = down; break;
    case 'KeyA': case 'ArrowLeft':  keys.l = down; break;
    case 'KeyD': case 'ArrowRight': keys.r = down; break;
    case 'ShiftLeft': case 'ShiftRight': keys.run = down; break;
  }
}
document.addEventListener('keydown', e => onKey(e, true));
document.addEventListener('keyup',   e => onKey(e, false));

// hand-rolled mouse-look with PER-EVENT delta clamp: a single huge movementX
// (driver spike / first event after (re)lock) can no longer throw the view
document.addEventListener('mousemove', (e) => {
  if (!isLocked() || focusState) return;     // focus tween owns the camera
  const dx = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, e.movementX || 0));
  const dy = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, e.movementY || 0));
  yaw   -= dx * LOOK_SENS;
  pitch -= dy * LOOK_SENS;
  pitch = Math.max(-1.2, Math.min(1.2, pitch));
});

function clampToHall(pos) {
  const m = 0.4; // keep off the walls
  if (pos.x >  HALL_HALF_WIDTH - m) pos.x =  HALL_HALF_WIDTH - m;
  if (pos.x < -HALL_HALF_WIDTH + m) pos.x = -HALL_HALF_WIDTH + m;
  if (pos.z > getRearWallZ() - 0.6) pos.z = getRearWallZ() - 0.6;
  pos.y = EYE_Y;
}

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveIntent = new THREE.Vector3();
const _moveVelocity = new THREE.Vector3();
const _moveDir = new THREE.Vector3(0, 0, -1);
let moveSpeed = 0;

function approachScalar(current, target, maxDelta) {
  if (current < target) return Math.min(target, current + maxDelta);
  if (current > target) return Math.max(target, current - maxDelta);
  return current;
}

updaters.push((dt) => {
  recycleChunks();

  // rebuild orientation from yaw/pitch unless a focus tween drives the camera
  if (!focusState) {
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.rotateY(yaw);
    camera.rotateX(pitch);
  }

  if (!roamEnabled || !isLocked()) {
    _moveVelocity.set(0, 0, 0);
    moveSpeed = 0;
    return;
  }
  camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
  _right.crossVectors(_fwd, camera.up).normalize();

  _moveIntent.set(0, 0, 0);
  if (keys.f) _moveIntent.add(_fwd);
  if (keys.b) _moveIntent.addScaledVector(_fwd, -1);
  if (keys.r) _moveIntent.add(_right);
  if (keys.l) _moveIntent.addScaledVector(_right, -1);

  const hasIntent = _moveIntent.lengthSq() > 0.0001;
  let brakingAgainstMotion = false;
  if (hasIntent) {
    _moveIntent.normalize();
    brakingAgainstMotion = moveSpeed > 0.15 && _moveIntent.dot(_moveDir) < -0.35;
  }

  const targetSpeed = hasIntent && !brakingAgainstMotion ? (keys.run ? RUN_SPEED : WALK_SPEED) : 0;
  moveSpeed = approachScalar(moveSpeed, targetSpeed, (hasIntent && !brakingAgainstMotion ? MOVE_ACCEL : MOVE_DECEL) * dt);
  if (hasIntent && !brakingAgainstMotion) {
    _moveDir.copy(_moveIntent);
  } else if (hasIntent && moveSpeed <= 0.15) {
    _moveDir.copy(_moveIntent);
  }
  if (moveSpeed > 0.001) {
    _moveVelocity.copy(_moveDir).multiplyScalar(moveSpeed);
  } else {
    moveSpeed = 0;
    _moveVelocity.set(0, 0, 0);
  }

  const p = camera.position;
  const beforeX = p.x;
  const beforeZ = p.z;
  p.addScaledVector(_moveVelocity, dt);
  clampToHall(p);
  if (p.x !== beforeX + _moveVelocity.x * dt) _moveVelocity.x = 0;
  if (p.z !== beforeZ + _moveVelocity.z * dt) _moveVelocity.z = 0;
});

/* ============================================================
   CLICK-TO-FOCUS
   ============================================================ */
const raycaster = new THREE.Raycaster();
const _center = new THREE.Vector2(0, 0); // crosshair = screen center
let focusState = null;   // null | { phase:'toArt'|'returning', t, fromPos, fromQuat, toPos, toQuat }
let roamReturn = null;   // { pos, quat } — the roam pose to glide back to
let savedYaw = 0, savedPitch = 0;   // look angles to restore after focus

function focusOn(mesh) {
  const worldPos = new THREE.Vector3();
  mesh.getWorldPosition(worldPos);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
  const toPos = worldPos.clone().addScaledVector(normal, 1.7);
  toPos.y = worldPos.y;

  const m = new THREE.Matrix4().lookAt(toPos, worldPos, camera.up);
  const toQuat = new THREE.Quaternion().setFromRotationMatrix(m);

  savedYaw = yaw; savedPitch = pitch;
  roamReturn = { pos: camera.position.clone(), quat: camera.quaternion.clone() };
  focusState = {
    phase: 'toArt', t: 0,
    fromPos: camera.position.clone(),
    fromQuat: camera.quaternion.clone(),
    toPos, toQuat,
  };
  roamEnabled = false;
}

function unfocus() {
  if (!focusState || focusState.phase === 'returning' || !roamReturn) return;
  focusState = {
    phase: 'returning', t: 0,
    fromPos: camera.position.clone(),
    fromQuat: camera.quaternion.clone(),
    toPos: roamReturn.pos.clone(),
    toQuat: roamReturn.quat.clone(),
  };
}
function cancelFocus() {  // hard reset (used when pausing)
  if (focusState || roamReturn) {        // only when actually focused
    if (roamReturn) camera.position.copy(roamReturn.pos);
    yaw = savedYaw; pitch = savedPitch;
  }
  focusState = null;
  roamReturn = null;
  roamEnabled = true;
}

const _q = new THREE.Quaternion();
updaters.push((dt) => {
  if (!focusState || focusState.t >= 1) return;
  focusState.t = Math.min(1, focusState.t + dt / 0.6); // ~0.6s
  const e = focusState.t * focusState.t * (3 - 2 * focusState.t); // smoothstep
  camera.position.lerpVectors(focusState.fromPos, focusState.toPos, e);
  _q.slerpQuaternions(focusState.fromQuat, focusState.toQuat, e);
  camera.quaternion.copy(_q);
  if (focusState.t >= 1 && focusState.phase === 'returning') {
    yaw = savedYaw; pitch = savedPitch;   // hand control back to mouse-look
    roamEnabled = true;
    focusState = null;
    roamReturn = null;
  }
});

/* ---- pointer-lock lifecycle: the #enter overlay IS the pause menu ---- */
document.addEventListener('pointerlockchange', () => {
  const locked = isLocked();
  document.body.classList.toggle('locked', locked);
  if (!locked) {
    cancelFocus();                       // resume cleanly next time
    if (entered) enterGo.textContent = T('继续', 'Resume', '계속');
  }
});

canvas.addEventListener('click', () => {
  if (!isLocked()) return;               // (clicks on the overlay handle locking)
  if (focusState) { unfocus(); return; } // click again to leave focus
  raycaster.setFromCamera(_center, camera);
  const hit = raycaster.intersectObjects(artMeshes, false)[0];
  if (hit && hit.distance < 7) focusOn(hit.object);
});

// Lock the pointer requesting RAW mouse input (unadjustedMovement) — this is
// the real fix for the "fling": it bypasses the Windows mouse-acceleration that
// balloons movementX on a fast flick. Falls back to a plain lock if unsupported.
function lockPointer() {
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && typeof p.catch === 'function') p.catch(() => canvas.requestPointerLock());
  } catch {
    canvas.requestPointerLock();
  }
}

// click the start/pause overlay (or its button) to lock the pointer and play
function enterPlay() {
  if (!preloaded) return;
  entered = true;
  lockPointer();
}
enterEl.addEventListener('click', enterPlay);

/* ---- boot ---- */
async function boot() {
  try {
    await loadImageList();
  } catch (e) {
    fail('画廊暂无图片或加载失败。', 'Gallery is empty or failed to load.', '갤러리가 비어 있거나 로드에 실패했습니다.');
    return;
  }
  setProgress(0, IMAGES.length);
  let done = 0;
  await preloadTextures(() => setProgress(++done, IMAGES.length));
  enterProg.textContent = T('优化场景中', 'Optimizing scene', '장면 최적화 중');
  buildHall();
  await prewarmScene();
  startLoop();        // render the hall behind the translucent start overlay
  readyToEnter();
}
boot();
