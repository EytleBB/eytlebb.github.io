# 3D Museum Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the gallery grid (on capable desktops) with a first-person, infinitely-extending, photorealistic 3D museum at `museum.html`, while mobile/unsupported devices keep the existing grid.

**Architecture:** A standalone full-screen page (`museum.html`) loads Three.js via a pinned jsDelivr importmap and runs `js/museum.js` (ES module). The scene is one infinite corridor built from a recycled pool of "chunk" segments; artworks come from the existing `images/gallery/index.json`. Rendering uses ACES tone mapping, IBL, PBR materials, per-artwork spotlights with soft shadows, a planar-reflective floor, subtle frame glare, and a restrained AO/bloom post stack. `js/main.js` gains a capability gate on the Gallery nav that routes capable desktops to `museum.html` and everyone else to the unchanged grid.

**Tech Stack:** Vanilla HTML/CSS/JS (no build), Three.js r0.169.0 + examples/jsm addons (PointerLockControls, Reflector, RoomEnvironment, EffectComposer, RenderPass, OutputPass, UnrealBloomPass, SSAOPass), loaded via ES-module importmap from jsDelivr.

## Global Constraints

- **No build step, no bundler, no package manager.** Everything served as static files. (CLAUDE.md)
- **Three.js pinned to `0.169.0`** from `https://cdn.jsdelivr.net/npm/three@0.169.0/...`; addons from the matching `.../examples/jsm/...`. Use the exact same version string everywhere.
- **Never edit** `images/gallery/index.json` or `logs/index.json` by hand (GitHub Actions own them).
- **Filenames may contain brackets** (e.g. `[10].png`). Build URLs as `images/gallery/${encodeURIComponent(filename)}` — exactly as `loadGallery()` in `main.js` does.
- **`museum.html` is self-contained** (like `mc-calc.html`): it shares no JS with `main.js`.
- **Museum is a fixed dark dramatic hall** — no day/night theme switching inside it.
- **UI text trilingual** (zh / en / ko), default zh, reading the same `lang` key from `localStorage` that `main.js` uses (`localStorage.getItem('lang')`).
- **Exit returns to `index.html`** (home), never to `#gallery`, to avoid a relaunch loop.
- **Verification is manual** in a desktop browser (no test runner exists). Serve locally with `python -m http.server` from the repo root and open the relevant page.

---

## Task 0: Local serving sanity check

**Files:**
- None (environment check only)

**Interfaces:**
- Consumes: nothing
- Produces: confirmed local serve command used by every later task's verification

- [ ] **Step 1: Start a local static server from the repo root**

Run (from `D:\eyt_web`):
```bash
python -m http.server 8000
```
Expected: `Serving HTTP on :: port 8000 (http://[::]:8000/) ...`

- [ ] **Step 2: Confirm the existing site loads**

Open `http://localhost:8000/index.html`. Click "画廊 / Gallery".
Expected: the current grid of images renders (baseline before changes).

- [ ] **Step 3: Confirm gallery index is reachable**

Open `http://localhost:8000/images/gallery/index.json`.
Expected: a JSON array of filenames like `["[10].png", ...]`.

No commit (no file changes).

---

## Task 1: Page shell, importmap, and entry gate (no 3D yet)

Builds the standalone page with the loading/entry gate and HUD chrome, verifies Three.js loads from the CDN, and fetches the gallery list — all before any scene exists.

**Files:**
- Create: `museum.html`
- Create: `css/museum.css`
- Create: `js/museum.js`

**Interfaces:**
- Consumes: `images/gallery/index.json` (array of filename strings)
- Produces (in `js/museum.js`, used by later tasks):
  - `const THREE` namespace import from `'three'`
  - `let IMAGES = []` — array of URL strings `images/gallery/<encoded>.png`
  - `const T = (zh, en, ko) => string` — language picker reading `localStorage.lang`
  - `function showGate(htmlOrState)` / `function hideGate()` — controls the `#gate` overlay
  - `function setProgress(loaded, total)` — updates the gate progress text
  - `function fail(msgZh, msgEn, msgKo)` — shows an error state in the gate with a 返回 button
  - DOM ids present: `#scene-canvas` (canvas), `#gate` (overlay), `#hud` (roam HUD), `#crosshair`, `#exit-btn`

