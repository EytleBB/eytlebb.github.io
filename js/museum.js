import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
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
  composer.render();
}
let looping = false;
function startLoop() {
  if (looping) return;
  looping = true;
  renderer.setAnimationLoop(frame);
}

/* ============================================================
   POST PIPELINE: AO + subtle bloom + tone-mapped output
   ============================================================ */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const ssao = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
ssao.kernelRadius = 8;
ssao.minDistance = 0.004;
ssao.maxDistance = 0.12;
composer.addPass(ssao);

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.25,  // strength — subtle
  0.6,   // radius
  0.9    // threshold — only the brightest fixtures/highlights bloom
);
composer.addPass(bloom);

composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  ssao.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
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

// A very long ceiling slab; the floor is added below (reflective).
function buildStructure() {
  const LEN = 400; // long enough to feel endless before chunk recycling matters
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALL_HALF_WIDTH * 2, LEN), mats.ceiling);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, CEIL_Y, -LEN / 2 + 4);
  ceil.receiveShadow = true;
  scene.add(ceil);
}

/* ---- polished reflective floor ---- */
function buildFloor() {
  const LEN = 400;
  const geo = new THREE.PlaneGeometry(HALL_HALF_WIDTH * 2, LEN);
  const reflector = new Reflector(geo, {
    color: 0x0a0c10,
    textureWidth: Math.min(window.innerWidth, 1024) * renderer.getPixelRatio(),
    textureHeight: Math.min(window.innerHeight, 1024) * renderer.getPixelRatio(),
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set(0, 0.001, -LEN / 2 + 4);
  scene.add(reflector);

  // a rough dark overlay so it reads polished, not a mirror
  const overlay = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0x070809, roughness: 0.45, metalness: 0.4, transparent: true, opacity: 0.78 }));
  overlay.rotation.x = -Math.PI / 2;
  overlay.position.set(0, 0.002, -LEN / 2 + 4);
  overlay.receiveShadow = true;
  scene.add(overlay);
}

/* ============================================================
   CHUNK SYSTEM: walls, framed art, recycling
   ============================================================ */
const POOL = 7;
const SHADOW_CHUNKS = 3;
const ART_W = 1.6, ART_H = 1.1;
const ART_Y = 1.7;                 // center height of artwork
const texLoader = new THREE.TextureLoader();
const chunks = [];
const artMeshes = [];
let nextImage = 0;

let _loaded = 0;
const _initialBatch = POOL * ART_PER_SIDE * 2; // both sides
function _onArtLoaded() {
  _loaded++;
  if (_loaded <= _initialBatch) setProgress(Math.min(_loaded, _initialBatch), _initialBatch);
  if (_loaded === _initialBatch) showGateEnter();
}

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
    _onArtLoaded();
  },
    undefined,
    () => { _onArtLoaded(); });
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

      // dedicated track spotlight aimed at this piece
      const spot = new THREE.SpotLight(0xfff2dd, 16, 9, Math.PI / 7, 0.5, 1.4);
      spot.position.set(side * (HALL_HALF_WIDTH - 1.1), CEIL_Y - 0.15, zOff);
      const spotTarget = new THREE.Object3D();
      spotTarget.position.set(side * HALL_HALF_WIDTH, ART_Y, zOff);
      spot.target = spotTarget;
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.camera.near = 0.5;
      spot.shadow.camera.far = 9;
      spot.shadow.bias = -0.0006;
      spot.shadow.normalBias = 0.02;
      group.add(spot, spotTarget);

      group.add(pivot);
      artMeshes.push(picMesh);
      slots.push({ pivot, picMesh, frame, glass, side, spot, spotTarget });
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
updaters.push(() => {
  const pz = camera.position.z;
  for (const c of chunks) {
    const near = Math.abs(c.z - pz) <= CHUNK_LEN * SHADOW_CHUNKS;
    for (const slot of c.slots) if (slot.spot) slot.spot.castShadow = near;
  }
});

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

/* ============================================================
   CLICK-TO-FOCUS
   ============================================================ */
const raycaster = new THREE.Raycaster();
const _center = new THREE.Vector2(0, 0); // crosshair = screen center
let focusState = null;   // null | { phase:'toArt'|'returning', t, fromPos, fromQuat, toPos, toQuat }
let roamReturn = null;   // { pos, quat } — the roam pose to glide back to

function focusOn(mesh) {
  // target: stand back from the piece, looking straight at it
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
  if (!focusState || focusState.t >= 1) return;   // null, or already settled
  focusState.t = Math.min(1, focusState.t + dt / 0.6); // ~0.6s
  const e = focusState.t * focusState.t * (3 - 2 * focusState.t); // smoothstep
  camera.position.lerpVectors(focusState.fromPos, focusState.toPos, e);
  _q.slerpQuaternions(focusState.fromQuat, focusState.toQuat, e);
  camera.quaternion.copy(_q);
  if (focusState.t >= 1 && focusState.phase === 'returning') {
    // arrived back at the roam pose → resume roaming
    roamEnabled = true;
    focusState = null;
    roamReturn = null;
  }
  // phase 'toArt' settles with focusState kept (t===1); the guard above
  // then early-returns each later frame until the user unfocuses.
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
canvas.addEventListener('click', () => {
  if (!controls.isLocked) { controls.lock(); return; }
  if (focusState) { unfocus(); return; }      // click again to leave focus (or interrupt inbound tween)
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
  // Temporary Task-1 proof: confirm Three loaded and list parsed.
  console.log('[museum] THREE', THREE.REVISION, 'images', IMAGES.length);
  buildStructure();   // ceiling
  buildFloor();       // reflective floor
  buildChunks();      // walls + art (+ spotlights)
  setProgress(0, _initialBatch);
  gateEnter.addEventListener('click', () => {
    hideGate();
    startLoop();
    controls.lock();
  }, { once: true });
}
boot();
