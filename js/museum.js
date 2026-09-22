import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { createMuseumArchitecture } from './museum-architecture.js?v=lighting-20260922-r6';
import { createMuseumPlayer } from './museum-player.js?v=museum-source-20260922-r2';
import { createMuseumFrameScheduler } from './museum-performance.js?v=museum-source-20260922';
import { createMuseumBloomOcclusion } from './museum-bloom-occlusion.js?v=lighting-20260912-r3';
import { createMuseumFixtureBatch } from './museum-fixture-batch.js?v=nocturne-20260912';
import { createMuseumAtmosphere } from './museum-atmosphere.js?v=lighting-20260922-r6';
import { createMuseumPlaques } from './museum-plaques.js?v=guestbook-20260922-r3';
import { PLAQUE_FOCUS_DISTANCE } from './museum-plaque-layout.js?v=guestbook-20260922-r2';
import { createMuseumGuestbook } from './museum-guestbook.js?v=guestbook-20260922-r3';

/* ---- language (mirror main.js: localStorage 'lang', default zh) ---- */
const lang = (() => {
  const v = localStorage.getItem('lang');
  return v === 'en' || v === 'ko' ? v : 'zh';
})();
document.documentElement.lang = lang;
const T = (zh, en, ko) => (lang === 'en' ? en : lang === 'ko' ? ko : zh);
const plaques = createMuseumPlaques({ lang });
let plaqueSession = null;
const guestbook = createMuseumGuestbook({ lang, onClose: closeGuestPlaque, onTitleChange: summary => {
  plaques.update(summary);
  requestSceneFrame();
} });

// Preferences are optional: private browsing or full storage must not block entry.
let savedSettings = {};
try { savedSettings = JSON.parse(localStorage.getItem('eytle-museum-settings') || '{}') || {}; } catch {}
const settings = {
  sensitivity: Number.isFinite(Number(savedSettings.sensitivity))
    ? Math.max(0.3, Math.min(3, Number(savedSettings.sensitivity))) : 1,
  fps: [60, 90, 120].includes(savedSettings.fps) ? savedSettings.fps : 60,
};
function saveSettings() {
  try { localStorage.setItem('eytle-museum-settings', JSON.stringify(settings)); } catch {}
}

/* ---- overlay / chrome DOM ---- */
const enterEl = document.getElementById('enter');
const exhibitionTitle = document.getElementById('exhibition-title');
const enterGo = document.getElementById('enter-go');
const enterSub = document.getElementById('enter-sub');
const enterKeys = document.getElementById('enter-keys');
const enterProg = document.getElementById('enter-prog');
const enterBack = document.getElementById('enter-back');
const artHintEl = document.getElementById('art-hint');
const artHintCaption = document.createElement('span');
artHintCaption.className = 'hint-caption';
artHintEl.append(artHintCaption);
const titleEl = document.getElementById('title');
const hudEl = document.getElementById('hud');
const exitBtn = document.getElementById('exit-btn');

