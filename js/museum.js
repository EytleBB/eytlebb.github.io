import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

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

/* --- TEMP (removed in Task 4): proof-of-render cube --- */
const _tmpLight = new THREE.DirectionalLight(0xffffff, 2.5);
_tmpLight.position.set(3, 6, 2);
scene.add(_tmpLight, new THREE.AmbientLight(0x223344, 0.6));
const _tmpCube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.5, metalness: 0.1 })
);
_tmpCube.position.set(0, EYE_Y, -4);
scene.add(_tmpCube);
updaters.push((dt) => { _tmpCube.rotation.y += dt * 0.6; });

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
  setProgress(0, IMAGES.length);
  showGateEnter();
  gateEnter.addEventListener('click', () => {
    hideGate();
    startLoop();
    controls.lock();
  }, { once: true });
}
boot();
