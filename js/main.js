/* ============================================================
   This is Eytle — app logic
   Skin redesigned; skeleton preserved: DATA single source,
   patch-log calendar + .txt, auto gallery, 3-lang i18n, theme.
   ============================================================ */

/* ============================================================
   DATA — single source of truth
   ============================================================ */
const DATA = {
  about: {
    email: '3035986089@qq.com',
    github: 'https://github.com/EytleBB'
  },

  projects: [
    {
      id: 'csai',
      name: 'CSAI', nameEn: 'CSAI', nameKo: 'CSAI',
      github: 'https://github.com/EytleBB',
      sub: [
        { name: 'CS Scout',            nameKo: 'CS 스카우트',  github: 'https://github.com/EytleBB/CS-Scout' },
        { name: 'CS Prophet',          nameKo: 'CS 프로핏',    github: 'https://github.com/EytleBB/CS-Prophet' },
        { name: 'CS HLTV Downloader',  nameKo: 'CS HLTV 다운로더', github: 'https://github.com/EytleBB/CS-HLTV_Downloader' }
      ]
    }
  ],

  tools: [
    {
      name: 'MC 要塞定位器', nameEn: 'MC Stronghold Finder', nameKo: 'MC 요새 찾기',
      url: './mc-calc.html', external: false,
      icon: 'images/Eye_of_Ender.png'   // Eye of Ender — ONLY here
    }
  ],

  gallery: [],   // built from images/gallery/index.json (auto-maintained)
  patchlog: [],  // built from logs/index.json (auto-maintained)

  downloads: [
    { name: '730', meta: 'Updated: 2025-12-20', icon: '📦', url: './files/730.zip' },
    {
      name: 'Minecraft 1.21.8 生存存档',
      nameEn: 'Minecraft 1.21.8 Survival World',
      nameKo: 'Minecraft 1.21.8 서바이벌 월드',
      meta: '夸克网盘', metaEn: 'Quark Drive', metaKo: 'Quark 드라이브',
      icon: '⛏️', url: 'https://pan.quark.cn/s/364c986a6e70'
    }
  ]
};

/* ============================================================
   MESSAGE FORM BACKEND
   Web3Forms is a static-friendly form→email relay. The access
   key is a PUBLIC submit token bound to one inbox (spam-filtered),
   not a secret — safe to ship in a static page. Create a free key
   at https://web3forms.com and paste it below. Leave '' and the
   form simply acknowledges locally without sending.
   ============================================================ */
const MSG_CONFIG = { web3formsKey: '' };

/* ============================================================
   STATE
   ============================================================ */
let lang  = localStorage.getItem('lang')  || 'zh';     // 'zh' | 'en' | 'ko'
let theme = localStorage.getItem('theme') || 'night';  // 'night' | 'day'
if (!['zh', 'en', 'ko'].includes(lang)) lang = 'zh';
if (!['night', 'day'].includes(theme)) theme = 'night';   // migrate old dark/light
let activeSection = 'about';
let galleryLoaded = false;
let logsLoaded = false;

const navMap = ['about', 'projects', 'tools', 'patchlog', 'gallery', 'downloads'];

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

/* ============================================================
   DOM
   ============================================================ */
const stage       = document.getElementById('stage');
const overlayRoot = document.getElementById('overlay-root');

/* ============================================================
   I18N
   ============================================================ */
function t(zh, en, ko) {
  if (lang === 'zh') return zh;
  if (lang === 'ko') return ko || en || zh;
  return en || zh;
}
function pick(o, base) {  // localized name from a DATA object
  if (lang === 'zh') return o[base];
  if (lang === 'ko') return o[base + 'Ko'] || o[base + 'En'] || o[base];
  return o[base + 'En'] || o[base];
}
function fmtDot(dateStr) { return dateStr.replace(/-/g, '.'); }  // 2026-06-03 → 2026.06.03

/* ============================================================
   DATA LOADERS (auto-maintained indexes)
   ============================================================ */