const exhibitionName = T('图画展览会', 'Pictures At An Exhibition', '전람회의 그림');
document.title = `${exhibitionName} · This is Eytle`;
exhibitionTitle.textContent = exhibitionName;
enterSub.textContent = T('WASD 移动，鼠标调整视角。E 或左键查看画作、打开铭牌。按住右键放大。', 'Use WASD to move and the mouse to look around. Press E or left-click to inspect artworks or open labels. Hold the right mouse button to zoom in.', 'WASD로 이동하고 마우스로 시점을 조절하세요. E 또는 왼쪽 클릭으로 작품을 보거나 안내판을 엽니다. 오른쪽 버튼을 누르고 있으면 확대됩니다.');
function controlGuideMarkup() {
  const movement = T('移动', 'Move', '이동');
  const inspect = T('查看', 'View', '보기');
  const zoom = T('放大', 'Zoom', '확대');
  const walk = T('慢走', 'Walk', '걷기');
  const crouch = T('蹲下', 'Crouch', '앉기');
  const jump = T('跳跃', 'Jump', '점프');
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
      <div class="shortcut"><span class="wide-key shift-key">Shift</span><span>${walk}</span></div>
      <div class="shortcut"><span class="wide-key">Ctrl</span><span>${crouch}</span></div>
      <div class="shortcut"><span class="wide-key">Space</span><span>${jump}</span></div>
      <div class="shortcut"><span class="wide-key">E</span><span>${inspect}</span></div>
    </div>`;
}
const controlGuide = controlGuideMarkup();
enterKeys.innerHTML = controlGuide;
enterKeys.setAttribute('aria-label', T('操作说明：WASD 跑动，Shift 慢走，Ctrl 蹲下，空格跳跃，E 或左键查看和返回，右键放大，Esc 暂停',
  'Controls: WASD run, Shift walk, Ctrl crouch, Space jump, E or left click inspect and return, hold right click zoom, Esc pause',
  '조작 안내: WASD 달리기, Shift 걷기, Ctrl 앉기, Space 점프, E 또는 왼쪽 클릭 감상 및 돌아가기, 오른쪽 클릭 확대, Esc 일시정지'));
enterBack.textContent = T('返回首页', 'Back to home', '홈으로');
exitBtn.title = T('返回首页', 'Back to home', '홈으로');
titleEl.textContent = `${exhibitionName} — This is Eytle`;
hudEl.className = 'control-guide';
hudEl.innerHTML = controlGuide;
exitBtn.addEventListener('click', () => { location.href = '/'; });
enterBack.addEventListener('click', (e) => { e.stopPropagation(); location.href = '/'; });

const runtimeStatus = document.getElementById('runtime-status');
const sensitivityInput = document.getElementById('look-sensitivity');
const sensitivityValue = document.getElementById('sensitivity-value');
const frameLimitInput = document.getElementById('frame-limit');
document.getElementById('settings-title').textContent = T('操作设置', 'Controls', '조작 설정');
document.getElementById('sensitivity-label').textContent = T('鼠标灵敏度', 'Mouse sensitivity', '마우스 감도');
document.getElementById('frame-limit-label').textContent = T('帧率上限', 'Frame limit', '최대 프레임');
sensitivityInput.value = settings.sensitivity;
sensitivityValue.value = `${settings.sensitivity.toFixed(1)}×`;
frameLimitInput.value = settings.fps;
sensitivityInput.addEventListener('input', () => {
  settings.sensitivity = Number(sensitivityInput.value);
  sensitivityValue.value = `${settings.sensitivity.toFixed(1)}×`;
  saveSettings();
});
frameLimitInput.addEventListener('change', () => {
  settings.fps = Number(frameLimitInput.value);
  resetFrameTiming();
  saveSettings();
});

let preloaded = false, entered = false;
function setProgress(loaded, total) {
  enterProg.textContent = T(`加载中 ${loaded} / ${total}`, `Loading ${loaded} / ${total}`, `로딩 중 ${loaded} / ${total}`);
}
function readyToEnter() {
  preloaded = true;
  enterProg.textContent = '';
  enterGo.textContent = T('进入展馆', 'Enter exhibition', '전시장 입장');
  enterGo.disabled = false;
}
function fail(zh, en, ko) {
  enterSub.textContent = T(zh, en, ko);
  enterProg.textContent = '';
  enterGo.hidden = true;
}

/* ---- gallery list ---- */
let IMAGES = [];
let TEXTURE_IMAGES = [];
let IMAGE_META = [];
const SMALL_IMAGE_BYTES = 1024 * 1024;
const GALLERY_CACHE = 'eytle-gallery-v1';
const GALLERY_PREVIEW_KEY = 'eytle-gallery-preview-v2';
const GALLERY_PREVIEW_INDEX = './images/gallery-preview/index.json';
// Keep every artwork from the rear wall through the first 100 m resident before
// the entrance becomes interactive. This makes the loading screen truthful:
// walking can begin without decode/upload work competing with the first frames.
const INITIAL_TEXTURE_START = 0;
const INITIAL_TEXTURE_COUNT = 48;
const HOMEPAGE_TEXTURE_INSERTION_INDEX = 16;
const STREAM_BATCH_SIZE = 20;
const TEXTURE_LOAD_CONCURRENCY = 4;
const PREFETCH_AHEAD_DISTANCE = 100;
const KEEP_BEHIND_DISTANCE = 42;
const MAX_RESIDENT_TEXTURES = 60;
const STREAM_UPDATE_INTERVAL_MS = 400;
const BATCH_RETRY_DELAY_MS = 8000;
const TEXTURE_UPLOAD_MIN_INTERVAL_MS = 54;
const TEXTURE_UPLOAD_FRAME_BUDGET_MS = 11.5;
const TEXTURE_UPLOAD_MAX_WAIT_MS = 650;
const PERF_AUTOWALK = new URLSearchParams(location.search).get('perf') === 'walk';
const PERF_STILL = new URLSearchParams(location.search).get('perf') === 'still';
const PERF_CAPTURE = new URLSearchParams(location.search).has('perf');
const PERF_SAMPLE_LIMIT = 600;
const perfFrameSamples = [];
let perfFrameNumber = 0;
let perfTextureUploads = 0;
let perfChunkRetargets = 0;

function recordPerformanceFrame(frameMs, renderMs) {
  if (!PERF_CAPTURE) return;
  perfFrameSamples.push(frameMs);
  if (perfFrameSamples.length > PERF_SAMPLE_LIMIT) perfFrameSamples.shift();
  perfFrameNumber++;
  if (perfFrameNumber % 30 !== 0) return;

  const sorted = [...perfFrameSamples].sort((a, b) => a - b);
  const percentile = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
  canvas.dataset.perf = JSON.stringify({
    frames: perfFrameSamples.length,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    textures: renderer.info.memory.textures,
    geometries: renderer.info.memory.geometries,
    p95: Number(percentile(0.95).toFixed(2)),
    p99: Number(percentile(0.99).toFixed(2)),
    max: Number(Math.max(...perfFrameSamples).toFixed(2)),
    over25: perfFrameSamples.filter(ms => ms > 25).length,
    over40: perfFrameSamples.filter(ms => ms > 40).length,
    uploads: perfTextureUploads,
    retargets: perfChunkRetargets,
    z: Number(camera.position.z.toFixed(2)),
    x: Number(camera.position.x.toFixed(3)),
    y: Number(camera.position.y.toFixed(3)),
    speed: Number(player.state.speed.toFixed(3)),
    grounded: player.state.grounded,
    crouched: player.state.crouched,
    locked: isLocked(),
    fov: Number(camera.fov.toFixed(2)),
    renderMs: Number(renderMs.toFixed(2)),
    pixelRatio: renderer.getPixelRatio(),
    scenePixels: [finalComposer.readBuffer.width, finalComposer.readBuffer.height],
    frameLimit: settings.fps,
    presented: presentedFrames,
  });
}

async function loadImageList() {
  const [res, previewResponse] = await Promise.all([
    fetch('./images/gallery/index.json', { cache: 'no-cache' }),
    fetch(GALLERY_PREVIEW_INDEX, { cache: 'no-cache' }).catch(() => null),
  ]);
  if (!res.ok) throw new Error('index ' + res.status);
  const files = await res.json();
  if (!Array.isArray(files) || files.length === 0) throw new Error('empty');
  let previewItems = {};
  if (previewResponse?.ok) {
    const manifest = await previewResponse.json();
    if (manifest && typeof manifest.items === 'object') previewItems = manifest.items;
  }
  const entries = files.map((filename) => {
    const url = `images/gallery/${encodeURIComponent(filename)}`;
    const previewMeta = previewItems[filename];
    if (!previewMeta || typeof previewMeta.preview !== 'string') {
      return { url, textureUrl: url, byteSize: null };
    }
    const version = typeof previewMeta.sourceHash === 'string'
      ? `?v=${encodeURIComponent(previewMeta.sourceHash.slice(0, 12))}`
      : '';
    return {
      url,
      textureUrl: `images/gallery-preview/${encodeURIComponent(previewMeta.preview)}${version}`,
      byteSize: Number.isFinite(previewMeta.sourceBytes) ? previewMeta.sourceBytes : null,
      width: Number.isFinite(previewMeta.width) ? previewMeta.width : null,
      height: Number.isFinite(previewMeta.height) ? previewMeta.height : null,
    };
  });
  const entriesByUrl = new Map(entries.map(entry => [entry.url, entry]));
  const urls = entries.map(entry => entry.url);

  // Keep the 12 homepage images in the first visible stretch so the museum can
  // reuse their disk cache while preserving the intended opening composition.
  let homepageImages = [];
  try {
    const stored = JSON.parse(sessionStorage.getItem(GALLERY_PREVIEW_KEY) || '[]');
    if (Array.isArray(stored)) homepageImages = stored.map(url => (
      typeof url === 'string' ? url.split('?')[0] : url
    ));
  } catch {}
  const available = new Set(urls);
  const prioritized = [...new Set(homepageImages)].filter(url => available.has(url));
  const prioritizedSet = new Set(prioritized);
  const remainingUrls = urls.filter(url => !prioritizedSet.has(url));
  const insertionPoint = Math.min(HOMEPAGE_TEXTURE_INSERTION_INDEX, remainingUrls.length);
  const orderedUrls = [
    ...remainingUrls.slice(0, insertionPoint),
    ...prioritized,
    ...remainingUrls.slice(insertionPoint),
  ];
  const orderedEntries = orderedUrls.map(url => entriesByUrl.get(url));
  IMAGES = orderedEntries.map(entry => entry.url);
  TEXTURE_IMAGES = orderedEntries.map(entry => entry.textureUrl);
  IMAGE_META = orderedEntries.map(entry => (
    Number.isFinite(entry.byteSize) || (Number.isFinite(entry.width) && Number.isFinite(entry.height))
      ? {
          byteSize: entry.byteSize,
          width: entry.width,
          height: entry.height,
          scale: Number.isFinite(entry.byteSize) && entry.byteSize <= SMALL_IMAGE_BYTES ? 0.5 : 1,
        }
      : null
  ));
}

/* ============================================================
   RENDERER · SCENE · CAMERA · LOOP
   ============================================================ */
const EYE_Y = 1.65;
const HALL_HALF_WIDTH = 3;
const CHUNK_LEN = 14;
const CEIL_Y = 6.7;
const VAULT_RISE = 3.0;
const VAULT_SPRING_Y = CEIL_Y - VAULT_RISE;
const LAMP_BASE_DEPTH = 0.045;
const BLOOM_LAYER = 1;
const CAMERA_FOV = 74;
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
renderer.info.autoReset = false;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
let contextLost = false;

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  contextLost = true;
  looping = false;
  renderer.setAnimationLoop(null);
  while (textureUploadQueue.length) textureUploadQueue.shift().resolve(false);
  audioListener.setMasterVolume(0);
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  document.body.classList.remove('locked', 'focused');
  fail('展馆显示异常，请刷新页面。', 'The exhibition could not be displayed. Please reload.', '전시를 표시하지 못했습니다. 새로고침하세요.');
}, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x09151b);
scene.fog = new THREE.Fog(0x09151b, 18, 82);

/* ---- IBL + ambient fill (amber & teal) ---- */
const _pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = _pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
_pmrem.dispose();
scene.environmentIntensity = 0.32;
scene.add(new THREE.AmbientLight(0x92abb3, 0.23));
scene.add(new THREE.HemisphereLight(0xc4d7de, 0x192a2d, 0.75));

const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 88);
camera.position.set(0, EYE_Y, SPAWN_Z);

// One listener follows every camera pose, including artwork focus tweens.
camera.add(audioListener);

const updaters = [];
const frameScheduler = createMuseumFrameScheduler({ fps: settings.fps });
let lastRenderedAt = null;
let lastMaintenanceAt = 0;
let presentedFrames = 0;
function resetFrameTiming() {
  lastRenderedAt = null;
  frameScheduler.setFrameRate(settings.fps);
  frameScheduler.requestFrame();
}
function requestSceneFrame() {
  frameScheduler.requestFrame();
}
function frame(timestamp) {
  if (contextLost) return;
  const frameStartedAt = performance.now();
  const presentationTime = Number.isFinite(timestamp) ? timestamp : frameStartedAt;
  const active = PERF_AUTOWALK || isLocked() || Boolean(focusState && focusState.phase !== 'readingPlaque');
  if (!frameScheduler.shouldRender({ now: presentationTime, active, visible: !document.hidden })) {
    // Paused streaming can finish, but a settled menu does no draw work.
    if (!document.hidden && frameStartedAt - lastMaintenanceAt >= 100) {
      lastMaintenanceAt = frameStartedAt;
      const retargeted = processChunkRetargetQueue(frameStartedAt);
      if (!retargeted) processTextureUploadQueue(frameStartedAt);
    }
    return;
  }
  const rawDelta = lastRenderedAt === null ? 1 / settings.fps : (presentationTime - lastRenderedAt) / 1000;
  lastRenderedAt = presentationTime;
  const dt = Math.min(rawDelta, 0.1);
  if (active) for (const fn of updaters) fn(dt);
  updatePictureSpotPool();
  fixtureBatch?.update();
  renderer.info.reset();
  renderGalleryFrame();
  presentedFrames++;
  if (PERF_CAPTURE) canvas.dataset.presented = presentedFrames;
  const retargetedChunkArtwork = processChunkRetargetQueue(frameStartedAt);
  if (!retargetedChunkArtwork) processTextureUploadQueue(frameStartedAt);
  recordPerformanceFrame(rawDelta * 1000, performance.now() - frameStartedAt);
}
let looping = false;
function startLoop() {
  if (looping || contextLost) return;
  looping = true;
  resetFrameTiming();
  renderer.setAnimationLoop(frame);
}

/* ============================================================
   POST: subtle bloom + tone-mapped output
   ============================================================ */
const bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.setPixelRatio(1);
bloomComposer.setSize(window.innerWidth / 2, window.innerHeight / 2);
bloomComposer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.10,  // restrained optical bloom, isolated from artwork
  0.45,  // radius
  1.1    // threshold keeps architecture dark and artwork out of the halo
);
bloomComposer.addPass(bloom);

// Multisample only the scene geometry. Post-processing fullscreen quads do not
// need duplicate multisample buffers, particularly at native HiDPI resolution.
const sceneTarget = new THREE.WebGLRenderTarget(
  Math.round(window.innerWidth * renderer.getPixelRatio()),
  Math.round(window.innerHeight * renderer.getPixelRatio()), {
  type: THREE.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples),
});
const finalComposer = new EffectComposer(renderer);
// Allocate every post target at drawing-buffer resolution on the very first frame.
finalComposer.setSize(window.innerWidth, window.innerHeight);
const bloomMixPass = new ShaderPass({
  uniforms: {
    baseTexture: { value: null },
    bloomTexture: { value: null },
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
      vec2 p = vUv * 2.0 - 1.0;
      float vignette = 1.0 - 0.12 * pow(dot(p, p) * 0.5, 1.4);
      gl_FragColor = vec4((base.rgb + bloom) * vignette, base.a);
    }
  `,
});
// r186's composer output includes the half-resolution light geometry as well as
// the glow. Adding that image duplicated hard light edges at half resolution.
// Composite only UnrealBloomPass's blurred result; the main pass owns the cores.
bloomMixPass.uniforms.baseTexture.value = sceneTarget.texture;
bloomMixPass.uniforms.bloomTexture.value = bloom.renderTargetsHorizontal[0].texture;
finalComposer.addPass(bloomMixPass);
// r186 SMAA operates in linear space. Keep it before tone mapping/output so it
// treats subpixel light edges without a full-frame softening filter.
finalComposer.addPass(new SMAAPass());
finalComposer.addPass(new OutputPass());

