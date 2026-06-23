import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
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

/* ---- gate DOM ---- */
const gate = document.getElementById('gate');
const gateSub = document.getElementById('gate-sub');
const gateProgress = document.getElementById('gate-progress');
const gateEnter = document.getElementById('gate-enter');
const gateBack = document.getElementById('gate-back');
document.getElementById('gate-title').innerHTML = 'This is <em>Eytle</em>';
gateSub.textContent = T(
  'WASD 移动 · 鼠标转动视角 · 点击锁定指针 · 点击画作聚焦 · Esc 退出',
  'WASD to move · mouse to look · click to lock pointer · click a piece to focus · Esc to exit',
  'WASD 이동 · 마우스 시점 · 클릭하여 잠금 · 작품 클릭 시 포커스 · Esc 종료'
);
gateBack.textContent = T('返回', 'Back', '돌아가기');
gateBack.addEventListener('click', () => { location.href = 'index.html'; });

function setProgress(loaded, total) {
  gateProgress.textContent = T(
    `加载中 ${loaded} / ${total}`, `Loading ${loaded} / ${total}`, `로딩 중 ${loaded} / ${total}`
  );
}
function showGateEnter() {
  gateProgress.textContent = '';
  gateEnter.textContent = T('点击进入', 'Enter', '입장');
  gateEnter.hidden = false;
}
function hideGate() { gate.style.display = 'none'; }
function fail(zh, en, ko) {
  gateSub.textContent = T(zh, en, ko);
  gateProgress.textContent = '';
  gateEnter.hidden = true;
  gateBack.hidden = false;
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
const CEIL_Y = 4;

const canvas = document.getElementById('scene-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  renderer.setAnimationLoop(null);
  gate.style.display = 'flex';
  fail('渲染上下文丢失，请刷新页面。', 'Rendering context lost — please reload.', '렌더링 컨텍스트가 손실되었습니다. 새로고침하세요.');
}, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0b09);
scene.fog = new THREE.Fog(0x0d0b09, 24, 90);

/* ---- IBL + ambient fill ---- */
const _pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = _pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
_pmrem.dispose();
scene.environmentIntensity = 0.85;
scene.add(new THREE.HemisphereLight(0xffe6c8, 0x16130f, 0.55));

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 200);
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
   POST PIPELINE: subtle bloom + tone-mapped output
   (no SSAO — it produced swimming dither artifacts on flat art
    at grazing angles, and cost frames)
   ============================================================ */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.3,   // strength — picks up the cove light strips, restrained
  0.7,   // radius
  0.85   // threshold — only the brightest fixtures/highlights bloom
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
   MATERIALS
   ============================================================ */
const mats = {
  wall: new THREE.MeshStandardMaterial({ color: 0x2c2824, roughness: 0.82, metalness: 0.0 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 0.95, metalness: 0.0 }),
  endWall: new THREE.MeshStandardMaterial({ color: 0x26221e, roughness: 0.85, metalness: 0.0 }),
  frame: new THREE.MeshPhysicalMaterial({
    color: 0x121010, roughness: 0.38, metalness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.35
  }),
  // glowing ceiling-cove strip (emissive → reads as a light line, catches bloom)
  cove: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd9a0, emissiveIntensity: 1.6 }),
};

/* ============================================================
   FINITE HALL — sized to hold every image once. No recycling,
   no infinite generation: one enclosed corridor with end walls.
   ============================================================ */
const ART_SPACING = 5;        // metres between consecutive pieces on a wall
const ART_W = 1.7, ART_H = 1.15;
const ART_Y = 1.7;            // centre height of artwork
const START_MARGIN = 6;      // first piece this far in front of spawn
const END_MARGIN = 5;        // gap between last piece and the back wall

// layout limits (filled in by buildHall, used by movement clamp)
let HALL_BACK_Z = -50;       // most-negative reachable z (in front of back wall)
const HALL_FRONT_Z = 2;      // wall just behind spawn (z=0)

const texLoader = new THREE.TextureLoader();
const texCache = [];          // one THREE.Texture (or null) per IMAGES entry
const arts = [];              // { picMesh, frame, spot, z } — for focus + shadow culling
const artMeshes = [];         // pickable picture meshes for raycasting

function preloadTextures(onProgress) {
  return Promise.all(IMAGES.map((url, i) => new Promise((resolve) => {
    texLoader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texCache[i] = tex;
      onProgress();
      resolve();
    }, undefined, () => { texCache[i] = null; onProgress(); resolve(); });
  })));
}