async function loadGallery() {
  if (galleryLoaded) return;
  try {
    const res = await fetch('./images/gallery/index.json');
    if (res.ok) {
      const files = await res.json();
      DATA.gallery = files.map(f => ({ src: `images/gallery/${encodeURIComponent(f)}` }));
    }
  } catch {}
  galleryLoaded = true;
}
async function loadLogs() {
  if (logsLoaded) return;
  try {
    const res = await fetch('./logs/index.json');
    if (res.ok) DATA.patchlog = await res.json();
  } catch {}
  logsLoaded = true;
}

/* ============================================================
   RENDER — about / home
   ============================================================ */
async function renderAbout() {
  stage.innerHTML = `
    <header class="hero">
      <h1>This is <em>Eytle</em></h1>
      <div class="url">eytle.cn</div>
    </header>
    <section class="grid2">
      <div class="col-left">
        <div class="panel plog-card" id="home-plog">
          <div class="eyebrow">${t('最新 · Patch Log', 'Latest · Patch Log', '최신 · Patch Log')}</div>
          <div class="r-loading placeholder-text">${t('加载中…','Loading…','로딩 중…')}</div>
        </div>
        <div class="panel">
          <div class="eyebrow">${t('给 Eytle 留言', 'Leave Eytle a message', 'Eytle에게 메시지')}</div>
          <textarea id="msg-text" class="msg-text" maxlength="140"
            placeholder="${t('写点什么…','Write something…','내용을 입력하세요…')}"></textarea>
          <input type="text" id="msg-hp" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true" />
          <div class="msg-row">
            <span class="msg-count" id="msg-count">0 / 140</span>
            <button class="msg-send" id="msg-send">${t('发送','Send','보내기')}</button>
          </div>
          <div class="msg-hint" id="msg-hint" aria-live="polite"></div>
        </div>
      </div>
      <div class="col-right">
        <div class="eyebrow">${t('画廊','Gallery','갤러리')}</div>
        <div class="gal" id="home-gal"></div>
      </div>
    </section>
  `;

  wireMessageForm();

  // latest patch log (real content, no fabrication)
  await loadLogs();
  const card = document.getElementById('home-plog');
  if (DATA.patchlog.length) {
    const latest = DATA.patchlog[0];               // index.json is newest-first
    let body = '';
    try {
      const r = await fetch(`./logs/${latest}.txt`);
      if (r.ok) body = (await r.text()).trim();
    } catch {}
    card.innerHTML = `
      <div class="eyebrow">${t('最新 · Patch Log', 'Latest · Patch Log', '최신 · Patch Log')}</div>
      <div class="date">${fmtDot(latest)}</div>
      <p class="txt">${escapeHtml(body)}</p>
      <button class="more" id="home-plog-more">${t('读全文 →','Read more →','전문 읽기 →')}</button>
    `;
    document.getElementById('home-plog-more').addEventListener('click', () => openReader(latest));
  } else {
    card.querySelector('.r-loading').textContent = t('暂无随笔','Nothing yet','아직 없음');
  }

  // gallery preview — newest few, shuffled (concept uses 6)
  await loadGallery();
  const gal = document.getElementById('home-gal');
  if (DATA.gallery.length) {
    const idx = DATA.gallery.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    gal.innerHTML = idx.slice(0, 6)
      .map(i => `<img src="${DATA.gallery[i].src}" alt="" loading="lazy" data-idx="${i}" />`).join('');
    gal.querySelectorAll('img').forEach(im =>
      im.addEventListener('click', () => openLightbox(Number(im.dataset.idx))));
  } else {
    gal.innerHTML = `<p class="placeholder-text">${t('暂无图片','No images yet','이미지 없음')}</p>`;
  }
}

/* ============================================================
   RENDER — projects (with inline sub-projects)
   ============================================================ */