function enableBloomLayer(object) {
  object.layers.enable(BLOOM_LAYER);
  return object;
}

const bloomBackground = new THREE.Color(0x000000);
let bloomOcclusion = null;
function renderGalleryFrame() {
  const background = scene.background;
  scene.background = bloomBackground;
  camera.layers.set(0);
  try {
    if (bloomOcclusion) bloomOcclusion.render(() => bloomComposer.render());
    else bloomComposer.render();
  } finally {
    scene.background = background;
  }
  const previousTarget = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(sceneTarget);
    renderer.clear();
    renderer.render(scene, camera);
  } finally {
    renderer.setRenderTarget(previousTarget);
  }
  finalComposer.render();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  sceneTarget.setSize(Math.round(window.innerWidth * renderer.getPixelRatio()),
    Math.round(window.innerHeight * renderer.getPixelRatio()));
  bloomComposer.setSize(window.innerWidth / 2, window.innerHeight / 2);
  finalComposer.setPixelRatio(renderer.getPixelRatio());
  finalComposer.setSize(window.innerWidth, window.innerHeight);
  architecture.resize();
  requestSceneFrame();
});

/* ============================================================
   MATERIALS  (+ procedural surface texture, generated on a canvas —
   no external files, keeping the no-build constraint)
   ============================================================ */
