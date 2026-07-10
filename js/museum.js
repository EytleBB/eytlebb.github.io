import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
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
const artHintEl = document.getElementById('art-hint');
const titleEl = document.getElementById('title');
const hudEl = document.getElementById('hud');
const exitBtn = document.getElementById('exit-btn');

enterSub.textContent = T('一座灯光下的私人博物馆', 'A private museum under gallery light', '갤러리 조명 아래의 개인 미술관');
function controlGuideMarkup() {
  const movement = T('移动', 'Move', '이동');
  const inspect = T('端详', 'Inspect', '감상');
  const zoom = T('变焦', 'Zoom', '확대');
  const run = T('快走', 'Run', '달리기');
  const pause = T('暂停', 'Pause', '일시정지');
  return `
    <div class="guide-group movement-guide">
      <div class="guide-caption">${movement}</div>
      <div class="dpad" aria-hidden="true">
        <span class="key key-w">W</span>
        <span class="key key-a">A</span>
        <span class="key key-s">S</span>
        <span class="key key-d">D</span>
      </div>
    </div>
    <span class="guide-rule" aria-hidden="true"></span>
    <div class="guide-group mouse-guide">
      <div class="mouse-label mouse-label-left">${inspect}</div>
      <div class="mouse-shell" aria-hidden="true">
        <span class="mouse-button mouse-left"></span>
        <span class="mouse-button mouse-right"></span>
        <span class="mouse-seam"></span>
      </div>
      <div class="mouse-label mouse-label-right">${zoom}</div>
    </div>
    <span class="guide-rule" aria-hidden="true"></span>
    <div class="guide-shortcuts">
      <div class="shortcut"><span class="wide-key esc-key">Esc</span><span>${pause}</span></div>
      <div class="shortcut"><span class="wide-key shift-key">Shift</span><span>${run}</span></div>
    </div>`;
}
const controlGuide = controlGuideMarkup();
enterKeys.innerHTML = controlGuide;
enterKeys.setAttribute('aria-label', T('操作说明：WASD 移动，鼠标左键端详，鼠标右键变焦，Shift 快走，Esc 暂停',
  'Controls: WASD move, left click inspect, right click zoom, Shift run, Esc pause',
  '조작 안내: WASD 이동, 왼쪽 클릭 감상, 오른쪽 클릭 확대, Shift 달리기, Esc 일시정지'));
enterBack.textContent = T('返回主站', 'Back to site', '메인으로');
titleEl.textContent = T('画廊 — This is Eytle', 'Gallery — This is Eytle', '갤러리 — This is Eytle');
hudEl.className = 'control-guide';
hudEl.innerHTML = controlGuide;
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
let IMAGE_META = [];
const SMALL_IMAGE_BYTES = 1024 * 1024;
const GALLERY_CACHE = 'eytle-gallery-v1';
const GALLERY_PREVIEW_KEY = 'eytle-gallery-preview-v2';
const INITIAL_TEXTURE_COUNT = 40;
const STREAM_BATCH_SIZE = 20;
const TEXTURE_LOAD_CONCURRENCY = 4;
const PREFETCH_AHEAD_DISTANCE = 100;
const KEEP_BEHIND_DISTANCE = 42;
const MAX_RESIDENT_TEXTURES = 60;
const STREAM_UPDATE_INTERVAL_MS = 400;
const BATCH_RETRY_DELAY_MS = 8000;

async function loadImageList() {
  const res = await fetch('./images/gallery/index.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('index ' + res.status);
  const files = await res.json();
  if (!Array.isArray(files) || files.length === 0) throw new Error('empty');
  const urls = files.map(f => `images/gallery/${encodeURIComponent(f)}`);

  // Put the 12 homepage images first so the initial 40 reuse their disk cache.
  let homepageImages = [];
  try {
    const stored = JSON.parse(sessionStorage.getItem(GALLERY_PREVIEW_KEY) || '[]');
    if (Array.isArray(stored)) homepageImages = stored;
  } catch {}
  const available = new Set(urls);
  const prioritized = [...new Set(homepageImages)].filter(url => available.has(url));
  const prioritizedSet = new Set(prioritized);
  IMAGES = [...prioritized, ...urls.filter(url => !prioritizedSet.has(url))];
  IMAGE_META = IMAGES.map(() => null);
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
const BLOOM_LAYER = 1;
const CAMERA_FOV = 64;
const ZOOM_FOV = 28;
const ZOOM_FOV_SPEED = 78;
const ART_INTERACT_DISTANCE = 3.5;
const SPAWN_Z = 0;

const canvas = document.getElementById('scene-canvas');
const audioListener = new THREE.AudioListener();
audioListener.setMasterVolume(0);
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
  audioListener.setMasterVolume(0);
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  document.body.classList.remove('locked', 'focused');
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

const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, EYE_Y, SPAWN_Z);

// One listener follows every camera pose, including artwork focus tweens.
camera.add(audioListener);

const clock = new THREE.Clock();
const updaters = [];
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const fn of updaters) fn(dt);
  updatePictureSpotPool();
  renderGalleryFrame();
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
const bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.32,  // strength — only bloom-layer objects are rendered into this pass
  0.7,   // radius
  0.75   // threshold — safe now because artwork is never in the bloom layer
);
bloomComposer.addPass(bloom);