// size both the picture plane AND its frame to the image's real aspect ratio
function fitArtwork(art, tex) {
  if (!tex) return;
  const aspect = tex.image.width / tex.image.height;   // w / h
  const w = ART_H * aspect;                            // keep height, derive width
  art.picMesh.scale.set(w / ART_W, 1, 1);
  art.frame.scale.set((w + 0.16) / (ART_W + 0.16), 1, 1);
  const mtl = art.picMesh.material;
  mtl.map = tex;
  mtl.emissiveMap = tex;       // self-lit so the art always reads clearly
  mtl.needsUpdate = true;
}

function makeArtwork(side, z, tex) {
  const pivot = new THREE.Group();
  pivot.position.set(side * (HALL_HALF_WIDTH - 0.05), ART_Y, z);
  pivot.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(ART_W + 0.16, ART_H + 0.16, 0.08), mats.frame);
  frame.position.z = -0.04;
  frame.castShadow = true; frame.receiveShadow = true;

  const picMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(ART_W, ART_H),
    new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.62, metalness: 0,
      emissive: 0xffffff, emissiveIntensity: 0.55 }));
  picMesh.userData.pickable = true;

  pivot.add(frame, picMesh);

  // dedicated track spotlight
  const spot = new THREE.SpotLight(0xffe9c8, 22, 11, Math.PI / 6, 0.45, 1.3);
  spot.position.set(side * (HALL_HALF_WIDTH - 1.0), CEIL_Y - 0.15, z);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(side * HALL_HALF_WIDTH, ART_Y, z);
  spot.target = spotTarget;
  spot.castShadow = true;
  spot.shadow.mapSize.set(512, 512);
  spot.shadow.camera.near = 0.5;
  spot.shadow.camera.far = 9;
  spot.shadow.bias = -0.0006;
  spot.shadow.normalBias = 0.02;

  scene.add(pivot, spot, spotTarget);

  const art = { picMesh, frame, spot, z };
  fitArtwork(art, tex);
  arts.push(art);
  artMeshes.push(picMesh);
}

function buildHall() {
  const n = IMAGES.length;
  const perSide = Math.ceil(n / 2);
  const lastArtZ = -(START_MARGIN + (perSide - 1) * ART_SPACING);
  HALL_BACK_Z = lastArtZ - END_MARGIN;

  const len = HALL_FRONT_Z - HALL_BACK_Z;        // total corridor length (positive)
  const midZ = (HALL_FRONT_Z + HALL_BACK_Z) / 2; // centre for floor/ceiling/walls
  const width = HALL_HALF_WIDTH * 2;

  // ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(width, len), mats.ceiling);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, CEIL_Y, midZ);
  ceil.receiveShadow = true;
  scene.add(ceil);

  // side walls + ceiling coves
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, CEIL_Y), mats.wall);
    wall.position.set(side * HALL_HALF_WIDTH, CEIL_Y / 2, midZ);
    wall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    wall.receiveShadow = true;
    scene.add(wall);

    const cove = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.07), mats.cove);
    cove.position.set(side * (HALL_HALF_WIDTH - 0.13), CEIL_Y - 0.22, midZ);
    cove.rotation.y = Math.PI / 2;
    scene.add(cove);
  }

  // end walls (back + front) — fully enclose the room
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(width, CEIL_Y), mats.endWall);
  backWall.position.set(0, CEIL_Y / 2, HALL_BACK_Z);
  backWall.receiveShadow = true;
  scene.add(backWall);
  const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(width, CEIL_Y), mats.endWall);
  frontWall.position.set(0, CEIL_Y / 2, HALL_FRONT_Z);
  frontWall.rotation.y = Math.PI;
  frontWall.receiveShadow = true;
  scene.add(frontWall);

  // reflective floor covering the whole hall
  const fgeo = new THREE.PlaneGeometry(width, len);
  const reflector = new Reflector(fgeo, {
    color: 0x0c0a08,
    textureWidth: Math.min(window.innerWidth, 512) * renderer.getPixelRatio(),
    textureHeight: Math.min(window.innerHeight, 512) * renderer.getPixelRatio(),
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set(0, 0.001, midZ);
  scene.add(reflector);
  const overlay = new THREE.Mesh(fgeo, new THREE.MeshStandardMaterial({
    color: 0x110e0b, roughness: 0.35, metalness: 0.5, transparent: true, opacity: 0.68 }));
  overlay.rotation.x = -Math.PI / 2;
  overlay.position.set(0, 0.002, midZ);
  overlay.receiveShadow = true;
  scene.add(overlay);

  // place every artwork once, alternating walls
  for (let i = 0; i < n; i++) {
    const side = (i % 2 === 0) ? -1 : 1;
    const k = Math.floor(i / 2);
    const z = -(START_MARGIN + k * ART_SPACING);
    makeArtwork(side, z, texCache[i]);
  }
}

/* only the spotlights near the camera cast shadows (perf) */
const SHADOW_RANGE = ART_SPACING * 2.2;
updaters.push(() => {
  const cz = camera.position.z;
  for (const a of arts) a.spot.castShadow = Math.abs(a.z - cz) <= SHADOW_RANGE;
});

/* ============================================================
   FIRST-PERSON CONTROLS + MOVEMENT
   ============================================================ */
const WALK_SPEED = 3.2;          // m/s
const controls = new PointerLockControls(camera, document.body);
let roamEnabled = true;

const keys = { f: false, b: false, l: false, r: false };
function onKey(e, down) {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp':    keys.f = down; break;
    case 'KeyS': case 'ArrowDown':  keys.b = down; break;
    case 'KeyA': case 'ArrowLeft':  keys.l = down; break;
    case 'KeyD': case 'ArrowRight': keys.r = down; break;
  }
}
document.addEventListener('keydown', e => onKey(e, true));
document.addEventListener('keyup',   e => onKey(e, false));