function renderProjects() {
  const items = DATA.projects.map(p => {
    const hasSub = p.sub && p.sub.length;
    return `
      <button class="list-item" data-proj="${p.id}">
        <span class="label">${escapeHtml(pick(p, 'name'))}</span>
        <span class="right">
          ${hasSub ? `<span class="badge">${p.sub.length} ${t('子项目','sub','하위')}</span>` : ''}
          ${chev()}
        </span>
      </button>`;
  }).join('');

  stage.innerHTML = `
    <div><div class="eyebrow">${t('项目','Projects','프로젝트')}</div>
    <div class="list">${items || placeholder(t('暂无项目','No projects yet','프로젝트 없음'))}</div>
    <div id="proj-sub"></div></div>`;

  stage.querySelectorAll('.list-item[data-proj]').forEach(btn =>
    btn.addEventListener('click', () => handleProjectClick(btn.dataset.proj)));
}

function handleProjectClick(id) {
  const proj = DATA.projects.find(p => p.id === id);
  if (!proj) return;
  const sub = document.getElementById('proj-sub');
  stage.querySelectorAll('.list-item[data-proj]').forEach(b => b.classList.toggle('on', b.dataset.proj === id));

  if (proj.sub && proj.sub.length) {
    sub.innerHTML = `
      <div class="list-sub">
        <div class="eyebrow">${escapeHtml(pick(proj, 'name'))} · ${t('子项目','Sub-projects','하위 프로젝트')}</div>
        <div class="list">${proj.sub.map(s => `
          <a class="list-item" href="${s.github}" target="_blank" rel="noopener">
            <span class="label">${escapeHtml(pick(s, 'name'))}</span>
            <span class="right">${extIcon()}</span>
          </a>`).join('')}</div>
      </div>`;
  } else {
    sub.innerHTML = '';
    window.open(proj.github, '_blank', 'noopener');
  }
}

/* ============================================================
   RENDER — tools
   ============================================================ */
function renderTools() {
  const items = DATA.tools.map(tool => `
    <a class="list-item" href="${tool.url}" ${tool.external === false ? '' : 'target="_blank" rel="noopener"'}>
      <span class="label">
        ${tool.icon ? `<img class="tool-ico" src="${tool.icon}" alt="" />` : ''}
        ${escapeHtml(pick(tool, 'name'))}
      </span>
      <span class="right">${chev()}</span>
    </a>`).join('');

  stage.innerHTML = `
    <div><div class="eyebrow">${t('工具','Tools','도구')}</div>
    <div class="list">${items || placeholder(t('暂无工具','No tools yet','도구 없음'))}</div></div>`;
}

/* ============================================================
   RENDER — downloads
   ============================================================ */
function renderDownloads() {
  const items = DATA.downloads.map(dl => `
    <a class="dl-item" href="${dl.url}" target="_blank" rel="noopener">
      <span class="dl-ico">${dl.icon}</span>
      <span class="dl-info">
        <p class="dl-name">${escapeHtml(pick(dl, 'name'))}</p>
        <p class="dl-meta">${escapeHtml(pick(dl, 'meta') || dl.meta || '')}</p>
      </span>
      <svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    </a>`).join('');

  stage.innerHTML = `<div><div class="eyebrow">${t('下载','Downloads','다운로드')}</div>${items}</div>`;
}

/* ============================================================
   RENDER — patch log calendar
   ============================================================ */
const MONTH_ZH = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
const MONTH_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const DAY_ZH = ['一','二','三','四','五','六','日'];
const DAY_EN = ['Mo','Tu','We','Th','Fr','Sa','Su'];
const DAY_KO = ['월','화','수','목','금','토','일'];