const architecture = createMuseumArchitecture({
  scene, renderer, camera, halfWidth: HALL_HALF_WIDTH, ceilingY: CEIL_Y,
  springY: VAULT_SPRING_Y, chunkLength: CHUNK_LEN,
});
const atmosphere = createMuseumAtmosphere({
  THREE, scene, renderer, camera, width: HALL_HALF_WIDTH * 2, ceilingY: CEIL_Y,
});
updaters.push(atmosphere.update);

function makeSpotWashTexture(size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size * 0.25, 0, size / 2, size * 0.25, size * 0.64);
  gradient.addColorStop(0, 'rgba(255,242,218,0.75)');
  gradient.addColorStop(0.30, 'rgba(255,233,197,0.30)');
  gradient.addColorStop(1, 'rgba(255,233,197,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const mats = {
  frame: architecture.materials.bronze,
  pictureFrame: architecture.materials.frame,
  pictureLight: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.1, 1.45) }),
  pictureLightWash: new THREE.MeshBasicMaterial({
    color: 0xffebcc, map: makeSpotWashTexture(), transparent: true, opacity: 0.22,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }),
};

/* ============================================================
   INFINITE HALL — fixed chunk pool, recycled as the player walks.
   Textures stream in batches and are released from GPU memory behind the player.
   ============================================================ */

const POOL = 20;
const FLOOR_LEN = CHUNK_LEN * (POOL + 1);
const RECYCLE_BACK_BUFFER = 112;
const REAR_WALL_OFFSET = 72;
const FORWARD_VIEW_BUFFER = 170;
// Prepare a recycled chunk only after it is fully hidden behind the fog. Each
// artwork is retargeted on a separate frame so crossing a chunk boundary never
// rebuilds four picture layouts in one visible frame.
const CHUNK_RETARGET_PREPARE_DISTANCE = 88;
const CHUNK_RETARGET_FRAME_BUDGET_MS = 11.5;
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
const MUSEUM_MUSIC_VOLUME = 0.70;
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
  16,
  24,
);

const texLoader = new THREE.TextureLoader();
const texCache = [];          // one THREE.Texture (or null) per IMAGES entry
const textureLoads = [];
const textureLastUsed = [];
const streamBatchQueue = [];
const queuedBatchStarts = new Set();
const batchLastAttempt = [];
const textureUploadQueue = [];
const artworkGeometryCache = new Map();
const pictureFrameGeometryCache = new Map();
const rodGeometryCache = new Map();
const artMeshes = [];         // pickable picture meshes for raycasting
const pictureLightFixtures = [];
let fixtureBatch = null;
const pictureSpotPool = [];
const chunks = [];
const chunkRetargetQueue = [];
const speakerRigs = [];
let floorRig = null;
let rearWall = null;
let nextImageIndex = 0;
let streamBatchWorkerActive = false;
let lastStreamUpdate = 0;
let lastTextureUpload = 0;

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
  console.info(`Exhibition music is unavailable. Add the MP3 at ${MUSEUM_MUSIC_URL}.`, error);
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

function prewarmMuseumTrack() {
  museumTrack.preload = 'auto';
  museumTrack.load();
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

function resizePictureFrame(frame, artW, artH, metrics = frameMetricsForScale(0), cacheKey = 'placeholder') {
  const border = THREE.MathUtils.clamp(artH * 0.035, 0.036, 0.062);
  const inset = Math.max(border * 0.30, 0.012);
  const outerBand = Math.max(border - inset, 0.023);
  const artOverlap = THREE.MathUtils.clamp(Math.min(artW, artH) * 0.018, 0.01, 0.026);
  const innerOuterW = artW + inset * 2;
  const innerOuterH = artH + inset * 2;
  const outerW = innerOuterW + outerBand * 2;
  const outerH = innerOuterH + outerBand * 2;
  const openingW = Math.max(artW - artOverlap * 2, artW * 0.92);
  const openingH = Math.max(artH - artOverlap * 2, artH * 0.92);
  const geometryKey = `${cacheKey}:${artW.toFixed(4)}:${artH.toFixed(4)}:${metrics.depth.toFixed(4)}:${metrics.artZ.toFixed(4)}`;
  let geometry = pictureFrameGeometryCache.get(geometryKey);
  if (!geometry) {
    geometry = makeTieredFrameGeometry(outerW, outerH, innerOuterW, innerOuterH, openingW, openingH, metrics);
    pictureFrameGeometryCache.set(geometryKey, geometry);
  }
  let mesh = frame.userData.frameMesh;
  if (!mesh) {
    mesh = new THREE.Mesh(geometry, mats.pictureFrame);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    frame.userData.frameMesh = mesh;
    frame.add(mesh);
  } else if (mesh.geometry !== geometry) {
    mesh.geometry = geometry;
  }
}

function makePictureFrame(x, y, z, ry) {
  const frame = new THREE.Group();
  frame.position.set(x, y, z);
  frame.rotation.y = ry;
  resizePictureFrame(frame, 2, ART_H, frameMetricsForScale(0));
  return frame;
}

function artworkGeometryFor(cacheKey, width, height) {
  const geometryKey = `${cacheKey}:${width.toFixed(4)}:${height.toFixed(4)}`;
  let geometry = artworkGeometryCache.get(geometryKey);
  if (!geometry) {
    geometry = new THREE.PlaneGeometry(width, height);
    artworkGeometryCache.set(geometryKey, geometry);
  }
  return geometry;
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
  if (!('caches' in window)) return { url, blob: null };
  try {
    const cache = await caches.open(GALLERY_CACHE);
    let response = await cache.match(url);
    if (!response) {
      response = await fetch(url);
      if (!response.ok) return { url, blob: null };
      void cache.put(url, response.clone()).catch(() => {});
    }
    const blob = await normalizeImageBlobType(await response.blob());
    if (!IMAGE_META[imageIndex]) {
      IMAGE_META[imageIndex] = {
        byteSize: blob.size,
        scale: blob.size <= SMALL_IMAGE_BYTES ? 0.5 : 1,
      };
    }
    return { url, blob };
  } catch {
    return { url, blob: null };
  }
}

async function decodeGalleryTexture(source) {
  if (source.blob && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(source.blob, {
        imageOrientation: 'flipY',
        premultiplyAlpha: 'none',
      });
      const texture = new THREE.Texture(bitmap);
      texture.flipY = false;
      texture.needsUpdate = true;
      texture.userData.imageBitmap = bitmap;
      return texture;
    } catch {}
  }

  let loadUrl = source.url;
  let objectUrl = null;
  if (source.blob) {
    objectUrl = URL.createObjectURL(source.blob);
    loadUrl = objectUrl;
  }
  return new Promise(resolve => {
    const finish = texture => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(texture);
    };
    texLoader.load(loadUrl, finish, undefined, () => finish(null));
  });
}

