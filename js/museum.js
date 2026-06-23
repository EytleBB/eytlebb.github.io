import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
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
const CEIL_Y = 4;

const canvas = document.getElementById('scene-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
// no shadow maps — dropped for smoothness (was the source of the view-snap hitch)

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  renderer.setAnimationLoop(null);
  document.body.classList.remove('locked');
  fail('渲染上下文丢失，请刷新页面。', 'Rendering context lost — please reload.', '렌더링 컨텍스트가 손실되었습니다. 새로고침하세요.');
}, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
scene.fog = new THREE.Fog(0x0b1220, 18, 85);

/* ---- IBL + ambient fill (amber & teal: cool ambient, warm followers) ---- */
const _pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = _pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
_pmrem.dispose();
scene.environmentIntensity = 0.7;
scene.add(new THREE.AmbientLight(0x33425f, 0.5));
scene.add(new THREE.HemisphereLight(0x3a4f78, 0x140e06, 0.4));
// two warm lights that follow the player → a moving pool of gallery light
const warmA = new THREE.PointLight(0xffcf85, 28, 22, 2);
const warmB = new THREE.PointLight(0xffcf85, 28, 22, 2);
scene.add(warmA, warmB);

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
  0.82   // threshold
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
  wall: new THREE.MeshStandardMaterial({ color: 0x1b2740, roughness: 0.9, metalness: 0.0 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0x0e1626, roughness: 1.0, metalness: 0.0 }),
  endWall: new THREE.MeshStandardMaterial({ color: 0x1f2c47, roughness: 0.9, metalness: 0.0 }),
  // gilt bronze frame — ties to the amber accent
  frame: new THREE.MeshStandardMaterial({ color: 0xb98a2a, roughness: 0.5, metalness: 0.45 }),
  // polished dark floor — env reflection gives sheen without a second render pass
  floor: new THREE.MeshStandardMaterial({ color: 0x0c1322, roughness: 0.3, metalness: 0.55 }),
  // glowing ceiling-cove strip (emissive → light line + bloom)
  cove: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd9a0, emissiveIntensity: 1.5 }),
};

/* ============================================================
   FINITE HALL — sized to hold every image once. No recycling,
   no infinite generation: one enclosed corridor with end walls.
   ============================================================ */
const ART_SPACING = 5;        // metres between consecutive pieces on a wall
const ART_H = 1.9;            // artwork height (width derives from aspect)
const ART_MAX_W = 2.7;        // clamp very wide images
const ART_Y = 1.75;           // centre height of artwork
const START_MARGIN = 6;       // first piece this far in front of spawn
const END_MARGIN = 5;         // gap between last piece and the back wall

let HALL_BACK_Z = -50;        // most-negative reachable z (set by buildHall)
const HALL_FRONT_Z = 2;       // wall just behind spawn (z=0)

const texLoader = new THREE.TextureLoader();
const texCache = [];          // one THREE.Texture (or null) per IMAGES entry
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

function makeArtwork(side, z, tex) {
  if (!tex) return;
  // size to the image's real aspect ratio (portrait or landscape)
  const ar = tex.image.width / tex.image.height;
  let h = ART_H, w = h * ar;
  if (w > ART_MAX_W) { w = ART_MAX_W; h = w / ar; }

  const x = side * (HALL_HALF_WIDTH - 0.05);
  const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;

  // frame: a flat plane slightly larger than the picture (no box → no z-fight)
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.2, h + 0.2), mats.frame);
  frame.position.set(x, ART_Y, z);
  frame.rotation.y = ry;
  scene.add(frame);

  // picture: UNLIT (MeshBasic) so it always reads true-colour, no glow, no
  // shadow weirdness — and pushed 2cm proud of the frame so they never z-fight
  const pic = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex }));
  pic.position.set(x + side * -0.02, ART_Y, z);
  pic.rotation.y = ry;
  pic.userData.pickable = true;
  scene.add(pic);
  artMeshes.push(pic);
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
  scene.add(ceil);

  // glossy floor (env-reflective, single pass)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, len), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, midZ);
  scene.add(floor);

  // side walls + ceiling coves
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, CEIL_Y), mats.wall);
    wall.position.set(side * HALL_HALF_WIDTH, CEIL_Y / 2, midZ);
    wall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(wall);

    const cove = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, len), mats.cove);
    cove.position.set(side * (HALL_HALF_WIDTH - 0.13), CEIL_Y - 0.22, midZ);
    scene.add(cove);
  }

  // end walls — fully enclose the room
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(width, CEIL_Y), mats.endWall);
  backWall.position.set(0, CEIL_Y / 2, HALL_BACK_Z);
  scene.add(backWall);
  const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(width, CEIL_Y), mats.endWall);
  frontWall.position.set(0, CEIL_Y / 2, HALL_FRONT_Z);
  frontWall.rotation.y = Math.PI;
  scene.add(frontWall);

  // place every artwork once, alternating walls
  for (let i = 0; i < n; i++) {
    const side = (i % 2 === 0) ? -1 : 1;
    const k = Math.floor(i / 2);
    const z = -(START_MARGIN + k * ART_SPACING);
    makeArtwork(side, z, texCache[i]);
  }
}

/* ============================================================
   FIRST-PERSON CONTROLS + MOVEMENT (with Shift run)
   ============================================================ */
const WALK_SPEED = 3.2, RUN_SPEED = 6.5;   // m/s
const LOOK_SENS = 0.0022;
const MAX_DELTA = 90;                        // clamp a single mouse event → no spike snaps
let yaw = Math.PI, pitch = 0;                // start facing -Z (into the hall)
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
  if (pos.z > HALL_FRONT_Z - 0.6) pos.z = HALL_FRONT_Z - 0.6;  // front wall
  if (pos.z < HALL_BACK_Z + 0.6)  pos.z = HALL_BACK_Z + 0.6;   // back wall
  pos.y = EYE_Y;
}

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
updaters.push((dt) => {
  // warm followers track the player every frame (even when paused, so the
  // scene behind the menu stays lit)
  const cp = camera.position;
  warmA.position.set(cp.x * 0.3, CEIL_Y - 1.0, cp.z - 3.5);
  warmB.position.set(cp.x * 0.3, CEIL_Y - 1.0, cp.z + 3.5);

  // rebuild orientation from yaw/pitch unless a focus tween drives the camera
  if (!focusState) {
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.rotateY(yaw);
    camera.rotateX(pitch);
  }

  if (!roamEnabled || !isLocked()) return;
  camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
  _right.crossVectors(_fwd, camera.up).normalize();
  const step = (keys.run ? RUN_SPEED : WALK_SPEED) * dt;
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
let savedYaw = Math.PI, savedPitch = 0;   // look angles to restore after focus

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

// click the start/pause overlay (or its button) to lock the pointer and play
function enterPlay() {
  if (!preloaded) return;
  entered = true;
  canvas.requestPointerLock();
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
  buildHall();
  startLoop();        // render the hall behind the translucent start overlay
  readyToEnter();
}
boot();
