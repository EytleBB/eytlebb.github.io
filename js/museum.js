import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

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

const canvas = document.getElementById('scene-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);
scene.fog = new THREE.Fog(0x05070a, 14, 42);

/* ---- IBL: subtle reflections + ambient fill for PBR ---- */
const _pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = _pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.25; // keep it a fill, not a key light
scene.add(new THREE.AmbientLight(0x223040, 0.15));

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, EYE_Y, 0);

const clock = new THREE.Clock();
const updaters = [];
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const fn of updaters) fn(dt);
  renderer.render(scene, camera);
}
let looping = false;
function startLoop() {
  if (looping) return;
  looping = true;
  renderer.setAnimationLoop(frame);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ============================================================
   ARCHITECTURE: materials + corridor shell
   ============================================================ */
const CEIL_Y = 4;
const CHUNK_LEN = 8;
const ART_PER_SIDE = 1;

const mats = {
  wall: new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.92, metalness: 0.0 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.95, metalness: 0.0 }),
  frame: new THREE.MeshPhysicalMaterial({
    color: 0x1a1d22, roughness: 0.35, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.3
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.06, metalness: 0, transmission: 0,
    transparent: true, opacity: 0.06, clearcoat: 1, clearcoatRoughness: 0.05
  }),
};

// A very long ceiling slab; the floor is added in Task 6 (reflective).
function buildStructure() {
  const LEN = 400; // long enough to feel endless before chunk recycling matters
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALL_HALF_WIDTH * 2, LEN), mats.ceiling);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, CEIL_Y, -LEN / 2 + 4);
  ceil.receiveShadow = true;
  scene.add(ceil);
}

/* ============================================================
   CHUNK SYSTEM: walls, framed art, recycling
   ============================================================ */
const POOL = 7;
const ART_W = 1.6, ART_H = 1.1;
const ART_Y = 1.7;                 // center height of artwork
const texLoader = new THREE.TextureLoader();
const chunks = [];
const artMeshes = [];
let nextImage = 0;

function setArtTexture(slot, imageIndex) {
  const url = IMAGES[imageIndex % IMAGES.length];
  texLoader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const old = slot.picMesh.material.map;
    slot.picMesh.material.map = tex;
    slot.picMesh.material.needsUpdate = true;
    if (old) old.dispose();
    // fit plane to image aspect (keep height, adjust width)
    const aspect = tex.image.width / tex.image.height;
    slot.picMesh.scale.set(aspect / (ART_W / ART_H), 1, 1);
  });
}

function makeChunk(index) {
  const group = new THREE.Group();
  const slots = [];

  // two side walls (one per side), full chunk length
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK_LEN, CEIL_Y), mats.wall);
    wall.position.set(side * HALL_HALF_WIDTH, CEIL_Y / 2, 0);
    wall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    wall.receiveShadow = true;
    group.add(wall);

    // artwork slots along this wall
    for (let a = 0; a < ART_PER_SIDE; a++) {
      const pivot = new THREE.Group();
      const zOff = -CHUNK_LEN / 2 + CHUNK_LEN * (a + 0.5) / ART_PER_SIDE;
      pivot.position.set(side * (HALL_HALF_WIDTH - 0.05), ART_Y, zOff);
      pivot.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;

      // frame (slightly larger box behind the picture)
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(ART_W + 0.16, ART_H + 0.16, 0.08), mats.frame);
      frame.position.z = -0.04;
      frame.castShadow = true; frame.receiveShadow = true;

      // picture plane
      const picMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(ART_W, ART_H),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0 }));
      picMesh.userData.pickable = true;

      // glass pane in front (subtle glare)
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(ART_W, ART_H), mats.glass);
      glass.position.z = 0.02;

      pivot.add(frame, picMesh, glass);
      group.add(pivot);
      artMeshes.push(picMesh);
      slots.push({ pivot, picMesh, frame, glass, side, /* light filled in Task 6 */ });
    }
  }
  scene.add(group);
  return { group, slots };
}

function buildChunks() {
  for (let i = 0; i < POOL; i++) {
    const c = makeChunk(i);
    c.z = -i * CHUNK_LEN;          // chunk 0 starts at origin, extends forward
    c.group.position.z = c.z;
    for (const slot of c.slots) setArtTexture(slot, nextImage++);
    chunks.push(c);
  }
}

function recycleChunks() {
  // furthest-back chunk (largest z) jumps ahead of the furthest-forward (smallest z)
  // when the player has walked past it.
  const playerZ = camera.position.z;
  for (const c of chunks) {
    if (c.z - playerZ > CHUNK_LEN * 1.5) {     // chunk is well behind the player
      const minZ = Math.min(...chunks.map(k => k.z));
      c.z = minZ - CHUNK_LEN;
      c.group.position.z = c.z;
      for (const slot of c.slots) setArtTexture(slot, nextImage++);
    }
  }
}
updaters.push(recycleChunks);

/* ============================================================
   FIRST-PERSON CONTROLS + MOVEMENT
   ============================================================ */
const FORWARD_MIN_Z = 1.5;
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
  if (pos.z >  FORWARD_MIN_Z) pos.z = FORWARD_MIN_Z; // can't walk behind start
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
  // re-show a minimal hint to click back in (re-lock on canvas click)
});
canvas.addEventListener('click', () => { if (!controls.isLocked) controls.lock(); });

/* ---- boot ---- */
async function boot() {
  try {
    await loadImageList();
  } catch (e) {
    fail('画廊暂无图片或加载失败。', 'Gallery is empty or failed to load.', '갤러리가 비어 있거나 로드에 실패했습니다.');
    return;
  }
  // Temporary Task-1 proof: confirm Three loaded and list parsed.
  console.log('[museum] THREE', THREE.REVISION, 'images', IMAGES.length);
  buildStructure();   // long ceiling
  buildChunks();      // walls + art pool
  setProgress(0, IMAGES.length);
  showGateEnter();
  gateEnter.addEventListener('click', () => {
    hideGate();
    startLoop();
    controls.lock();
  }, { once: true });
}
boot();