- [ ] **Step 1: Create `museum.html`**

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Museum · This is Eytle</title>
  <link rel="icon" href="images/favicon.png" />
  <link rel="stylesheet" href="css/museum.css" />
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
  <canvas id="scene-canvas"></canvas>

  <div id="crosshair" hidden></div>

  <button id="exit-btn" hidden>✕</button>

  <div id="hud" hidden>
    <span class="hud-keys">WASD</span>
    <span class="hud-sep">·</span>
    <span class="hud-tip" id="hud-tip"></span>
  </div>

  <div id="gate">
    <div class="gate-inner">
      <h1 id="gate-title">This is Eytle</h1>
      <p id="gate-sub"></p>
      <div id="gate-progress"></div>
      <button id="gate-enter" hidden></button>
      <button id="gate-back" hidden></button>
    </div>
  </div>

  <script type="module" src="js/museum.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `css/museum.css`**

```css
:root { --bg:#0a0c10; --ink:#e9eaec; --muted:#9aa0a8; --amber:#d9a441; }
* { box-sizing: border-box; }
html, body { margin:0; height:100%; background:var(--bg); color:var(--ink);
  font-family:"Hanken Grotesk", system-ui, sans-serif; overflow:hidden; }
#scene-canvas { position:fixed; inset:0; width:100%; height:100%; display:block; }

#crosshair { position:fixed; left:50%; top:50%; width:6px; height:6px; margin:-3px 0 0 -3px;
  border-radius:50%; background:rgba(255,255,255,.7); pointer-events:none; z-index:5;
  box-shadow:0 0 0 1px rgba(0,0,0,.4); }

#exit-btn { position:fixed; top:16px; right:16px; z-index:6; width:40px; height:40px;
  border:1px solid rgba(255,255,255,.18); background:rgba(10,12,16,.55); color:var(--ink);
  border-radius:8px; font-size:18px; cursor:pointer; backdrop-filter:blur(6px); }
#exit-btn:hover { border-color:var(--amber); color:var(--amber); }

#hud { position:fixed; left:50%; bottom:22px; transform:translateX(-50%); z-index:5;
  display:flex; gap:8px; align-items:center; padding:8px 14px; border-radius:999px;
  background:rgba(10,12,16,.5); border:1px solid rgba(255,255,255,.12);
  color:var(--muted); font-size:13px; letter-spacing:.02em; backdrop-filter:blur(6px); }
.hud-keys { color:var(--ink); font-weight:500; }

#gate { position:fixed; inset:0; z-index:10; display:flex; align-items:center; justify-content:center;
  background:radial-gradient(120% 120% at 50% 30%, #11151b 0%, #06080b 70%); }
.gate-inner { text-align:center; max-width:520px; padding:0 24px; }
#gate-title { font-family:"Fraunces", Georgia, serif; font-weight:500; font-size:34px; margin:0 0 10px; }
#gate-title em { color:var(--amber); font-style:italic; }
#gate-sub { color:var(--muted); line-height:1.7; margin:0 0 26px; font-size:15px; }
#gate-progress { color:var(--muted); font-size:13px; min-height:18px; margin-bottom:22px;
  font-variant-numeric:tabular-nums; }
#gate-enter, #gate-back { font:inherit; font-size:15px; padding:11px 26px; border-radius:10px;
  cursor:pointer; background:transparent; color:var(--ink); border:1px solid rgba(255,255,255,.22); }
#gate-enter:hover { border-color:var(--amber); color:var(--amber); }
#gate-back { margin-left:10px; color:var(--muted); }
```

- [ ] **Step 3: Create `js/museum.js` with language helper, gate controls, and gallery fetch**

```js
import * as THREE from 'three';

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
    // scene + controls wired in later tasks
  }, { once: true });
}
boot();
```

- [ ] **Step 4: Verify in browser**

With the server from Task 0 running, open `http://localhost:8000/museum.html`.
Expected:
- The dark gate shows the title "This is *Eytle*", the control hint line, and a "点击进入 / Enter" button.
- DevTools console logs `[museum] THREE 169 images 23` (revision 169, 23 images) — proving the CDN importmap resolved and the list parsed.
- Clicking "进入" hides the gate (reveals the empty canvas / dark page) without errors.

- [ ] **Step 5: Verify the empty-gallery error path**

Temporarily rename the fetch target by editing the URL in `loadImageList` to `./images/gallery/nope.json`, reload.
Expected: gate shows the "画廊暂无图片或加载失败" message and a "返回" button that navigates to `index.html`.
Then **revert** the URL back to `./images/gallery/index.json`.

- [ ] **Step 6: Commit**

```bash
git add museum.html css/museum.css js/museum.js
git commit -m "feat(museum): standalone page shell, CDN importmap, entry gate + gallery fetch"
```

---