function disposeGalleryTexture(texture) {
  texture?.userData?.imageBitmap?.close?.();
  texture?.dispose();
}

function scheduleTextureUpload(imageIndex, texture) {
  if (contextLost) return Promise.resolve(false);
  if (typeof renderer.initTexture !== 'function') return Promise.resolve(true);
  if (!looping) {
    try {
      renderer.initTexture(texture);
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }
  return new Promise(resolve => {
    textureUploadQueue.push({ imageIndex, texture, queuedAt: performance.now(), resolve });
  });
}

function processTextureUploadQueue(frameStartedAt) {
  if (!textureUploadQueue.length) return;
  const now = performance.now();
  if (now - lastTextureUpload < TEXTURE_UPLOAD_MIN_INTERVAL_MS) return;
  const next = textureUploadQueue[0];
  const waited = now - next.queuedAt;
  const frameWork = now - frameStartedAt;
  if (frameWork > TEXTURE_UPLOAD_FRAME_BUDGET_MS && waited < TEXTURE_UPLOAD_MAX_WAIT_MS) return;

  textureUploadQueue.shift();
  lastTextureUpload = now;
  try {
    renderer.initTexture(next.texture);
    if (PERF_AUTOWALK) perfTextureUploads++;
    next.resolve(true);
  } catch {
    next.resolve(false);
  }
}

function loadTexture(i) {
  if (texCache[i]) return Promise.resolve(texCache[i]);
  if (textureLoads[i]) return textureLoads[i];
  const promise = galleryImageSource(TEXTURE_IMAGES[i] || IMAGES[i], i)
    .then(decodeGalleryTexture)
    .then(async (tex) => {
      if (!tex) {
        texCache[i] = null;
        return null;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const uploaded = await scheduleTextureUpload(i, tex);
      if (!uploaded) {
        disposeGalleryTexture(tex);
        return null;
      }
      texCache[i] = tex;
      textureLastUsed[i] = performance.now();
      return tex;
    }).finally(() => {
    if (textureLoads[i] === promise) textureLoads[i] = null;
  });
  textureLoads[i] = promise;
  return promise;
}

async function loadTextureIndices(indices, onProgress, onTextureReady) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < indices.length) {
      const imageIndex = indices[cursor++];
      const texture = await loadTexture(imageIndex);
      if (texture && onTextureReady) onTextureReady(imageIndex, texture);
      if (onProgress) onProgress();
    }
  };
  const workerCount = Math.min(TEXTURE_LOAD_CONCURRENCY, indices.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
}

function preloadInitialTextures(onProgress) {
  const count = Math.min(INITIAL_TEXTURE_COUNT, IMAGES.length);
  const start = Math.min(INITIAL_TEXTURE_START, Math.max(0, IMAGES.length - count));
  const indices = Array.from({ length: count }, (_, i) => start + i);
  return loadTextureIndices(indices, onProgress);
}

function fitArtwork(pic, frame, tex, imageIndex) {
  const meta = IMAGE_META[imageIndex % IMAGE_META.length];
  const sourceWidth = meta?.width || tex?.image?.width;
  const sourceHeight = meta?.height || tex?.image?.height;
  if (!sourceWidth || !sourceHeight) return;
  const ar = sourceWidth / sourceHeight;
  const scale = meta?.scale ?? 1;
  const metrics = frameMetricsForScale(scale);
  let h = ART_H * scale, w = h * ar;
  const maxW = ART_MAX_W * scale;
  if (w > maxW) { w = maxW; h = w / ar; }
  const layoutKey = `${imageIndex}:${w.toFixed(4)}:${h.toFixed(4)}:${scale}`;
  const slot = pic.userData.slot;
  if (slot?.layoutKey === layoutKey) return;
  const geometry = artworkGeometryFor(layoutKey, w, h);
  if (pic.geometry !== geometry) pic.geometry = geometry;
  resizePictureFrame(frame, w, h, metrics, layoutKey);
  if (slot) {
    slot.layoutKey = layoutKey;
    slot.artScale = scale;
    const frameX = frameXForSide(slot.side, metrics);
    slot.frame.position.x = frameX;
    slot.pic.position.x = pictureXForFrame(slot.side, frameX, metrics);
    resizePictureLight(slot, w, h);
    plaques.layout(slot, w, THREE.MathUtils.clamp(h * 0.035, 0.036, 0.062));
  }
}

function showArtworkTexture(slot, tex, imageIndex) {
  const hadMap = Boolean(slot.pic.material.map);
  slot.pic.material.map = tex;
  slot.pic.material.color.setHex(0xffffff);
  if (!hadMap) slot.pic.material.needsUpdate = true;
  textureLastUsed[imageIndex] = performance.now();
  fitArtwork(slot.pic, slot.frame, tex, imageIndex);
  requestSceneFrame();
}

function showArtworkPlaceholder(slot) {
  const hadMap = Boolean(slot.pic.material.map);
  slot.pic.material.map = null;
  slot.pic.material.color.setHex(0x263248);
  if (hadMap) slot.pic.material.needsUpdate = true;
  requestSceneFrame();
}

