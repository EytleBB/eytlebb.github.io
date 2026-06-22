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