## Task 2: Renderer, scene, camera, resize, render loop

Stand up a photorealistic-grade renderer and a minimal dark scene with one test cube so tone mapping, color space, and the animation loop are proven before adding architecture.

**Files:**
- Modify: `js/museum.js`

**Interfaces:**
- Consumes (from Task 1): `THREE`, `hideGate`, `gateEnter`, the `#scene-canvas` element
- Produces (used by later tasks):
  - `const renderer` — `THREE.WebGLRenderer` (ACES, sRGB, PCFSoft shadows enabled)
  - `const scene` — `THREE.Scene`
  - `const camera` — `THREE.PerspectiveCamera` at eye height `EYE_Y = 1.6`
  - `const clock` — `THREE.Clock`
  - `function frame(dt)` — per-frame hook other tasks push work into via `updaters.push(fn)`
  - `const updaters = []` — array of `(dt) => void` callbacks run each frame
  - `function startLoop()` — begins `requestAnimationFrame`
  - constants: `EYE_Y = 1.6`, `HALL_HALF_WIDTH = 3` (corridor half width, meters)

- [ ] **Step 1: Add renderer/scene/camera/loop above `boot()`**

```js
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
```

- [ ] **Step 2: Add a temporary lit test cube + a fill light (proves tone mapping/shadows)**

Add right after the resize handler:
```js
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
```

- [ ] **Step 3: Start the loop when entering**

Change the `gateEnter` click handler in `boot()` to:
```js
  gateEnter.addEventListener('click', () => {
    hideGate();
    startLoop();
  }, { once: true });
```

- [ ] **Step 4: Verify in browser**

Reload `museum.html`, click "进入".
Expected: a slowly rotating shaded cube floats ahead in a near-black, slightly foggy scene; no console errors; resizing the window keeps the cube centered and undistorted.

- [ ] **Step 5: Commit**

```bash
git add js/museum.js
git commit -m "feat(museum): WebGL renderer (ACES/sRGB/soft shadows), scene, camera, render loop"
```

---

## Task 3: First-person controls + corridor-bounded movement

Add pointer-lock look, WASD movement, crosshair/HUD/exit chrome, and analytic clamping to the corridor box and origin.

**Files:**
- Modify: `js/museum.js`

**Interfaces:**
- Consumes: `camera`, `updaters`, `EYE_Y`, `HALL_HALF_WIDTH`, `startLoop`, gate/HUD DOM (`#hud`, `#crosshair`, `#exit-btn`), `T`
- Produces (used by later tasks):
  - `const controls` — `PointerLockControls`
  - `let roamEnabled` — boolean gate for movement (focus mode toggles it off in Task 7)
  - `function clampToHall(pos)` — clamps a Vector3 to corridor bounds + origin
  - constant `FORWARD_MIN_Z = 1.5` (player cannot pass behind start; start faces `-Z`)

- [ ] **Step 1: Import controls at top of file**

Add under the existing `import * as THREE` line:
```js
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
```

- [ ] **Step 2: Add controls + movement state after the camera/loop block**

```js
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
```

- [ ] **Step 3: Wire chrome (crosshair/HUD/exit) to lock state**

```js
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
```

- [ ] **Step 4: Lock pointer on entering**

Update the `gateEnter` handler in `boot()`:
```js
  gateEnter.addEventListener('click', () => {
    hideGate();
    startLoop();
    controls.lock();
  }, { once: true });
```

- [ ] **Step 5: Verify in browser**

Reload, click "进入" → pointer locks (crosshair + HUD + ✕ appear).
Expected:
- Moving the mouse looks around; WASD moves on a level plane.
- You cannot move sideways past an invisible wall (|x| capped near 2.6) nor backward past the start (z capped at 1.5); you can walk forward freely (cube recedes).
- `Esc` unlocks (crosshair hides); clicking the canvas re-locks.
- The ✕ button navigates to `index.html`.

- [ ] **Step 6: Commit**

```bash
git add js/museum.js
git commit -m "feat(museum): pointer-lock WASD controls, corridor clamping, HUD/crosshair/exit"
```

---

## Task 4: Architecture — corridor shell, PBR materials, IBL environment

Replace the temp cube with the real dark modern-minimalist corridor (floor, two walls, ceiling) using PBR materials lit by an IBL environment, so reflections/ambient read correctly before lights and art are added.

**Files:**
- Modify: `js/museum.js`