async function renderPatchlog() {
  await loadLogs();
  const now = new Date();
  const todayStr = fmtDate(now);

  let months = '';
  let y = 2026, m = 2;                       // calendar starts 2026-03 (earliest log)
  const endY = now.getFullYear(), endM = now.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    months += buildMonth(y, m, todayStr);
    m++; if (m > 11) { m = 0; y++; }
  }

  stage.innerHTML = `
    <div><div class="eyebrow">${t('斑驳日志','Patch Log','Patch Log')}</div>
    <div class="cal-wrap">${months}</div></div>`;

  stage.querySelectorAll('.cal-day-entry').forEach(el =>
    el.addEventListener('click', () => openReader(el.dataset.date)));
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildMonth(year, month, todayStr) {
  const label = lang === 'zh' ? `${year}年 ${MONTH_ZH[month]}`
              : lang === 'ko' ? `${year}년 ${MONTH_KO[month]}`
              : `${MONTH_EN[month]} ${year}`;
  const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7;   // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const nowTime = new Date(); nowTime.setHours(0, 0, 0, 0);

  const heads = (lang === 'zh' ? DAY_ZH : lang === 'ko' ? DAY_KO : DAY_EN)
    .map(h => `<div class="cal-head">${h}</div>`).join('');

  let cells = '';
  for (let i = 0; i < firstOffset; i++) cells += '<div class="cal-day cal-blank"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const hasLog = DATA.patchlog.includes(ds);
    const isToday = ds === todayStr;
    const future = new Date(year, month, d) > nowTime;
    let cls = 'cal-day';
    if (hasLog) cls += ' cal-day-entry';
    if (isToday) cls += ' cal-day-today';
    if (future) cls += ' cal-day-future';
    cells += hasLog ? `<div class="${cls}" data-date="${ds}">${d}</div>` : `<div class="${cls}">${d}</div>`;
  }
  return `<div class="cal-month"><p class="cal-month-label">${label}</p><div class="cal-grid">${heads}${cells}</div></div>`;
}

/* ============================================================
   RENDER — gallery grid
   ============================================================ */
async function renderGallery() {
  await loadGallery();
  if (!DATA.gallery.length) {
    stage.innerHTML = `<div><div class="eyebrow">${t('画廊','Gallery','갤러리')}</div>
      ${placeholder(t('暂无图片','No images yet','이미지 없음'))}</div>`;
    return;
  }
  stage.innerHTML = `
    <div><div class="eyebrow">${t('画廊','Gallery','갤러리')}</div>
    <div class="gallery-grid">${DATA.gallery.map((img, i) =>
      `<img src="${img.src}" alt="" loading="lazy" data-idx="${i}" />`).join('')}</div></div>`;
  stage.querySelectorAll('.gallery-grid img').forEach(im =>
    im.addEventListener('click', () => openLightbox(Number(im.dataset.idx))));
}

/* ============================================================
   OVERLAYS — patch reader + gallery lightbox
   ============================================================ */
function mountOverlay(inner, extraClass) {
  overlayRoot.innerHTML = `
    <div class="overlay ${extraClass || ''}" id="ov">
      <button class="ov-close" id="ov-close">✕ ${t('关闭','Close','닫기')}</button>
      ${inner}
    </div>`;
  const ov = document.getElementById('ov');
  const close = () => { overlayRoot.innerHTML = ''; document.removeEventListener('keydown', onEsc); };
  function onEsc(e) { if (e.key === 'Escape') close(); }
  document.getElementById('ov-close').addEventListener('click', close);
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  document.addEventListener('keydown', onEsc);
  return close;
}

async function openReader(dateStr) {
  mountOverlay(`
    <div class="reader" role="dialog" aria-modal="true">
      <div class="r-date">${fmtDot(dateStr)}</div>
      <div class="r-body" id="r-body">${t('加载中…','Loading…','로딩 중…')}</div>
    </div>`, 'reader-ov');
  const body = document.getElementById('r-body');
  try {
    const r = await fetch(`./logs/${dateStr}.txt`);
    if (!r.ok) throw new Error(r.status);
    body.textContent = (await r.text()).trim();
  } catch {
    body.textContent = t('日志加载失败','Failed to load log','로그 로드 실패');
  }
}

function openLightbox(idx) {
  const img = DATA.gallery[idx];
  if (!img) return;
  mountOverlay(`<div class="lightbox"><img src="${img.src}" alt="" /></div>`, 'lightbox-ov');
}

/* ============================================================
   MESSAGE FORM
   ============================================================ */