function setArtTexture(slot, imageIndex) {
  const cacheIndex = imageIndex % IMAGES.length;
  slot.imageIndex = cacheIndex;
  plaques.bind(slot, decodeURIComponent(IMAGES[cacheIndex].split('/').pop()));
  const tex = texCache[cacheIndex];
  if (tex) showArtworkTexture(slot, tex, cacheIndex);
  else {
    fitArtwork(slot.pic, slot.frame, tex, cacheIndex);
    showArtworkPlaceholder(slot);
  }
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
    artworkGeometryFor('placeholder', 2, ART_H),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.0 }));
  pic.position.set(picX, ART_Y, localZ);
  pic.rotation.y = ry;
  pic.userData.pickable = true;
  parent.add(pic);
  artMeshes.push(pic);

  const slot = { pic, frame, parent, side, fixtures: [], artScale: 1 };
  pic.userData.slot = slot;
  plaques.attach(slot);
  plaques.layout(slot, 2, 0.062);
  artMeshes.push(slot.plaque);
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
  const key = radius.toFixed(4);
  let geometry = rodGeometryCache.get(key);
  if (!geometry) {
    geometry = new THREE.CylinderGeometry(radius, radius, 1, 14);
    rodGeometryCache.set(key, geometry);
  }
  const rod = new THREE.Mesh(geometry, material);
  rod.userData.radius = radius;
  rod.scale.y = Math.max(dir.length(), 0.001);
  rod.position.copy(start).addScaledVector(dir, 0.5);
  alignObjectToVector(rod, new THREE.Vector3(0, 1, 0), dir);
  return rod;
}

function updateRod(rod, start, end) {
  const dir = end.clone().sub(start);
  rod.scale.y = Math.max(dir.length(), 0.001);
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
    // Hall chunks only translate along Z. Adding the parent translation gives
    // the exact same world position without walking the scene graph twice for
    // every one of the 160 picture-light fixtures on every frame.
    fixture.worldLightPosition.copy(fixture.lightLocalPosition).add(fixture.parent.position);
    fixture.worldTargetPosition.copy(fixture.targetLocalPosition).add(fixture.parent.position);
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
    fixture.spotIntensity = 17;
    fixture.spotDistance = 8.5;
    fixture.spotAngle = Math.PI / 6.0;
    fixture.spotPenumbra = 0.62;
    fixture.spotDecay = 2;
    return;
  }
  fixture.spotIntensity = 27;
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

function makeChunk(z, slotOffset) {
  const group = new THREE.Group();
  group.position.z = z;
  scene.add(group);
  architecture.attachChunk(group);
  const slots = [];
  for (let k = 0; k < ART_PER_SIDE; k++) {
    const localZ = -((k + 0.5) * ART_SPACING);
    slots.push(makeArtwork(group, -1, localZ, slotOffset + slots.length));
    slots.push(makeArtwork(group, 1, localZ, slotOffset + slots.length));
  }
  return { group, slots };
}
function buildMovingFloor() {
  floorRig = architecture.makeFloor(FLOOR_LEN);
}
function buildRearWall() {
  rearWall = architecture.makeRearWall();
}

function positionRearWall() {
  if (!rearWall || chunks.length === 0) return;
  rearWall.position.z = Math.max(...chunks.map(chunk => chunk.group.position.z));
}

function reserveChunkRetarget(chunk) {
  if (chunk.pendingRetarget) return chunk.pendingRetarget;
  const plan = {
    indices: chunk.slots.map(() => nextImageIndex++),
    cursor: 0,
  };
  chunk.pendingRetarget = plan;
  chunkRetargetQueue.push(chunk);
  return plan;
}

function removeChunkRetargetFromQueue(chunk) {
  const queueIndex = chunkRetargetQueue.indexOf(chunk);
  if (queueIndex >= 0) chunkRetargetQueue.splice(queueIndex, 1);
}

function processChunkRetargetQueue(frameStartedAt) {
  while (chunkRetargetQueue.length && !chunkRetargetQueue[0].pendingRetarget) {
    chunkRetargetQueue.shift();
  }
  const chunk = chunkRetargetQueue[0];
  if (!chunk) return false;
  if (performance.now() - frameStartedAt > CHUNK_RETARGET_FRAME_BUDGET_MS) return false;

  const plan = chunk.pendingRetarget;
  setArtTexture(chunk.slots[plan.cursor], plan.indices[plan.cursor]);
  plan.cursor++;
  if (plan.cursor >= chunk.slots.length) chunkRetargetQueue.shift();
  return true;
}

function finishChunkRetarget(chunk) {
  const plan = reserveChunkRetarget(chunk);
  removeChunkRetargetFromQueue(chunk);
  while (plan.cursor < chunk.slots.length) {
    setArtTexture(chunk.slots[plan.cursor], plan.indices[plan.cursor]);
    plan.cursor++;
  }
  chunk.pendingRetarget = null;
  if (PERF_AUTOWALK) perfChunkRetargets++;
}

function prepareHiddenRearChunk(playerZ) {
  let rearChunk = null;
  for (const chunk of chunks) {
    if (!rearChunk || chunk.group.position.z > rearChunk.group.position.z) rearChunk = chunk;
  }
  if (rearChunk && rearChunk.group.position.z - playerZ >= CHUNK_RETARGET_PREPARE_DISTANCE) {
    reserveChunkRetarget(rearChunk);
  }
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
  }

  let leadingZ = Math.min(...chunks.map(chunk => chunk.group.position.z));
  let rearZ = Math.max(...chunks.map(chunk => chunk.group.position.z));
  prepareHiddenRearChunk(playerZ);
  while (playerZ - leadingZ < FORWARD_VIEW_BUFFER) {
    const rearChunk = chunks.find(chunk => chunk.group.position.z === rearZ);
    if (!rearChunk) break;
    finishChunkRetarget(rearChunk);
    rearChunk.group.position.z = leadingZ - CHUNK_LEN;
    leadingZ = rearChunk.group.position.z;
    rearZ = Math.max(...chunks.map(chunk => chunk.group.position.z));
  }

  const farBehind = playerZ + RECYCLE_BACK_BUFFER;
  for (const chunk of chunks) {
    if (chunk.group.position.z > farBehind && playerZ - leadingZ > FORWARD_VIEW_BUFFER + CHUNK_LEN) {
      finishChunkRetarget(chunk);
      chunk.group.position.z = leadingZ - CHUNK_LEN;
      leadingZ = chunk.group.position.z;
    }
  }
  positionRearWall();
}

const artWorldPos = new THREE.Vector3();
let titlesRefreshing = false;
async function refreshPlaqueTitles() {
  if (titlesRefreshing || document.hidden) return;
  titlesRefreshing = true;
  try {
    const summaries = await guestbook.refreshTitles(plaques.residentIds());
    summaries.forEach(summary => plaques.update(summary));
    if (summaries.length) requestSceneFrame();
  } catch { /* The gallery remains usable when its visitor service is offline. */ }
  finally { titlesRefreshing = false; }
}
setInterval(() => { if (entered) void refreshPlaqueTitles(); }, 30000);

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