**Interfaces:**
- Consumes: `THREE`, `scene`, `renderer`, `HALL_HALF_WIDTH`
- Produces (used by later tasks):
  - `const CEIL_Y = 4` — ceiling height
  - `const CHUNK_LEN = 8` — corridor segment length (meters along Z)
  - `const ART_PER_SIDE = 1` — artworks per wall per chunk (1 each side → 2 per chunk)
  - `const mats` — shared materials object `{ wall, ceiling, frame, glass }` (PBR, reused by all chunks)
  - `function buildStructure()` — adds the static long floor/ceiling and proves materials; walls become per-chunk in Task 5
  - environment map applied via `scene.environment`

- [ ] **Step 1: Import RoomEnvironment + PMREM**

Add to the import block:
```js
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
```

- [ ] **Step 2: Generate IBL environment (after renderer creation)**

```js
/* ---- IBL: subtle reflections + ambient fill for PBR ---- */
const _pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = _pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.25; // keep it a fill, not a key light
```

- [ ] **Step 3: Define shared PBR materials + structure constants**

```js
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
```

- [ ] **Step 4: Build the long ceiling (floor comes in Task 6 as a Reflector)**

```js
// A very long ceiling slab; the floor is added in Task 6 (reflective).
function buildStructure() {
  const LEN = 400; // long enough to feel endless before chunk recycling matters
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALL_HALF_WIDTH * 2, LEN), mats.ceiling);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, CEIL_Y, -LEN / 2 + 4);
  ceil.receiveShadow = true;
  scene.add(ceil);
}
```

- [ ] **Step 5: Remove the temp cube + temp lights; call `buildStructure()`**

Delete the entire `/* --- TEMP (removed in Task 4) --- */` block (the `_tmpLight`, `_tmpCube`, and its updater). Then add a call inside `boot()` right after `await loadImageList()` succeeds (before `setProgress`):
```js
  buildStructure();
```
Keep a single faint ambient so the scene isn't pure black before Task 5 lights exist:
```js
scene.add(new THREE.AmbientLight(0x223040, 0.15));
```
(Place this `AmbientLight` line next to the `scene.environment` setup.)

- [ ] **Step 6: Verify in browser**

Reload, enter, walk forward.
Expected: a dark ceiling slab overhead receding into fog; walls/floor not yet present (added in Tasks 5–6); no temp cube; subtle environment reflection visible on the ceiling material edges; no console errors.

- [ ] **Step 7: Commit**

```bash
git add js/museum.js
git commit -m "feat(museum): IBL environment, shared PBR materials, corridor ceiling shell"
```

---

## Task 5: Chunk system — walls + framed artworks + recycling

Build the recycled chunk pool: each chunk has both side walls and `ART_PER_SIDE` framed artworks per side. As the player advances, the rearmost chunk wraps to the front and its artworks re-texture from the cycling image list.

**Files:**
- Modify: `js/museum.js`

**Interfaces:**
- Consumes: `THREE`, `scene`, `camera`, `mats`, `CEIL_Y`, `CHUNK_LEN`, `ART_PER_SIDE`, `HALL_HALF_WIDTH`, `IMAGES`, `updaters`
- Produces (used by later tasks):
  - `const chunks = []` — array of chunk objects `{ group, z, slots:[{ pivot, picMesh, frame, glass, spot, light, lightTarget }] }`
  - `const artMeshes = []` — flat list of pickable artwork meshes (for raycasting in Task 7)
  - `function setArtTexture(slot, imageIndex)` — loads + assigns a texture, disposing the old one
  - `function buildChunks()` — creates the pool
  - `function recycleChunks()` — repositions passed chunks ahead and re-textures
  - `let nextImage` — running index into `IMAGES` (wraps with `% IMAGES.length`)
  - constant `POOL = 7` (chunks kept alive), `ART_W = 1.6`, `ART_H = 1.1` (default art plane size, meters)

- [ ] **Step 1: Add the texture loader + chunk constants**

```js
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
```

- [ ] **Step 2: Build a single chunk (walls + slots), reusable**

```js
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
```

- [ ] **Step 3: Build the pool + initial textures**

```js
function buildChunks() {
  for (let i = 0; i < POOL; i++) {
    const c = makeChunk(i);
    c.z = -i * CHUNK_LEN;          // chunk 0 starts at origin, extends forward
    c.group.position.z = c.z;
    for (const slot of c.slots) setArtTexture(slot, nextImage++);
    chunks.push(c);
  }
}
```

- [ ] **Step 4: Recycle as the player advances**

```js
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
```

- [ ] **Step 5: Replace the standalone ceiling with chunk-aware build order**