function wireMessageForm() {
  const box = document.getElementById('msg-text');
  const cnt = document.getElementById('msg-count');
  const btn = document.getElementById('msg-send');
  const hint = document.getElementById('msg-hint');
  const hp = document.getElementById('msg-hp');
  if (!box) return;

  const upd = () => { cnt.textContent = `${box.value.length} / 140`; };
  box.addEventListener('input', upd); upd();

  btn.addEventListener('click', async () => {
    const text = box.value.trim();
    if (!text) { hint.textContent = t('请先写点内容','Write something first','먼저 내용을 입력하세요'); box.focus(); return; }
    if (hp.value) return;   // honeypot tripped → silently drop

    if (!MSG_CONFIG.web3formsKey) {        // no backend configured → acknowledge locally
      hint.textContent = t('留言已记录','Message recorded','메시지가 기록됨');
      box.value = ''; upd(); return;
    }

    btn.disabled = true;
    hint.textContent = t('发送中…','Sending…','보내는 중…');
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          access_key: MSG_CONFIG.web3formsKey,
          subject: 'eytle.cn 留言',
          message: text,
          from_page: 'eytle.cn',
          botcheck: hp.value
        })
      });
      const data = await res.json();
      if (data.success) { hint.textContent = t('留言已记录','Message recorded','메시지가 기록됨'); box.value = ''; upd(); }
      else throw new Error(data.message || 'failed');
    } catch {
      hint.textContent = t('发送失败，请稍后再试','Send failed, try again later','전송 실패, 나중에 다시 시도');
    } finally {
      btn.disabled = false;
    }
  });
}

/* ============================================================
   SMALL HTML HELPERS
   ============================================================ */
function chev() {
  return `<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
}
function extIcon() {
  return `<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
}
function placeholder(txt) { return `<p class="placeholder-text">${escapeHtml(txt)}</p>`; }
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function go(section) {
  if (!navMap.includes(section)) section = 'about';
  activeSection = section;
  if (location.hash.slice(1) !== section) history.replaceState(null, '', '#' + section);
  document.querySelectorAll('.nav-i').forEach(b => b.classList.toggle('on', b.dataset.section === section));
  overlayRoot.innerHTML = '';
  switch (section) {
    case 'about':     renderAbout();     break;
    case 'projects':  renderProjects();  break;
    case 'tools':     renderTools();     break;
    case 'patchlog':  renderPatchlog();  break;
    case 'gallery':   renderGallery();   break;
    case 'downloads': renderDownloads(); break;
    default:          renderAbout();
  }
}

/* ============================================================
   LANGUAGE
   ============================================================ */
function applyLang() {
  document.querySelectorAll('.nav-i').forEach((b, i) => {
    b.querySelector('span').textContent =
      lang === 'zh' ? b.dataset.zh : lang === 'ko' ? (b.dataset.ko || b.dataset.en) : b.dataset.en;
  });
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
  document.documentElement.lang = lang === 'zh' ? 'zh' : lang;
  lampLabel();
  go(activeSection);   // re-render active section in new language
}

/* ============================================================
   THEME — "lights on / off"
   ============================================================ */
function lampLabel() {
  const night = document.documentElement.getAttribute('data-theme') === 'night';
  document.getElementById('lamp-ico').textContent = night ? '☀' : '☾';
  document.getElementById('lamp-tx').textContent =
    { zh: night ? '开灯' : '关灯', en: night ? 'Lights on' : 'Lights off', ko: night ? '불 켜기' : '불 끄기' }[lang];
}
function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme);
  lampLabel();
}

/* ============================================================
   INIT
   ============================================================ */
document.querySelectorAll('.nav-i').forEach(b => b.addEventListener('click', () => {
  const section = b.dataset.section;
  if (section === 'gallery' && isMuseumCapable()) { location.href = 'museum.html'; return; }
  go(section);
}));
document.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => {
  lang = b.dataset.lang; localStorage.setItem('lang', lang); applyLang();
}));
document.getElementById('lamp').addEventListener('click', () => {
  theme = theme === 'night' ? 'day' : 'night';
  localStorage.setItem('theme', theme); applyTheme();
});
document.getElementById('home-btn').addEventListener('click', () => go('about'));
window.addEventListener('hashchange', () => { const s = location.hash.slice(1); if (s && s !== activeSection) go(s); });

// Boot
const initial = location.hash.slice(1);
if (navMap.includes(initial)) activeSection = initial;
applyTheme();
applyLang();   // sets nav labels + renders the active section