function evictDistantTextures(maxRemove = 1) {
  const residents = texCache
    .map((tex, i) => tex ? i : -1)
    .filter(i => i >= 0);
  if (residents.length <= MAX_RESIDENT_TEXTURES) return;

  const protectedIndices = protectedTextureIndices();
  const candidates = residents
    .filter(i => !protectedIndices.has(i) && !textureLoads[i])
    .sort((a, b) => (textureLastUsed[a] || 0) - (textureLastUsed[b] || 0));
  const removeCount = Math.min(residents.length - MAX_RESIDENT_TEXTURES, candidates.length, maxRemove);

  for (let n = 0; n < removeCount; n++) {
    const imageIndex = candidates[n];
    const texture = texCache[imageIndex];
    for (const chunk of chunks) {
      for (const slot of chunk.slots) {
        if (slot.pic.material.map === texture) showArtworkPlaceholder(slot);
      }
    }
    disposeGalleryTexture(texture);
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
        await loadTextureIndices(missing, null, (imageIndex) => {
          refreshArtworkSlots(new Set([imageIndex]));
          evictDistantTextures(1);
        });
        evictDistantTextures(1);
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

function updateTextureStreaming(force = false) {
  if (!entered && !force) return;
  const now = performance.now();
  if (!force && now - lastStreamUpdate < STREAM_UPDATE_INTERVAL_MS) return;
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
  evictDistantTextures(1);
}

function getRearWallZ() {
  return rearWall ? rearWall.position.z : REAR_WALL_OFFSET;
}

async function prewarmScene() {
  if (contextLost) return;
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
    if (contextLost) return;
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
   FIRST-PERSON CONTROLS · immediate look, fixed-step movement
   ============================================================ */
const LOOK_SENS = 0.0015;
const MAX_LOOK_SPIKE = 4096; // reject driver/lock glitches, never clip a normal flick
let yaw = 0, pitch = 0;
let roamEnabled = true;
let zoomHeld = false;
let ignoreNextLook = true;
const isLocked = () => document.pointerLockElement === canvas;
const player = createMuseumPlayer({ eyeHeight: EYE_Y, rearLimitZ: () => getRearWallZ() - 0.6 });
const heldCodes = new Set();
const keys = { forward: false, back: false, left: false, right: false, walk: false, crouch: false, jump: false, jumpPressed: false };
const movementCodes = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'Space']);
let jumpQueued = false;

function syncMuseumAudioState() {
  const audible = entered && (isLocked() || guestbook.isOpen()) && !document.hidden;
  audioListener.setMasterVolume(audible ? 1 : 0);
}

function clearInput() {
  heldCodes.clear();
  for (const key of Object.keys(keys)) keys[key] = false;
  jumpQueued = false;
  setZoomHeld(false);
  player.stop();
}

function onKey(e, down) {
  if (plaqueSession || !isLocked()) return;
  if (e.code === 'KeyE') {
    e.preventDefault();
    if (down && !e.repeat) inspectArtwork();
    return;
  }
  if (!movementCodes.has(e.code)) return;
  e.preventDefault();
  if (focusState) return;
  if (down) heldCodes.add(e.code);
  else heldCodes.delete(e.code);
  keys.forward = heldCodes.has('KeyW') || heldCodes.has('ArrowUp');
  keys.back = heldCodes.has('KeyS') || heldCodes.has('ArrowDown');
  keys.left = heldCodes.has('KeyA') || heldCodes.has('ArrowLeft');
  keys.right = heldCodes.has('KeyD') || heldCodes.has('ArrowRight');
  keys.walk = heldCodes.has('ShiftLeft') || heldCodes.has('ShiftRight');
  keys.crouch = heldCodes.has('ControlLeft') || heldCodes.has('ControlRight');
  keys.jump = heldCodes.has('Space');
  if (e.code === 'Space' && down && !e.repeat) jumpQueued = true;
}
document.addEventListener('keydown', e => onKey(e, true));
document.addEventListener('keyup', e => onKey(e, false));

document.addEventListener('mousemove', (e) => {
  if (!isLocked() || focusState) return;
  if (ignoreNextLook) { ignoreNextLook = false; return; }
  const dx = e.movementX || 0;
  const dy = e.movementY || 0;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > MAX_LOOK_SPIKE || Math.abs(dy) > MAX_LOOK_SPIKE) return;
  // Scale by the visible field of view so zoom stays precise without smoothing latency.
  const zoomScale = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
  const sensitivity = LOOK_SENS * settings.sensitivity * zoomScale;
  yaw -= dx * sensitivity;
  pitch = Math.max(-Math.PI / 2 + 0.015, Math.min(Math.PI / 2 - 0.015, pitch - dy * sensitivity));
  yaw = THREE.MathUtils.euclideanModulo(yaw + Math.PI, Math.PI * 2) - Math.PI;
});

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