In `boot()`, replace the `buildStructure();` call with:
```js
  buildStructure();   // long ceiling
  buildChunks();      // walls + art pool
```
(`buildStructure` stays as the ceiling-only function from Task 4.)

- [ ] **Step 6: Verify in browser**

Reload, enter, walk forward continuously.
Expected:
- Side walls now enclose a corridor; framed artworks hang on both walls showing the gallery images (correct aspect ratios, no stretching), including bracket-named files.
- Walking forward never reaches an end — new framed art keeps appearing; turning around, the corridor behind also stays populated within the pool.
- DevTools "Performance monitor" / heap stays roughly flat over a minute of walking (textures disposed on recycle) — no runaway growth.

- [ ] **Step 7: Commit**

```bash
git add js/museum.js
git commit -m "feat(museum): recycled chunk pool with side walls and framed artworks"
```

---

## Task 6: Per-artwork spotlights, soft shadows, reflective floor

Give each artwork its own ceiling track spotlight with an independent soft-shadow map, and add the polished planar-reflective floor.

**Files:**
- Modify: `js/museum.js`

**Interfaces:**
- Consumes: `THREE`, `scene`, `renderer`, `chunks`, `mats`, `CHUNK_LEN`, `CEIL_Y`, `HALL_HALF_WIDTH`, `ART_Y`, slot objects from Task 5
- Produces (used by later tasks): floor mesh present; each slot gains `slot.spot` (SpotLight) + `slot.spotTarget`
  - `const SHADOW_CHUNKS = 3` — only the nearest chunks' spotlights cast shadows (perf guard)

- [ ] **Step 1: Import Reflector**

```js
import { Reflector } from 'three/addons/objects/Reflector.js';
```

- [ ] **Step 2: Add the reflective floor (call from `boot()` after `buildStructure()`)**

```js
/* ---- polished reflective floor ---- */
function buildFloor() {
  const LEN = 400;
  const geo = new THREE.PlaneGeometry(HALL_HALF_WIDTH * 2, LEN);
  const reflector = new THREE.Reflector(geo, {
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
```

In `boot()`:
```js
  buildStructure();   // ceiling
  buildFloor();       // reflective floor
  buildChunks();      // walls + art (+ spotlights, next step)
```