const finalComposer = new EffectComposer(renderer);
finalComposer.addPass(new RenderPass(scene, camera));
const bloomMixPass = new ShaderPass({
  uniforms: {
    baseTexture: { value: null },
    bloomTexture: { value: bloomComposer.renderTarget2.texture },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(baseTexture, vUv);
      vec3 bloom = texture2D(bloomTexture, vUv).rgb;
      gl_FragColor = vec4(base.rgb + bloom, base.a);
    }
  `,
}, 'baseTexture');
finalComposer.addPass(bloomMixPass);
finalComposer.addPass(new OutputPass());

function enableBloomLayer(object) {
  object.layers.enable(BLOOM_LAYER);
  return object;
}

function renderGalleryFrame() {
  camera.layers.set(BLOOM_LAYER);
  bloomComposer.render();
  camera.layers.set(0);
  finalComposer.render();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  bloomComposer.setSize(window.innerWidth, window.innerHeight);
  finalComposer.setSize(window.innerWidth, window.innerHeight);
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

function makeSpotWashTexture(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size * 0.5, size * 0.22, 0, size * 0.5, size * 0.22, size * 0.56);
  g.addColorStop(0.00, 'rgba(255,246,223,0.92)');
  g.addColorStop(0.18, 'rgba(255,238,202,0.58)');
  g.addColorStop(0.58, 'rgba(255,218,150,0.16)');
  g.addColorStop(1.00, 'rgba(255,218,150,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
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
const floorMap = loadRepeatedTexture('images/textures/gallery-carpet-celestial.png', 1, 18, THREE.SRGBColorSpace);
floorMap.wrapS = THREE.ClampToEdgeWrapping;
const floorDetail = makeNoiseTexture(512, 18);
floorDetail.wrapS = THREE.ClampToEdgeWrapping;
floorDetail.wrapT = THREE.RepeatWrapping;
floorDetail.repeat.set(1, floorMap.repeat.y);
floorDetail.anisotropy = renderer.capabilities.getMaxAnisotropy();
const trimMap = loadRepeatedTexture('images/textures/gallery-trim-vault.png', 1.55, 1.55, THREE.SRGBColorSpace);
const trimDetail = loadRepeatedTexture('images/textures/gallery-trim-vault.png', 1.55, 1.55);
const frameMap = loadRepeatedTexture('images/textures/gallery-frame-wood.png', 1.1, 1.1, THREE.SRGBColorSpace);
const frameDetail = loadRepeatedTexture('images/textures/gallery-frame-wood.png', 1.1, 1.1);
function lockFloorTextureToWorld(worldZ) {
  const offsetY = -(worldZ / FLOOR_LEN) * floorMap.repeat.y;
  floorMap.offset.y = offsetY;
  floorDetail.offset.y = offsetY;
}

function makeCarpetGeometry(width, length, xSegments = 48, zSegments = 360) {
  const geo = new THREE.PlaneGeometry(width, length, xSegments, zSegments);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const edge = Math.abs(x) / (width / 2);
    const pile = 0.0035
      + Math.sin(x * 9.7 + y * 0.31) * 0.0016
      + Math.sin(x * 23.3 - y * 0.17) * 0.0011
      + Math.sin(y * 1.9) * 0.0009;
    const flattenedEdge = THREE.MathUtils.smoothstep(edge, 0.82, 1.0);
    pos.setZ(i, pile * (1 - flattenedEdge * 0.45));
  }
  geo.computeVertexNormals();
  return geo;
}

const mats = {
  wall: new THREE.MeshStandardMaterial({ color: 0x7f8daa, roughness: 1.0, metalness: 0.0,
    map: wallMap, bumpMap: wallDetail, bumpScale: 0.012 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0x0e1626, roughness: 1.0, metalness: 0.0 }),
  endWall: new THREE.MeshStandardMaterial({ color: 0x8290ac, roughness: 1.0, metalness: 0.0,
    map: wallMap, bumpMap: wallDetail, bumpScale: 0.012 }),
  // gilt bronze fixtures — ties to the amber accent
  frame: new THREE.MeshStandardMaterial({ color: 0xb98a2a, roughness: 0.5, metalness: 0.45 }),
  pictureFrame: new THREE.MeshStandardMaterial({ color: 0xb98a2a, roughness: 0.52, metalness: 0.05,
    map: frameMap, bumpMap: frameDetail, bumpScale: 0.025 }),
  floorTexture: new THREE.MeshStandardMaterial({
    color: 0xd6d9df, roughness: 1.0, metalness: 0.0, envMapIntensity: 0.0,
    map: floorMap, bumpMap: floorDetail, bumpScale: 0.024, fog: true,
  }),
  // architectural rhythm: pilasters + moldings
  trim: new THREE.MeshStandardMaterial({ color: 0xe2e8f2, roughness: 0.82, metalness: 0.02,
    map: trimMap, bumpMap: trimDetail, bumpScale: 0.017 }),
  molding: new THREE.MeshStandardMaterial({ color: 0xf0f2f4, roughness: 0.78, metalness: 0.025,
    map: trimMap, bumpMap: trimDetail, bumpScale: 0.015 }),
  trimShadow: new THREE.MeshStandardMaterial({ color: 0x8f98aa, roughness: 0.9, metalness: 0.012,
    map: trimMap, bumpMap: trimDetail, bumpScale: 0.012 }),
  // emissive fixtures: picture lights over each piece + recessed ceiling panels
  pictureLight: new THREE.MeshStandardMaterial({
    color: 0xffedcc, emissive: 0xffd28a, emissiveIntensity: 1.35, roughness: 0.35,
    transparent: true, opacity: 0.86, toneMapped: false,
  }),
  pictureLightWash: new THREE.MeshBasicMaterial({
    color: 0xffe0a8, map: makeSpotWashTexture(), transparent: true, opacity: 0.42,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }),
  ceilPanel: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xbfd0ff, emissiveIntensity: 0.8 }),
};

/* ============================================================
   INFINITE HALL — fixed chunk pool, recycled as the player walks.
   Textures stream in batches and are released from GPU memory behind the player.
   ============================================================ */
const CHUNK_LEN = 14;
const POOL = 20;
const FLOOR_LEN = CHUNK_LEN * (POOL + 1);
const RECYCLE_BACK_BUFFER = 112;
const REAR_WALL_OFFSET = 72;
const FORWARD_VIEW_BUFFER = 170;
const ART_PER_SIDE = 2;
const ART_SPACING = CHUNK_LEN / ART_PER_SIDE;
const PILLAR_SPACING = CHUNK_LEN; // one left/right pilaster pair per chunk
const SPEAKER_PILLAR_INTERVAL = 13;
const SPEAKER_SPACING = PILLAR_SPACING * SPEAKER_PILLAR_INTERVAL;
const SPEAKER_COVERAGE_DISTANCE = SPEAKER_SPACING / 2;
const REAR_PILLAR_Z = REAR_WALL_OFFSET - CHUNK_LEN - ART_SPACING;
const FIRST_SPEAKER_Z = REAR_PILLAR_Z
  - Math.round((REAR_PILLAR_Z - SPAWN_Z) / PILLAR_SPACING) * PILLAR_SPACING;
const SPEAKER_POOL_SIZE = 4;
const SPEAKER_WALL_X = HALL_HALF_WIDTH - 0.07;
const SPEAKER_Y = 3.12;
const SPEAKER_REF_DISTANCE = 4;
const SPEAKER_EDGE_GAIN = 0.18;
const SPEAKER_ROLLOFF = 1 - SPEAKER_EDGE_GAIN;
const SPEAKER_CROSSFADE_SECONDS = 0.12;
const MUSEUM_MUSIC_VOLUME = 0.42;
const MUSEUM_MUSIC_URL = 'audio/museum.mp3';
const ART_H = 1.52;           // artwork height (width derives from aspect)
const ART_MAX_W = 2.16;       // clamp very wide images
const ART_Y = 1.75;           // centre height of artwork
const FRAME_DEPTH = 0.16;
const FRAME_ART_Z = 0.052;
const LARGE_ART_FRAME_DEPTH = 0.085;
const LARGE_ART_FRAME_ART_Z = 0.03;
const LARGE_ART_SCALE_THRESHOLD = 0.95;
const LARGE_ART_LAMP_SCALE = 0.6;
const LARGE_ART_LAMP_ARM_REACH = 1.08;
const LARGE_ART_WALL_AIM_OFFSET = 0.08;
const LARGE_ART_LAMP_Y_OFFSET = -0.32;
const LIGHT_WASH_WIDTH = 0.86;
const LIGHT_WASH_HEIGHT = 1.42;
const LIGHT_FIXTURES_PER_SLOT = 2;
const MAX_REAL_SPOT_LIGHTS = THREE.MathUtils.clamp(
  Math.floor(((renderer.capabilities.maxFragmentUniforms || 1024) - 384) / 8),
  24,
  64,
);

const texLoader = new THREE.TextureLoader();
const texCache = [];          // one THREE.Texture (or null) per IMAGES entry
const textureLoads = [];
const textureLastUsed = [];
const streamBatchQueue = [];
const queuedBatchStarts = new Set();
const batchLastAttempt = [];
const artMeshes = [];         // pickable picture meshes for raycasting
const pictureLightFixtures = [];
const pictureSpotPool = [];
const chunks = [];
const speakerRigs = [];
let floorRig = null;
let rearWall = null;
let nextImageIndex = 0;
let streamBatchWorkerActive = false;
let lastStreamUpdate = 0;

/* ---- synchronized spatial music ---- */
const speakerCabinetGeo = new THREE.BoxGeometry(0.32, 0.46, 0.16);
const speakerGrilleGeo = new THREE.PlaneGeometry(0.255, 0.385);
const speakerWooferGeo = new THREE.CircleGeometry(0.088, 24);
const speakerTweeterGeo = new THREE.CircleGeometry(0.036, 20);
const speakerCabinetMat = new THREE.MeshStandardMaterial({
  color: 0x171b22, roughness: 0.72, metalness: 0.18,
});
const speakerGrilleMat = new THREE.MeshStandardMaterial({
  color: 0x080a0d, roughness: 0.92, metalness: 0.08,
});
const speakerDriverMat = new THREE.MeshStandardMaterial({
  color: 0x242a33, roughness: 0.66, metalness: 0.22,
});

const museumTrack = document.createElement('audio');
museumTrack.crossOrigin = 'anonymous';
museumTrack.preload = 'none';
museumTrack.loop = true;
museumTrack.playsInline = true;
museumTrack.src = MUSEUM_MUSIC_URL;
museumTrack.addEventListener('error', () => reportMuseumTrackFailure(museumTrack.error));
let museumTrackNode = null;
let museumTrackStarting = false;
let museumTrackWarningShown = false;

function speakerZForIndex(index) {
  return FIRST_SPEAKER_Z - index * SPEAKER_SPACING;
}

function nearestSpeakerIndexForZ(z) {
  return Math.max(0, Math.round((FIRST_SPEAKER_Z - z) / SPEAKER_SPACING));
}

function setSpeakerRigIndex(rig, index) {
  const side = index % 2 === 0 ? 1 : -1;
  rig.index = index;
  rig.group.position.set(side * SPEAKER_WALL_X, SPEAKER_Y, speakerZForIndex(index));
  rig.group.rotation.y = -side * Math.PI / 2;
}

function rampSpeakerVolume(sound, volume) {
  const gain = sound.gain.gain;
  const now = audioListener.context.currentTime;
  if (typeof gain.cancelAndHoldAtTime === 'function') {
    gain.cancelAndHoldAtTime(now);
  } else {
    const current = gain.value;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(current, now);
  }
  gain.linearRampToValueAtTime(volume, now + SPEAKER_CROSSFADE_SECONDS);
}

function makeSpeakerRig() {
  const group = new THREE.Group();

  const cabinet = new THREE.Mesh(speakerCabinetGeo, speakerCabinetMat);
  cabinet.castShadow = true;
  group.add(cabinet);

  const grille = new THREE.Mesh(speakerGrilleGeo, speakerGrilleMat);
  grille.position.z = 0.081;
  group.add(grille);

  const woofer = new THREE.Mesh(speakerWooferGeo, speakerDriverMat);
  woofer.position.set(0, -0.075, 0.083);
  group.add(woofer);

  const tweeter = new THREE.Mesh(speakerTweeterGeo, speakerDriverMat);
  tweeter.position.set(0, 0.112, 0.083);
  group.add(tweeter);

  const sound = new THREE.PositionalAudio(audioListener);
  sound.panner.panningModel = 'HRTF';
  sound.setDistanceModel('linear');
  sound.setRefDistance(SPEAKER_REF_DISTANCE);
  sound.setMaxDistance(SPEAKER_COVERAGE_DISTANCE);
  sound.setRolloffFactor(SPEAKER_ROLLOFF);
  sound.setVolume(0);
  sound.position.z = 0.1;
  group.add(sound);

  scene.add(group);
  return { group, sound, index: null, active: false };
}

function updateSpeakerPool() {
  if (speakerRigs.length === 0) return;

  const nearestIndex = nearestSpeakerIndexForZ(camera.position.z);
  const firstIndex = Math.max(0, nearestIndex - 1);
  const desiredIndices = Array.from({ length: SPEAKER_POOL_SIZE }, (_, i) => firstIndex + i);
  const desiredSet = new Set(desiredIndices);
  const reusableRigs = speakerRigs.filter(rig => !desiredSet.has(rig.index));

  for (const index of desiredIndices) {
    if (speakerRigs.some(rig => rig.index === index)) continue;
    const rig = reusableRigs.shift();
    if (rig) setSpeakerRigIndex(rig, index);
  }

  // Coverage is measured along the pillar grid. The panner adds natural 3D
  // attenuation inside that cell; its non-zero edge gain avoids a silent seam.
  const nearestDistance = Math.abs(camera.position.z - speakerZForIndex(nearestIndex));
  const activeIndex = nearestDistance <= SPEAKER_COVERAGE_DISTANCE ? nearestIndex : null;
  for (const rig of speakerRigs) {
    const active = rig.index === activeIndex;
    if (rig.active === active) continue;
    rig.active = active;
    rampSpeakerVolume(rig.sound, active ? MUSEUM_MUSIC_VOLUME : 0);
  }
}

function buildSpeakerPool() {
  if (speakerRigs.length > 0) return;
  for (let i = 0; i < SPEAKER_POOL_SIZE; i++) speakerRigs.push(makeSpeakerRig());
  updateSpeakerPool();
}

function reportMuseumTrackFailure(error) {
  if (museumTrackWarningShown) return;
  museumTrackWarningShown = true;
  console.info(`Museum music is unavailable. Add the MP3 at ${MUSEUM_MUSIC_URL}.`, error);
}

function connectMuseumTrack() {
  if (museumTrackNode) return;
  museumTrackNode = audioListener.context.createMediaElementSource(museumTrack);
  for (const rig of speakerRigs) rig.sound.setNodeSource(museumTrackNode);
}

function startMuseumTrack() {
  let resumePromise;
  try {
    resumePromise = audioListener.context.resume();
  } catch (error) {
    reportMuseumTrackFailure(error);
    return;
  }
  if (museumTrackStarting || !museumTrack.paused) {
    if (resumePromise) resumePromise.catch(reportMuseumTrackFailure);
    return;
  }
  museumTrackStarting = true;
  try {
    connectMuseumTrack();
    const playPromise = museumTrack.play();
    Promise.all([resumePromise, playPromise].filter(Boolean))
      .catch(reportMuseumTrackFailure)
      .finally(() => { museumTrackStarting = false; });
  } catch (error) {
    museumTrackStarting = false;
    reportMuseumTrackFailure(error);
  }
}

function frameMetricsForScale(scale) {
  if (scale >= LARGE_ART_SCALE_THRESHOLD) {
    return { depth: LARGE_ART_FRAME_DEPTH, artZ: LARGE_ART_FRAME_ART_Z };
  }
  return { depth: FRAME_DEPTH, artZ: FRAME_ART_Z };
}

function frameXForSide(side, metrics) {
  return side * HALL_HALF_WIDTH + (-side) * (metrics.depth / 2 - 0.012);
}

function pictureXForFrame(side, frameX, metrics) {
  return frameX + (-side) * metrics.artZ;
}

function clearPictureFrame(frame) {
  for (const child of frame.children) {
    if (child.geometry) child.geometry.dispose();
  }
  frame.clear();
}

function makeTieredFrameGeometry(outerW, outerH, insetOuterW, insetOuterH, openingW, openingH, metrics) {
  const outerFrontZ = metrics.depth * 0.575;
  const insetFrontZ = metrics.artZ + 0.012;
  const backZ = -Math.max(metrics.depth * 0.34, 0.026);
  const positions = [];
  const normals = [];
  const uvs = [];

  function uvForPoint(p, normal) {
    const ax = Math.abs(normal[0]);
    const ay = Math.abs(normal[1]);
    const az = Math.abs(normal[2]);
    if (az >= ax && az >= ay) return [p[0] * 0.55 + 0.5, p[1] * 0.55 + 0.5];
    if (ax >= ay) return [p[1] * 0.55 + 0.5, p[2] * 3.2 + 0.5];
    return [p[0] * 0.55 + 0.5, p[2] * 3.2 + 0.5];
  }

  function addTriangle(a, b, c) {
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = ab.cross(ac).normalize().toArray();
    for (const p of [a, b, c]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0], n[1], n[2]);
      uvs.push(...uvForPoint(p, n));
    }
  }

  function addQuad(a, b, c, d) {
    addTriangle(a, b, c);
    addTriangle(a, c, d);
  }

  function addFlatRing(ow, oh, iw, ih, z) {
    const ox = ow / 2, oy = oh / 2, ix = iw / 2, iy = ih / 2;
    addQuad([-ox, iy, z], [ox, iy, z], [ox, oy, z], [-ox, oy, z]);
    addQuad([-ox, -oy, z], [ox, -oy, z], [ox, -iy, z], [-ox, -iy, z]);
    addQuad([-ox, -iy, z], [-ix, -iy, z], [-ix, iy, z], [-ox, iy, z]);
    addQuad([ix, -iy, z], [ox, -iy, z], [ox, iy, z], [ix, iy, z]);
  }

  function addBoundaryWalls(w, h, z0, z1, outward) {
    const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
    if (outward) {
      addQuad([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]);
      addQuad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
      addQuad([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]);
      addQuad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
      return;
    }
    addQuad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]);
    addQuad([x1, y0, z0], [x0, y0, z0], [x0, y0, z1], [x1, y0, z1]);
    addQuad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]);
    addQuad([x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1]);
  }

  addFlatRing(outerW, outerH, insetOuterW, insetOuterH, outerFrontZ);
  addFlatRing(insetOuterW, insetOuterH, openingW, openingH, insetFrontZ);
  addBoundaryWalls(outerW, outerH, backZ, outerFrontZ, true);
  addBoundaryWalls(insetOuterW, insetOuterH, insetFrontZ, outerFrontZ, false);
  addBoundaryWalls(openingW, openingH, backZ, insetFrontZ, false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function resizePictureFrame(frame, artW, artH, metrics = frameMetricsForScale(0)) {
  clearPictureFrame(frame);
  const border = THREE.MathUtils.clamp(artH * 0.11, 0.105, 0.18);
  const inset = Math.max(border * 0.34, 0.046);
  const outerBand = Math.max(border - inset, 0.07);
  const artOverlap = THREE.MathUtils.clamp(Math.min(artW, artH) * 0.018, 0.01, 0.026);
  const innerOuterW = artW + inset * 2;
  const innerOuterH = artH + inset * 2;
  const outerW = innerOuterW + outerBand * 2;
  const outerH = innerOuterH + outerBand * 2;
  const openingW = Math.max(artW - artOverlap * 2, artW * 0.92);
  const openingH = Math.max(artH - artOverlap * 2, artH * 0.92);
  const mesh = new THREE.Mesh(
    makeTieredFrameGeometry(outerW, outerH, innerOuterW, innerOuterH, openingW, openingH, metrics),
    mats.pictureFrame,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  frame.add(mesh);
}

function makePictureFrame(x, y, z, ry) {
  const frame = new THREE.Group();
  frame.position.set(x, y, z);
  frame.rotation.y = ry;
  resizePictureFrame(frame, 2, ART_H, frameMetricsForScale(0));
  return frame;
}

async function normalizeImageBlobType(blob) {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const isWebP = bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (isWebP && blob.type !== 'image/webp') return new Blob([blob], { type: 'image/webp' });
  return blob;
}

async function galleryImageSource(url, imageIndex) {
  if (!('caches' in window)) return { url, objectUrl: null };
  try {
    const cache = await caches.open(GALLERY_CACHE);
    let response = await cache.match(url);
    if (!response) {
      response = await fetch(url);
      if (!response.ok) return { url, objectUrl: null };
      void cache.put(url, response.clone()).catch(() => {});
    }
    const blob = await normalizeImageBlobType(await response.blob());
    IMAGE_META[imageIndex] = {
      byteSize: blob.size,
      scale: blob.size <= SMALL_IMAGE_BYTES ? 0.5 : 1,
    };
    const objectUrl = URL.createObjectURL(blob);
    return { url: objectUrl, objectUrl };
  } catch {
    return { url, objectUrl: null };
  }
}

function loadTexture(i) {
  if (texCache[i]) return Promise.resolve(texCache[i]);
  if (textureLoads[i]) return textureLoads[i];
  const promise = galleryImageSource(IMAGES[i], i).then(source => new Promise((resolve) => {
    const finish = (value) => {
      if (source.objectUrl) URL.revokeObjectURL(source.objectUrl);
      resolve(value);
    };
    texLoader.load(source.url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texCache[i] = tex;
      textureLastUsed[i] = performance.now();
      if (typeof renderer.initTexture === 'function') renderer.initTexture(tex);
      finish(tex);
    }, undefined, () => { texCache[i] = null; finish(null); });
  })).finally(() => {
    if (textureLoads[i] === promise) textureLoads[i] = null;
  });
  textureLoads[i] = promise;
  return promise;
}

async function loadTextureIndices(indices, onProgress) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < indices.length) {
      const imageIndex = indices[cursor++];
      await loadTexture(imageIndex);
      if (onProgress) onProgress();
    }
  };
  const workerCount = Math.min(TEXTURE_LOAD_CONCURRENCY, indices.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
}

function preloadInitialTextures(onProgress) {
  const count = Math.min(INITIAL_TEXTURE_COUNT, IMAGES.length);
  const indices = Array.from({ length: count }, (_, i) => i);
  return loadTextureIndices(indices, onProgress);
}

function fitArtwork(pic, frame, tex, imageIndex) {
  if (!tex || !tex.image) return;
  const ar = tex.image.width / tex.image.height;
  const scale = IMAGE_META[imageIndex % IMAGE_META.length]?.scale ?? 1;
  const metrics = frameMetricsForScale(scale);
  let h = ART_H * scale, w = h * ar;
  const maxW = ART_MAX_W * scale;
  if (w > maxW) { w = maxW; h = w / ar; }
  pic.geometry.dispose();
  pic.geometry = new THREE.PlaneGeometry(w, h);
  resizePictureFrame(frame, w, h, metrics);
  if (pic.userData.slot) {
    const slot = pic.userData.slot;
    slot.artScale = scale;
    const frameX = frameXForSide(slot.side, metrics);
    slot.frame.position.x = frameX;
    slot.pic.position.x = pictureXForFrame(slot.side, frameX, metrics);
    resizePictureLight(slot, w, h);
  }
}

function showArtworkTexture(slot, tex, imageIndex) {
  slot.pic.material.map = tex;
  slot.pic.material.color.setHex(0xffffff);
  slot.pic.material.needsUpdate = true;
  textureLastUsed[imageIndex] = performance.now();
  fitArtwork(slot.pic, slot.frame, tex, imageIndex);
}

function showArtworkPlaceholder(slot) {
  slot.pic.material.map = null;
  slot.pic.material.color.setHex(0x263248);
  slot.pic.material.needsUpdate = true;
}

function setArtTexture(slot, imageIndex) {
  const cacheIndex = imageIndex % IMAGES.length;
  slot.imageIndex = cacheIndex;
  const tex = texCache[cacheIndex];
  if (tex) showArtworkTexture(slot, tex, cacheIndex);
  else showArtworkPlaceholder(slot);
}

function pictureLightY(artH) {
  return Math.min(ART_Y + artH / 2 + 1.05, VAULT_SPRING_Y - 0.32);
}

function makeArtwork(parent, side, localZ, imageIndex) {
  const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  const metrics = frameMetricsForScale(0);
  const frameX = frameXForSide(side, metrics);
  const picX = pictureXForFrame(side, frameX, metrics);

  const frame = makePictureFrame(frameX, ART_Y, localZ, ry);
  parent.add(frame);

  const pic = new THREE.Mesh(
    new THREE.PlaneGeometry(2, ART_H),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.0 }));
  pic.position.set(picX, ART_Y, localZ);
  pic.rotation.y = ry;
  pic.userData.pickable = true;
  parent.add(pic);
  artMeshes.push(pic);

  const slot = { pic, frame, parent, side, fixtures: [], artScale: 1 };
  pic.userData.slot = slot;
  slot.artScale = 0.5;
  resizePictureLight(slot, 2, ART_H);
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

function makePictureLight(parent, side) {
  const group = new THREE.Group();
  parent.add(group);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, LAMP_BASE_DEPTH, 20), mats.frame);
  group.add(base);

  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3(0, 0.001, 0);
  const armA = makeRod(p0, p1, 0.016, mats.frame);
  const armB = makeRod(p0, p1, 0.016, mats.frame);
  group.add(armA, armB);

  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 10), mats.frame);
  group.add(knuckle);

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.22, 24), mats.frame);
  group.add(head);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.01, 8, 24), mats.frame);
  group.add(rim);

  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.068, 24), mats.pictureLight);
  enableBloomLayer(lens);
  group.add(lens);

  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.082, 24), mats.pictureLight);
  enableBloomLayer(glow);
  group.add(glow);

  const wash = new THREE.Mesh(new THREE.PlaneGeometry(LIGHT_WASH_WIDTH, LIGHT_WASH_HEIGHT), mats.pictureLightWash);
  wash.renderOrder = 6;
  group.add(wash);

  const fixture = {
    group, base, armA, armB, knuckle, glow, lens, head, rim, wash, parent, side, size: 1,
    lightActive: false,
    lightLocalPosition: new THREE.Vector3(),
    targetLocalPosition: new THREE.Vector3(),
    worldLightPosition: new THREE.Vector3(),
    worldTargetPosition: new THREE.Vector3(),
    spotIntensity: 0,
    spotDistance: 0.01,
    spotAngle: Math.PI / 6.5,
    spotPenumbra: 0.5,
    spotDecay: 2,
    distanceSq: Infinity,
  };
  pictureLightFixtures.push(fixture);
  return fixture;
}

function ensurePictureSpotPool() {
  while (pictureSpotPool.length < MAX_REAL_SPOT_LIGHTS) {
    const spot = new THREE.SpotLight(0xffe9c8, 0, 0.01, Math.PI / 6.5, 0.5, 2);
    const target = new THREE.Object3D();
    spot.target = target;
    spot.castShadow = false;
    spot.visible = true; // keep the shader light count stable: the pool size is the hard cap.
    scene.add(spot, target);
    pictureSpotPool.push({ spot, target });
  }
}

function updatePictureSpotPool() {
  ensurePictureSpotPool();
  const activeFixtures = [];
  camera.updateMatrixWorld();

  for (const fixture of pictureLightFixtures) {
    if (!fixture.lightActive || !fixture.group.visible) continue;
    fixture.parent.updateWorldMatrix(true, false);
    fixture.worldLightPosition.copy(fixture.lightLocalPosition);
    fixture.parent.localToWorld(fixture.worldLightPosition);
    fixture.worldTargetPosition.copy(fixture.targetLocalPosition);
    fixture.parent.localToWorld(fixture.worldTargetPosition);
    fixture.distanceSq = fixture.worldLightPosition.distanceToSquared(camera.position);
    activeFixtures.push(fixture);
  }
  activeFixtures.sort((a, b) => a.distanceSq - b.distanceSq);

  for (let i = 0; i < pictureSpotPool.length; i++) {
    const pooled = pictureSpotPool[i];
    const fixture = activeFixtures[i];
    if (!fixture) {
      pooled.spot.intensity = 0;
      pooled.spot.distance = 0.01;
      pooled.spot.position.copy(camera.position);
      pooled.target.position.set(camera.position.x, camera.position.y, camera.position.z - 1);
      continue;
    }
    pooled.spot.intensity = fixture.spotIntensity;
    pooled.spot.distance = fixture.spotDistance;
    pooled.spot.angle = fixture.spotAngle;
    pooled.spot.penumbra = fixture.spotPenumbra;
    pooled.spot.decay = fixture.spotDecay;
    pooled.spot.position.copy(fixture.worldLightPosition);
    pooled.target.position.copy(fixture.worldTargetPosition);
  }
}

function desiredPictureLightCount(slot) {
  return slot.artScale >= LARGE_ART_SCALE_THRESHOLD ? 2 : 1;
}

function pictureLightOffsets(artW, count) {
  if (count <= 1) return [0];
  const spacing = THREE.MathUtils.clamp(artW * 0.46, 0.38, 1.02);
  return [-spacing / 2, spacing / 2];
}

function ensurePictureLightFixtures(slot) {
  while (slot.fixtures.length < LIGHT_FIXTURES_PER_SLOT) {
    slot.fixtures.push(makePictureLight(slot.parent, slot.side));
  }
}

function setFixtureModelScale(fixture, scale) {
  fixture.size = scale;
  fixture.base.scale.setScalar(scale);
  fixture.knuckle.scale.setScalar(scale);
  fixture.head.scale.setScalar(scale);
  fixture.rim.scale.setScalar(scale);
  fixture.lens.scale.setScalar(scale);
  fixture.glow.scale.setScalar(scale);
}

function configurePictureSpot(fixture, count, active) {
  fixture.lightActive = active;
  if (!active) {
    fixture.spotIntensity = 0;
    fixture.spotDistance = 0.01;
    fixture.spotAngle = Math.PI / 6.5;
    fixture.spotPenumbra = 0.5;
    fixture.spotDecay = 2;
    return;
  }
  if (count > 1) {
    fixture.spotIntensity = 22;
    fixture.spotDistance = 8.5;
    fixture.spotAngle = Math.PI / 6.0;
    fixture.spotPenumbra = 0.62;
    fixture.spotDecay = 2;
    return;
  }
  fixture.spotIntensity = 34;
  fixture.spotDistance = 9;
  fixture.spotAngle = Math.PI / 6.5;
  fixture.spotPenumbra = 0.5;
  fixture.spotDecay = 2;
}

function positionPictureLightFixture(slot, fixture, artH, zOffset, count, active) {
  const y = pictureLightY(artH) + (count > 1 ? LARGE_ART_LAMP_Y_OFFSET : 0);
  const x = slot.frame.position.x;
  const targetX = slot.pic.position.x;
  const z = slot.frame.position.z + zOffset;
  const side = fixture.side;
  const size = count > 1 ? LARGE_ART_LAMP_SCALE : 1;
  const armReach = count > 1 ? LARGE_ART_LAMP_ARM_REACH : size;
  const targetWallBias = count > 1 ? side * LARGE_ART_WALL_AIM_OFFSET : 0;
  const inward = new THREE.Vector3(-side, 0, 0);
  const wallSurfaceX = side * HALL_HALF_WIDTH;
  const baseDepth = LAMP_BASE_DEPTH * size;
  const wallPoint = new THREE.Vector3(wallSurfaceX + inward.x * (baseDepth / 2), y, z);
  const armRootOffset = count > 1 ? baseDepth / 2 : 0.03 * size;
  const jointPoint = new THREE.Vector3(x + (-side) * 0.14 * armReach, y - 0.02 * size, z);
  const headPoint = new THREE.Vector3(x + (-side) * 0.32 * armReach, y - 0.055 * size, z);
  const targetPoint = new THREE.Vector3(targetX + targetWallBias, ART_Y + 0.1, slot.frame.position.z + zOffset * 0.9);
  const aimDir = targetPoint.clone().sub(headPoint).normalize();

  fixture.group.visible = active;
  setFixtureModelScale(fixture, size);
  configurePictureSpot(fixture, count, active);
  fixture.lightLocalPosition.copy(headPoint);
  fixture.targetLocalPosition.copy(targetPoint);
  fixture.base.position.copy(wallPoint);
  alignObjectToVector(fixture.base, new THREE.Vector3(0, 1, 0), inward);
  updateRod(fixture.armA, wallPoint.clone().addScaledVector(inward, armRootOffset), jointPoint);
  updateRod(fixture.armB, jointPoint, headPoint);
  fixture.knuckle.position.copy(jointPoint);
  fixture.head.position.copy(headPoint);
  alignObjectToVector(fixture.head, new THREE.Vector3(0, 1, 0), aimDir);
  fixture.rim.position.copy(headPoint).addScaledVector(aimDir, 0.125 * size);
  alignObjectToVector(fixture.rim, new THREE.Vector3(0, 0, 1), aimDir);
  fixture.lens.position.copy(headPoint).addScaledVector(aimDir, 0.132 * size);
  alignObjectToVector(fixture.lens, new THREE.Vector3(0, 0, 1), aimDir);
  fixture.glow.position.copy(headPoint).addScaledVector(aimDir, 0.138 * size);
  alignObjectToVector(fixture.glow, new THREE.Vector3(0, 0, 1), aimDir);
  fixture.wash.visible = active;
  fixture.wash.position.set(wallSurfaceX + inward.x * 0.014, targetPoint.y, targetPoint.z);
  fixture.wash.rotation.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
  fixture.wash.scale.set(
    count > 1 ? 0.68 : 1,
    THREE.MathUtils.clamp((artH / ART_H) * (count > 1 ? 0.92 : 1), 0.5, 1.1),
    1,
  );
}

function resizePictureLight(slot, artW, artH) {
  const count = desiredPictureLightCount(slot);
  ensurePictureLightFixtures(slot);
  const offsets = pictureLightOffsets(artW, count);
  for (let i = 0; i < slot.fixtures.length; i++) {
    positionPictureLightFixture(slot, slot.fixtures[i], artH, offsets[i] || 0, count, i < count);
  }
}

function wallMountedX(side, depth, overlap = 0.006) {
  return side * HALL_HALF_WIDTH + (-side) * (depth / 2 - overlap);
}

function addTrimBox(parent, side, depth, height, widthZ, y, z, material = mats.trim) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(depth, height, widthZ), material);
  mesh.position.set(wallMountedX(side, depth), y, z);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makePilaster(parent, side, z) {
  const baseH = 0.18;
  const capH = 0.18;
  const shaftBottom = baseH;
  const shaftTop = WALL_HEIGHT - capH - 0.05;
  const shaftH = Math.max(0.4, shaftTop - shaftBottom);
  const shaftY = shaftBottom + shaftH / 2;

  addTrimBox(parent, side, 0.24, baseH, 0.54, baseH / 2, z, mats.molding);
  addTrimBox(parent, side, 0.255, 0.05, 0.5, baseH + 0.025, z, mats.trimShadow);
  addTrimBox(parent, side, 0.18, shaftH, 0.36, shaftY, z, mats.trim);
  addTrimBox(parent, side, 0.24, shaftH - 0.28, 0.18, shaftY, z, mats.molding);
  addTrimBox(parent, side, 0.21, shaftH, 0.055, shaftY, z - 0.17, mats.trimShadow);
  addTrimBox(parent, side, 0.21, shaftH, 0.055, shaftY, z + 0.17, mats.trimShadow);
  addTrimBox(parent, side, 0.26, capH, 0.58, WALL_HEIGHT - capH / 2 - 0.04, z, mats.molding);
  addTrimBox(parent, side, 0.18, 0.055, 0.46, WALL_HEIGHT - capH - 0.11, z, mats.trimShadow);
}

function makeCrownBeam(parent, side) {
  const z = -CHUNK_LEN / 2;
  const y = VAULT_SPRING_Y - 0.03;
  addTrimBox(parent, side, 0.18, 0.13, CHUNK_LEN, y, z, mats.molding);
  addTrimBox(parent, side, 0.13, 0.045, CHUNK_LEN, y + 0.09, z, mats.trim);
  addTrimBox(parent, side, 0.25, 0.055, CHUNK_LEN, y - 0.095, z, mats.trimShadow);
  addTrimBox(parent, side, 0.11, 0.035, CHUNK_LEN, y - 0.155, z, mats.molding);
}

function makeBaseboard(parent, side) {
  const z = -CHUNK_LEN / 2;
  addTrimBox(parent, side, 0.12, 0.105, CHUNK_LEN, 0.052, z, mats.trimShadow);
  addTrimBox(parent, side, 0.095, 0.13, CHUNK_LEN, 0.125, z, mats.trim);
  addTrimBox(parent, side, 0.14, 0.04, CHUNK_LEN, 0.205, z, mats.molding);
  addTrimBox(parent, side, 0.08, 0.028, CHUNK_LEN, 0.238, z, mats.trimShadow);
}

function makeRearBaseboard(parent, width) {
  const depth = 0.12;
  const overlap = 0.006;
  const pieces = [
    { h: 0.105, y: 0.052, d: 0.12, mat: mats.trimShadow },
    { h: 0.13, y: 0.125, d: 0.095, mat: mats.trim },
    { h: 0.04, y: 0.205, d: 0.14, mat: mats.molding },
    { h: 0.028, y: 0.238, d: 0.08, mat: mats.trimShadow },
  ];
  for (const p of pieces) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, p.h, p.d), p.mat);
    mesh.position.set(0, p.y, -(p.d / 2 - overlap));
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
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

    makeBaseboard(group, side);
    makeCrownBeam(group, side);

    for (let k = 1; k < ART_PER_SIDE; k++) {
      const pz = -(k * ART_SPACING);
      makePilaster(group, side, pz);
    }
  }

  const rand = seededRandom(Math.round((z + 1000) * 97));
  const starCount = 59;
  const stars = new THREE.InstancedMesh(starGeo, mats.ceilPanel, starCount);
  enableBloomLayer(stars);
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
  const fgeo = makeCarpetGeometry(width, FLOOR_LEN);
  const textureLayer = new THREE.Mesh(fgeo, mats.floorTexture);
  textureLayer.renderOrder = 10;
  textureLayer.rotation.x = -Math.PI / 2;
  textureLayer.position.set(0, 0, 0);
  textureLayer.receiveShadow = true;
  group.add(textureLayer);
  scene.add(group);
  floorRig = group;
}

function buildRearWall() {
  const group = new THREE.Group();
  const width = HALL_HALF_WIDTH * 2;
  const wall = new THREE.Mesh(makeArchedEndWallGeometry(width), mats.endWall);
  wall.rotation.y = Math.PI;
  group.add(wall);
  makeRearBaseboard(group, width);

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
  ensurePictureSpotPool();
  buildMovingFloor();
  for (let i = 0; i < POOL; i++) {
    const chunk = makeChunk(REAR_WALL_OFFSET - (i + 1) * CHUNK_LEN, nextImageIndex);
    nextImageIndex += chunk.slots.length;
    chunks.push(chunk);
  }
  buildSpeakerPool();
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

const artWorldPos = new THREE.Vector3();
function batchIndicesFor(imageIndex) {
  const start = Math.floor(imageIndex / STREAM_BATCH_SIZE) * STREAM_BATCH_SIZE;
  const end = Math.min(start + STREAM_BATCH_SIZE, IMAGES.length);
  return { start, indices: Array.from({ length: end - start }, (_, i) => start + i) };
}

function refreshArtworkSlots(indices) {
  for (const chunk of chunks) {
    for (const slot of chunk.slots) {
      if (!indices.has(slot.imageIndex)) continue;
      const tex = texCache[slot.imageIndex];
      if (tex) showArtworkTexture(slot, tex, slot.imageIndex);
    }
  }
}

function protectedTextureIndices() {
  const protectedIndices = new Set();
  for (const chunk of chunks) {
    for (const slot of chunk.slots) {
      slot.pic.getWorldPosition(artWorldPos);
      const ahead = camera.position.z - artWorldPos.z;
      if (ahead >= -KEEP_BEHIND_DISTANCE && ahead <= PREFETCH_AHEAD_DISTANCE) {
        protectedIndices.add(slot.imageIndex);
      }
    }
  }
  return protectedIndices;
}

function evictDistantTextures() {
  const residents = texCache
    .map((tex, i) => tex ? i : -1)
    .filter(i => i >= 0);
  if (residents.length <= MAX_RESIDENT_TEXTURES) return;

  const protectedIndices = protectedTextureIndices();
  const candidates = residents
    .filter(i => !protectedIndices.has(i) && !textureLoads[i])
    .sort((a, b) => (textureLastUsed[a] || 0) - (textureLastUsed[b] || 0));
  const removeCount = Math.min(residents.length - MAX_RESIDENT_TEXTURES, candidates.length);

  for (let n = 0; n < removeCount; n++) {
    const imageIndex = candidates[n];
    const texture = texCache[imageIndex];
    for (const chunk of chunks) {
      for (const slot of chunk.slots) {
        if (slot.pic.material.map === texture) showArtworkPlaceholder(slot);
      }
    }
    texture.dispose();
    texCache[imageIndex] = null;
    textureLastUsed[imageIndex] = 0;
  }
}

async function drainStreamBatchQueue() {
  if (streamBatchWorkerActive) return;
  streamBatchWorkerActive = true;
  try {
    while (streamBatchQueue.length) {
      const { start, indices } = streamBatchQueue.shift();
      try {
        batchLastAttempt[start] = Date.now();
        const missing = indices.filter(i => !texCache[i] && !textureLoads[i]);
        await loadTextureIndices(missing);
        refreshArtworkSlots(new Set(indices));
        evictDistantTextures();
      } finally {
        queuedBatchStarts.delete(start);
      }
    }
  } finally {
    streamBatchWorkerActive = false;
  }
}

function queueTextureBatch(imageIndex) {
  const { start, indices } = batchIndicesFor(imageIndex);
  if (!indices.some(i => !texCache[i])) return;
  if (queuedBatchStarts.has(start)) return;
  if (Date.now() - (batchLastAttempt[start] || 0) < BATCH_RETRY_DELAY_MS) return;
  queuedBatchStarts.add(start);
  streamBatchQueue.push({ start, indices });
  void drainStreamBatchQueue();
}

function updateTextureStreaming() {
  if (!entered) return;
  const now = performance.now();
  if (now - lastStreamUpdate < STREAM_UPDATE_INTERVAL_MS) return;
  lastStreamUpdate = now;

  for (const chunk of chunks) {
    for (const slot of chunk.slots) {
      slot.pic.getWorldPosition(artWorldPos);
      const ahead = camera.position.z - artWorldPos.z;
      if (ahead < -KEEP_BEHIND_DISTANCE || ahead > PREFETCH_AHEAD_DISTANCE) continue;
      const tex = texCache[slot.imageIndex];
      if (tex) {
        textureLastUsed[slot.imageIndex] = now;
        if (slot.pic.material.map !== tex) showArtworkTexture(slot, tex, slot.imageIndex);
      } else {
        queueTextureBatch(slot.imageIndex);
      }
    }
  }
  evictDistantTextures();
}

function getRearWallZ() {
  return rearWall ? rearWall.position.z : REAR_WALL_OFFSET;
}

async function prewarmScene() {
  recycleChunks();
  updatePictureSpotPool();
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
    updatePictureSpotPool();
    renderGalleryFrame();
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
let zoomHeld = false;
const isLocked = () => document.pointerLockElement === canvas;

function syncMuseumAudioState() {
  const audible = entered && isLocked() && !document.hidden;
  audioListener.setMasterVolume(audible ? 1 : 0);
}

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

function setZoomHeld(active) {
  zoomHeld = Boolean(active && isLocked() && !focusState);
}

updaters.push((dt) => {
  const targetFov = zoomHeld && !focusState ? ZOOM_FOV : CAMERA_FOV;
  const nextFov = approachScalar(camera.fov, targetFov, ZOOM_FOV_SPEED * dt);
  if (Math.abs(nextFov - camera.fov) < 0.001) return;
  camera.fov = nextFov;
  camera.updateProjectionMatrix();
});

updaters.push((dt) => {
  recycleChunks();
  updateTextureStreaming();

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

raycaster.far = ART_INTERACT_DISTANCE;

function getAimedArtworkHit() {
  raycaster.setFromCamera(_center, camera);
  return raycaster.intersectObjects(artMeshes, false)[0] || null;
}

function setArtHintVisible(visible) {
  artHintEl.classList.toggle('show', Boolean(visible));
}

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
  setZoomHeld(false);
  setArtHintVisible(false);
  document.body.classList.add('focused');
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
  document.body.classList.remove('focused');
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
  setZoomHeld(false);
  setArtHintVisible(false);
  document.body.classList.remove('focused');
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

updaters.push(updateSpeakerPool);

updaters.push(() => {
  if (!isLocked() || focusState) {
    setArtHintVisible(false);
    return;
  }
  setArtHintVisible(Boolean(getAimedArtworkHit()));
});

/* ---- pointer-lock lifecycle: the #enter overlay IS the pause menu ---- */
document.addEventListener('pointerlockchange', () => {
  const locked = isLocked();
  document.body.classList.toggle('locked', locked);
  syncMuseumAudioState();
  if (!locked) {
    cancelFocus();                       // resume cleanly next time
    if (entered) enterGo.textContent = T('继续', 'Resume', '계속');
  }
});

document.addEventListener('contextmenu', (e) => {
  if (isLocked()) e.preventDefault();
});

document.addEventListener('mousedown', (e) => {
  if (e.button !== 2 || !isLocked()) return;
  e.preventDefault();
  setZoomHeld(true);
});

document.addEventListener('mouseup', (e) => {
  if (e.button === 2) setZoomHeld(false);
});

window.addEventListener('blur', () => setZoomHeld(false));
document.addEventListener('visibilitychange', syncMuseumAudioState);

canvas.addEventListener('click', (e) => {
  if (e.button !== 0) return;
  if (!isLocked()) return;               // (clicks on the overlay handle locking)
  if (focusState) { unfocus(); return; } // click again to leave focus
  const hit = getAimedArtworkHit();
  if (hit) focusOn(hit.object);
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
  startMuseumTrack();
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
  const textureCount = Math.min(INITIAL_TEXTURE_COUNT, IMAGES.length);
  setProgress(0, textureCount);
  let done = 0;
  await preloadInitialTextures(() => setProgress(++done, textureCount));
  enterProg.textContent = T('优化场景中', 'Optimizing scene', '장면 최적화 중');
  buildHall();
  await prewarmScene();
  startLoop();        // render the hall behind the translucent start overlay
  readyToEnter();
}
boot();