const autoWalkInput = { forward: true };
updaters.push((dt) => {
  if (!focusState) camera.rotation.set(pitch, yaw, 0, 'YXZ');
  if (!focusState && !plaqueSession && (PERF_AUTOWALK || (roamEnabled && isLocked()))) {
    const jumpHeld = keys.jump;
    keys.jump = keys.jump || jumpQueued;
    keys.jumpPressed = jumpQueued;
    const state = player.advance(dt, PERF_AUTOWALK ? autoWalkInput : keys, yaw);
    camera.position.copy(state.position);
    keys.jump = jumpHeld;
    keys.jumpPressed = false;
    jumpQueued = false;
  }
  recycleChunks();
  updateTextureStreaming();
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
  const isPlaque = mesh.userData.kind === 'plaque';
  if (isPlaque) {
    const slot = mesh.userData.slot;
    plaqueSession = { id: mesh.userData.artworkId, imageUrl: TEXTURE_IMAGES[slot.imageIndex] || IMAGES[slot.imageIndex] };
    document.body.classList.add('plaque-active');
  }
  const worldPos = new THREE.Vector3();
  mesh.getWorldPosition(worldPos);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
  const toPos = worldPos.clone().addScaledVector(normal, isPlaque ? PLAQUE_FOCUS_DISTANCE : 1.7);
  toPos.y = worldPos.y;

  const m = new THREE.Matrix4().lookAt(toPos, worldPos, camera.up);
  const toQuat = new THREE.Quaternion().setFromRotationMatrix(m);

  clearInput();
  camera.position.copy(player.state.position);
  savedYaw = yaw; savedPitch = pitch;
  roamReturn = { pos: camera.position.clone(), quat: camera.quaternion.clone() };
  setZoomHeld(false);
  setArtHintVisible(false);
  document.body.classList.add('focused');
  focusState = {
    phase: 'toArt', t: 0,
    kind: isPlaque ? 'plaque' : 'art',
    fromPos: camera.position.clone(),
    fromQuat: camera.quaternion.clone(),
    toPos, toQuat,
  };
  roamEnabled = false;
}

function closeGuestPlaque() {
  guestbook.close();
  unfocus();
  // Request within the close click gesture; a denied lock falls back to Resume.
  lockPointer();
  syncMuseumAudioState();
}

function unfocus() {
  if (!focusState || focusState.phase === 'returning' || !roamReturn) return;
  clearInput();
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
  guestbook.close();
  plaqueSession = null;
  document.body.classList.remove('plaque-active');
  if (focusState || roamReturn) {        // only when actually focused
    if (roamReturn) camera.position.copy(roamReturn.pos);
    yaw = savedYaw; pitch = savedPitch;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
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
  if (focusState.t >= 1 && focusState.phase === 'toArt' && focusState.kind === 'plaque') {
    focusState.phase = 'readingPlaque';
    guestbook.open(plaqueSession);
    document.exitPointerLock();
    syncMuseumAudioState();
  }
  if (focusState.t >= 1 && focusState.phase === 'returning') {
    yaw = savedYaw; pitch = savedPitch;   // hand control back to mouse-look
    roamEnabled = true;
    focusState = null;
    roamReturn = null;
    plaqueSession = null;
    document.body.classList.remove('plaque-active');
    enterEl.inert = isLocked();
    if (!isLocked() && entered) enterGo.textContent = T('继续参观', 'Resume visit', '관람 계속');
  }
});

updaters.push(updateSpeakerPool);

updaters.push(() => {
  if (!isLocked() || focusState) {
    setArtHintVisible(false);
    return;
  }
  const hit = getAimedArtworkHit();
  artHintCaption.textContent = hit?.object.userData.kind === 'plaque'
    ? T('取名 · 评论', 'Names · Comments', '이름 · 댓글') : '';
  setArtHintVisible(Boolean(hit));
});

/* ---- pointer-lock lifecycle: the #enter overlay IS the pause menu ---- */
document.addEventListener('pointerlockchange', () => {
  const locked = isLocked();
  clearInput();
  ignoreNextLook = true;
  enterEl.inert = locked || Boolean(plaqueSession && focusState?.phase === 'readingPlaque');
  document.body.classList.toggle('locked', locked);
  resetFrameTiming();
  syncMuseumAudioState();
  if (locked) {
    runtimeStatus.textContent = '';
    enterGo.blur();
  }
  if (!locked) {
    // A plaque deliberately releases the mouse so its text fields can be used.
    if (plaqueSession && focusState?.phase === 'readingPlaque') return;
    cancelFocus();                       // resume cleanly next time
    camera.fov = CAMERA_FOV;
    camera.updateProjectionMatrix();
    if (entered) enterGo.textContent = T('继续参观', 'Resume visit', '관람 계속');
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

window.addEventListener('blur', () => {
  clearInput();
  if (isLocked()) document.exitPointerLock();
});
document.addEventListener('visibilitychange', () => {
  clearInput();
  syncMuseumAudioState();
  if (document.hidden) {
    renderer.setAnimationLoop(null);
    if (isLocked()) document.exitPointerLock();
  } else if (looping) {
    resetFrameTiming();
    renderer.setAnimationLoop(frame);
  }
});

canvas.addEventListener('click', (e) => {
  if (e.button === 0) inspectArtwork();
});

function inspectArtwork() {
  if (!isLocked()) return;
  if (focusState) { unfocus(); return; }
  const hit = getAimedArtworkHit();
  if (hit) focusOn(hit.object);
}

// Lock the pointer requesting RAW mouse input (unadjustedMovement) — this is
// the real fix for the "fling": it bypasses the Windows mouse-acceleration that
// balloons movementX on a fast flick. Falls back to a plain lock if unsupported.
let lockPending = false;
function reportPointerLockFailure() {
  runtimeStatus.textContent = T('无法启用鼠标视角控制。请再次点击进入展馆，或使用桌面浏览器。',
    'Mouse look is unavailable. Click Enter exhibition again, or use a desktop browser.',
    '마우스 시점 조절을 사용할 수 없습니다. 전시장 입장을 다시 누르거나 데스크톱 브라우저를 사용하세요.');
}
async function lockPointer() {
  if (lockPending || isLocked()) return;
  lockPending = true;
  runtimeStatus.textContent = '';
  try {
    try {
      await canvas.requestPointerLock({ unadjustedMovement: true });
    } catch (error) {
      // Retry only unsupported raw input; an Esc/security rejection needs a fresh click.
      if (error.name !== 'NotSupportedError') throw error;
      await canvas.requestPointerLock();
    }
  } catch (error) {
    reportPointerLockFailure();
  } finally {
    lockPending = false;
  }
}
document.addEventListener('pointerlockerror', () => {
  if (!lockPending) reportPointerLockFailure();
});

// Only the button enters: sliders, disclosure and keyboard settings never capture the pointer.
function enterPlay() {
  if (!preloaded) return;
  entered = true;
  startMuseumTrack();
  lockPointer();
}
enterGo.addEventListener('click', enterPlay);

/* ---- boot ---- */
async function boot() {
  try {
    await loadImageList();
  } catch (e) {
    fail(
      '暂无图片，或图片加载失败。请刷新重试。',
      'No images are available, or the images failed to load. Please reload and try again.',
      '이미지가 없거나 불러오지 못했습니다. 새로고침 후 다시 시도하세요.'
    );
    return;
  }
  const textureCount = Math.min(INITIAL_TEXTURE_COUNT, IMAGES.length);
  setProgress(0, textureCount);
  let done = 0;
  await preloadInitialTextures(() => setProgress(++done, textureCount));
  if (contextLost) return;
  prewarmMuseumTrack();
  enterProg.textContent = T('正在准备展馆…', 'Preparing exhibition…', '전시 준비 중…');
  buildHall();
  if (PERF_STILL || PERF_AUTOWALK) {
    // Reproducible fixed/walking views for visual QA without pointer capture.
    const params = new URLSearchParams(location.search);
    const readNumber = (name, fallback, min, max) => {
      const value = Number(params.get(name) ?? fallback);
      return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    };
    camera.position.z = readNumber('z', 0, -80, 0);
    pitch = readNumber('pitch', 0, -1.2, 1.2);
    yaw = readNumber('yaw', 0, -Math.PI, Math.PI);
    player.reset(camera.position);
    recycleChunks();
    atmosphere.update(0);
  }
  void refreshPlaqueTitles();
  fixtureBatch = createMuseumFixtureBatch({ scene, fixtures: pictureLightFixtures, camera });
  bloomOcclusion = createMuseumBloomOcclusion(scene);
  try { connectMuseumTrack(); } catch (error) { reportMuseumTrackFailure(error); }
  await prewarmScene();
  if (contextLost) return;
  startLoop();        // render the hall behind the translucent start overlay
  updateTextureStreaming(true); // use the start overlay time to prepare the next visible batches
  readyToEnter();
  if (PERF_AUTOWALK || PERF_STILL) {
    entered = true;
    enterEl.hidden = true;
    resetFrameTiming();
  }
}
boot();