- [ ] **Step 3: Add a spotlight per slot inside `makeChunk` (extend Task 5's slot loop)**

Inside `makeChunk`, right after `pivot.add(frame, picMesh, glass);` and before `slots.push(...)`, add:
```js
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
```
And update the `slots.push` line to carry them:
```js
      slots.push({ pivot, picMesh, frame, glass, side, spot, spotTarget });
```

- [ ] **Step 4: Limit shadow casters to nearby chunks (perf guard)**

Add a constant near the chunk constants:
```js
const SHADOW_CHUNKS = 3;
```
Add an updater after `updaters.push(recycleChunks);`:
```js
updaters.push(() => {
  const pz = camera.position.z;
  for (const c of chunks) {
    const near = Math.abs(c.z - pz) <= CHUNK_LEN * SHADOW_CHUNKS;
    for (const slot of c.slots) if (slot.spot) slot.spot.castShadow = near;
  }
});
```

- [ ] **Step 5: Verify in browser**

Reload, enter, walk.
Expected:
- Each painting is individually pooled in a warm spotlight cone; the wall around each piece falls off into darkness — clearly *independent* per-artwork lighting.
- Frames cast soft (not hard) shadows onto the wall; shadow edges are penumbra-soft.
- The floor reflects the lit artworks and spotlight pools as a polished, slightly muted mirror (not a perfect mirror, not matte).
- Framerate stays smooth while walking (only nearby spotlights cast shadows).

- [ ] **Step 6: Commit**

```bash
git add js/museum.js
git commit -m "feat(museum): per-artwork spotlights w/ soft shadows + reflective floor"
```

---

## Task 7: Click-to-focus interaction

Raycast from the crosshair on click; if an artwork is hit, smoothly tween the camera to a straight-on close-up and disable roam; click again or Esc returns to roaming.

**Files:**
- Modify: `js/museum.js`

**Interfaces:**
- Consumes: `THREE`, `camera`, `controls`, `roamEnabled`, `artMeshes`, `updaters`, `clampToHall`, `EYE_Y`
- Produces: focus state machine; toggles `roamEnabled`

- [ ] **Step 1: Add the focus state + raycaster**

```js
/* ============================================================
   CLICK-TO-FOCUS
   ============================================================ */
const raycaster = new THREE.Raycaster();
const _center = new THREE.Vector2(0, 0); // crosshair = screen center
let focusState = null; // { from:{pos,quat}, toPos, toQuat, t } or 'focused'

function focusOn(mesh) {
  // target: stand back from the piece, looking straight at it
  const worldPos = new THREE.Vector3();
  mesh.getWorldPosition(worldPos);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
  const toPos = worldPos.clone().addScaledVector(normal, 1.6);
  toPos.y = worldPos.y;

  const m = new THREE.Matrix4().lookAt(toPos, worldPos, camera.up);
  const toQuat = new THREE.Quaternion().setFromRotationMatrix(m);

  focusState = {
    fromPos: camera.position.clone(),
    fromQuat: camera.quaternion.clone(),
    toPos, toQuat, t: 0, returning: false,
  };
  roamEnabled = false;
}

function unfocus() {
  if (!focusState || focusState.returning) return;
  focusState = {
    fromPos: camera.position.clone(),
    fromQuat: camera.quaternion.clone(),
    toPos: focusState.fromPos.clone(),   // original roam position
    toQuat: focusState.fromQuat.clone(),
    t: 0, returning: true,
  };
}
```

- [ ] **Step 2: Drive the tween each frame**

```js
const _q = new THREE.Quaternion();
updaters.push((dt) => {
  if (!focusState || focusState.t >= 1 && !focusState.returning && focusState === 'focused') return;
  if (typeof focusState !== 'object') return;
  focusState.t = Math.min(1, focusState.t + dt / 0.6); // ~0.6s
  const e = focusState.t * focusState.t * (3 - 2 * focusState.t); // smoothstep
  camera.position.lerpVectors(focusState.fromPos, focusState.toPos, e);
  _q.slerpQuaternions(focusState.fromQuat, focusState.toQuat, e);
  camera.quaternion.copy(_q);
  if (focusState.t >= 1) {
    if (focusState.returning) { roamEnabled = true; focusState = null; }
    else { focusState = 'focused'; }
  }
});
```

- [ ] **Step 3: Hook click + Esc**

Replace the existing `canvas.addEventListener('click', ...)` from Task 3 with:
```js
canvas.addEventListener('click', () => {
  if (!controls.isLocked) { controls.lock(); return; }
  if (focusState) { unfocus(); return; }      // click again to leave focus
  raycaster.setFromCamera(_center, camera);
  const hit = raycaster.intersectObjects(artMeshes, false)[0];
  if (hit && hit.distance < 7) focusOn(hit.object);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && focusState) { unfocus(); }
});
```
Note: while focused we keep the pointer locked so look stays steady; movement is off via `roamEnabled`.

- [ ] **Step 4: Verify in browser**

Reload, enter, walk up to a painting, aim the crosshair at it, click.
Expected:
- Camera glides (~0.6s) to a straight-on close-up centered on that piece; WASD no longer moves during/after the glide.
- Clicking again (or pressing Esc) glides back to the prior roam spot and movement resumes.
- Clicking when not aimed at any nearby artwork does nothing (no errant tween).

- [ ] **Step 5: Commit**

```bash
git add js/museum.js
git commit -m "feat(museum): click-to-focus camera tween on artworks"
```

---

## Task 8: Post-processing — AO + restrained bloom + progress-gated entry

Add the EffectComposer pipeline (SSAO contact shadows + very subtle bloom on bright fixtures) and gate the "Enter" button on the initial texture batch loading.

**Files:**
- Modify: `js/museum.js`

**Interfaces:**
- Consumes: `THREE`, `renderer`, `scene`, `camera`, `frame`, `setProgress`, `showGateEnter`, `setArtTexture`, chunk/slot data
- Produces: `composer` replaces direct `renderer.render` in the loop

- [ ] **Step 1: Import post passes**

```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
```

- [ ] **Step 2: Build the composer (after camera/renderer/scene exist)**

```js
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
```

- [ ] **Step 3: Render through the composer**

Change `frame()` to render the composer instead of the renderer directly:
```js
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const fn of updaters) fn(dt);
  composer.render();
}
```
And update the resize handler to resize the composer + passes:
```js
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  ssao.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
});
```

- [ ] **Step 4: Gate "Enter" on the initial texture batch**

Replace `setArtTexture` so it reports load completion, and count the first batch. Change the body of `setArtTexture` to call an optional callback, and add a batch tracker:
```js
let _loaded = 0;
const _initialBatch = POOL * ART_PER_SIDE * 2; // both sides
function _onArtLoaded() {
  _loaded++;
  if (_loaded <= _initialBatch) setProgress(Math.min(_loaded, _initialBatch), _initialBatch);
  if (_loaded === _initialBatch) showGateEnter();
}
```
In `setArtTexture`, after `slot.picMesh.scale.set(...)` inside the load callback, add:
```js
    _onArtLoaded();
```
Also add an error handler to the `texLoader.load` call so a failed image still counts (so the gate can't hang):
```js
  texLoader.load(url, (tex) => { /* ...existing success... */ },
    undefined,
    () => { _onArtLoaded(); });
```

- [ ] **Step 5: Defer `showGateEnter()` to the batch**

In `boot()`, remove the immediate `setProgress(0, IMAGES.length); showGateEnter();` lines (the entry button now appears when the first batch finishes). Keep `buildStructure/buildFloor/buildChunks` calls; they kick off the loads that drive progress. Ensure `setProgress(0, _initialBatch)` is shown once right after `buildChunks()` so the gate isn't blank:
```js
  setProgress(0, _initialBatch);
```

- [ ] **Step 6: Verify in browser**

Reload `museum.html`.
Expected:
- The gate shows "加载中 N / M" climbing as the first artworks load, then the "进入" button appears only when the visible set is ready.
- After entering: corners/edges where wall meets floor and behind frames are gently darkened (AO contact shadows); the spotlight hotspots and fixtures have a faint bloom halo but the scene is **not** glowy/washed; blacks stay deep, highlights aren't blown (ACES).
- Resizing keeps AO/bloom correct (no stretching, no crash).

- [ ] **Step 7: Commit**

```bash
git add js/museum.js
git commit -m "feat(museum): SSAO + subtle bloom post stack, progress-gated entry"
```

---

## Task 9: main.js capability gate + WebGL-context-loss handling + docs

Route capable desktops from the Gallery nav into `museum.html`, keep the grid for everyone else, handle context loss gracefully, and document the new page.

**Files:**
- Modify: `js/main.js` (the gallery nav wiring — locate where `data-section` nav buttons call `go(...)`)
- Modify: `js/museum.js`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: existing `go(section)` + nav button wiring in `main.js`
- Produces: `isMuseumCapable()` in `main.js`; context-loss overlay in `museum.js`

- [ ] **Step 1: Find the nav click wiring in `main.js`**

Run:
```bash
grep -n "data-section\|addEventListener('click'\|go(" js/main.js
```
Expected: locate the loop that binds nav buttons (each `.nav-i` with `data-section`) to `go(btn.dataset.section)`.

- [ ] **Step 2: Add `isMuseumCapable()` near the top of `main.js`**

```js
/* Desktop capability gate for the 3D museum (mobile/unsupported → grid). */
function isMuseumCapable() {
  try {
    if (!window.matchMedia('(pointer: fine)').matches) return false;
    if (window.innerWidth < 900) return false;
    if (!('requestPointerLock' in Element.prototype)) return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2'));
  } catch { return false; }
}
```

- [ ] **Step 3: Intercept the gallery nav click**

In the nav button click handler, special-case gallery on capable devices. Wrap the existing `go(section)` call:
```js
btn.addEventListener('click', () => {
  const section = btn.dataset.section;
  if (section === 'gallery' && isMuseumCapable()) {
    location.href = 'museum.html';
    return;
  }
  go(section);
});
```
(Adapt to the exact variable names already used in that loop — keep the existing behavior for every other section, and keep `renderGallery()` as the fallback that `go('gallery')` triggers.)

- [ ] **Step 4: Add WebGL context-loss handling in `museum.js`**

After the renderer is created:
```js
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  renderer.setAnimationLoop(null);
  gate.style.display = 'flex';
  fail('渲染上下文丢失，请刷新页面。', 'Rendering context lost — please reload.', '렌더링 컨텍스트가 손실되었습니다. 새로고침하세요.');
}, false);
```

- [ ] **Step 5: Document the page in `CLAUDE.md`**

Add a section after the `mc-calc.html` section:
```markdown
## `museum.html`

Self-contained first-person 3D museum (Three.js via jsDelivr importmap, pinned
to `0.169.0`). Reads the same `images/gallery/index.json` as the grid. On the
gallery nav click, `main.js` routes capable desktops here via `isMuseumCapable()`;
mobile / touch / unsupported devices keep the existing grid + lightbox. The museum
is a fixed dark dramatic hall — it does NOT follow the night/day theme. Exit
returns to `index.html` (never `#gallery`, to avoid a relaunch loop). No shared JS
with `main.js`. Logic lives in `js/museum.js`, styling in `css/museum.css`.
```

- [ ] **Step 6: Verify in browser (desktop)**

Reload `http://localhost:8000/index.html` in a normal desktop window (width ≥ 900).
Expected: clicking "画廊 / Gallery" navigates to `museum.html` and the museum loads. The museum's ✕ / Back returns to `index.html`; pressing browser-Back from the museum lands on the site, and clicking Gallery again re-enters (no infinite loop, no stuck state).

- [ ] **Step 7: Verify in browser (mobile emulation)**

Open DevTools device toolbar, emulate a phone (touch, narrow width), reload `index.html`, click Gallery.
Expected: the existing image grid renders (no navigation to `museum.html`), lightbox still works on tap.

- [ ] **Step 8: Commit**

```bash
git add js/main.js js/museum.js CLAUDE.md
git commit -m "feat(museum): capability-gated entry from gallery nav, context-loss handling, docs"
```

---

## Task 10: Final realism pass + verification sweep

A dedicated tuning + full-spec verification task (lighting/exposure/material values are judgment calls best done once everything is on screen).

**Files:**
- Modify: `js/museum.js` (tuning constants only)

**Interfaces:**
- Consumes: everything above
- Produces: tuned constants; no new API

- [ ] **Step 1: Tune for realism (adjust these values while watching the scene)**

Candidate dials (change values, reload, judge):
- `renderer.toneMappingExposure` (try 0.9–1.2) — overall brightness without blowing highlights.
- `scene.environmentIntensity` (0.15–0.35) — reflection/ambient fill strength.
- SpotLight `intensity` (12–20), `angle`, `penumbra` — pool size + edge softness per piece.
- `mats.glass.opacity` (0.04–0.10) and `clearcoatRoughness` — strength of frame/glass glare.
- floor `overlay` `opacity`/`roughness`/`metalness` — how mirror-like vs polished the floor reads.
- `bloom.strength`/`threshold` — keep bloom subtle (fixtures only, no global glow).
- `scene.fog` near/far — depth fade down the corridor.

Document the chosen values inline with a short comment each.

- [ ] **Step 2: Full verification sweep (walk through the spec's checklist)**

Confirm each, in a desktop browser:
- [ ] Museum launches from Gallery nav on desktop; mobile emulation shows the grid.
- [ ] WASD + mouse roam; pointer lock + Esc behave; cannot clip walls or pass behind start.
- [ ] Walking forward ~1 min: art keeps appearing (recycling); framerate stable; DevTools heap not climbing.
- [ ] Each piece individually spotlit; floor reflects; frames show subtle glare; shadows soft; tone mapping filmic (no blown/crushed regions).
- [ ] Click artwork → focus close-up; Esc / second click → return to roam.
- [ ] Exit ✕ → `index.html`; browser-back from museum → site (no relaunch loop).
- [ ] Bracket-named files (`[10].png`) load correctly.
- [ ] Empty/failed `index.json` → gate error + Back button (re-test by temporarily breaking the URL, then revert).

- [ ] **Step 3: Commit**

```bash
git add js/museum.js
git commit -m "polish(museum): realism tuning pass + full verification sweep"
```

---

## Self-Review Notes (author)

- **Spec coverage:** standalone page (T1) · CDN importmap pinned (T1, Global) · capability gate + grid fallback (T9) · infinite chunk streaming/recycling (T5) · WASD/pointer-lock + clamping (T3) · ACES/sRGB/physical lights (T2) · IBL (T4) · PBR materials + frame glare glass (T4/T5) · reflective floor (T6) · per-artwork spotlights + soft shadows (T6) · SSAO + subtle bloom (T8) · loading gate + progress (T1/T8) · click-to-focus (T7) · trilingual UI (T1, Global) · exit-to-home no-loop (T3/T9) · empty-data + context-loss handling (T1/T9) · bracket filename encoding (T1, Global) · docs (T9). All spec sections map to a task.
- **No placeholders:** every code step shows full code; Task 8 Step 2 intentionally instructs deleting the placeholder line and writing the real composer — that is an explicit instruction, not a leftover TODO.
- **Type consistency:** `setArtTexture(slot, imageIndex)`, slot shape `{ pivot, picMesh, frame, glass, side, spot, spotTarget }`, `chunks[].{group,z,slots}`, `artMeshes`, `controls`, `roamEnabled`, `clampToHall`, constants (`EYE_Y`, `HALL_HALF_WIDTH`, `CEIL_Y`, `CHUNK_LEN`, `ART_PER_SIDE`, `ART_W`, `ART_H`, `ART_Y`, `POOL`) are defined once and used consistently across tasks.