function clampToHall(pos) {
  const m = 0.4; // keep off the walls
  if (pos.x >  HALL_HALF_WIDTH - m) pos.x =  HALL_HALF_WIDTH - m;
  if (pos.x < -HALL_HALF_WIDTH + m) pos.x = -HALL_HALF_WIDTH + m;
  if (pos.z > HALL_FRONT_Z - 0.6) pos.z = HALL_FRONT_Z - 0.6;  // front wall
  if (pos.z < HALL_BACK_Z + 0.6)  pos.z = HALL_BACK_Z + 0.6;   // back wall
  pos.y = EYE_Y;
}

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
updaters.push((dt) => {
  if (!roamEnabled || !controls.isLocked) return;
  camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
  _right.crossVectors(_fwd, camera.up).normalize();
  const step = WALK_SPEED * dt;
  const p = camera.position;
  if (keys.f) p.addScaledVector(_fwd,  step);
  if (keys.b) p.addScaledVector(_fwd, -step);
  if (keys.r) p.addScaledVector(_right,  step);
  if (keys.l) p.addScaledVector(_right, -step);
  clampToHall(p);
});

/* ============================================================
   CLICK-TO-FOCUS
   ============================================================ */
const raycaster = new THREE.Raycaster();
const _center = new THREE.Vector2(0, 0); // crosshair = screen center
let focusState = null;   // null | { phase:'toArt'|'returning', t, fromPos, fromQuat, toPos, toQuat }
let roamReturn = null;   // { pos, quat } — the roam pose to glide back to

function focusOn(mesh) {
  const worldPos = new THREE.Vector3();
  mesh.getWorldPosition(worldPos);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
  const toPos = worldPos.clone().addScaledVector(normal, 1.6);
  toPos.y = worldPos.y;

  const m = new THREE.Matrix4().lookAt(toPos, worldPos, camera.up);
  const toQuat = new THREE.Quaternion().setFromRotationMatrix(m);

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

const _q = new THREE.Quaternion();
updaters.push((dt) => {
  if (!focusState || focusState.t >= 1) return;
  focusState.t = Math.min(1, focusState.t + dt / 0.6); // ~0.6s
  const e = focusState.t * focusState.t * (3 - 2 * focusState.t); // smoothstep
  camera.position.lerpVectors(focusState.fromPos, focusState.toPos, e);
  _q.slerpQuaternions(focusState.fromQuat, focusState.toQuat, e);
  camera.quaternion.copy(_q);
  if (focusState.t >= 1 && focusState.phase === 'returning') {
    roamEnabled = true;
    focusState = null;
    roamReturn = null;
  }
});

/* ---- chrome + lock lifecycle ---- */
const hud = document.getElementById('hud');
const crosshair = document.getElementById('crosshair');
const exitBtn = document.getElementById('exit-btn');
document.getElementById('hud-tip').textContent =
  T('Esc 退出 · 点击画作聚焦', 'Esc to exit · click a piece to focus', 'Esc 종료 · 작품 클릭');
exitBtn.addEventListener('click', () => { location.href = 'index.html'; });

controls.addEventListener('lock', () => {
  crosshair.hidden = false; hud.hidden = false; exitBtn.hidden = false;
});
controls.addEventListener('unlock', () => {
  crosshair.hidden = true;
});
canvas.addEventListener('click', () => {
  if (!controls.isLocked) { controls.lock(); return; }
  if (focusState) { unfocus(); return; }
  raycaster.setFromCamera(_center, camera);
  const hit = raycaster.intersectObjects(artMeshes, false)[0];
  if (hit && hit.distance < 7) focusOn(hit.object);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && focusState) { unfocus(); }
});

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
  buildHall();   // finite enclosed corridor with every image placed once

  showGateEnter();
  gateEnter.addEventListener('click', () => {
    hideGate();
    startLoop();
    controls.lock();
  }, { once: true });
}
boot();
