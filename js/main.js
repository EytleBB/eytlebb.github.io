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
    },
    {
      id: 'this-is-eytle',
      name: 'This is Eytle', nameEn: 'This is Eytle', nameKo: 'This is Eytle',
      github: 'https://github.com/EytleBB/eytlebb.github.io',
      sub: [
        { name: '图画展览会', nameEn: 'Pictures At An Exhibition', nameKo: '전람회의 그림', github: 'https://github.com/EytleBB/Eytle-Museum' },
        { name: 'Patch Log', nameKo: '패치 로그', github: 'https://github.com/EytleBB/Eytle-Patch-Log' }
      ]
    },
    {
      id: 'casual-projects',
      name: 'Casual Projects', nameEn: 'Casual Projects', nameKo: 'Casual Projects',
      github: 'https://github.com/EytleBB',
      sub: [
        {
          name: '抖音直播语音助手', nameEn: 'Douyin Live Voice', nameKo: '더우인 라이브 음성 도우미',
          github: 'https://github.com/EytleBB/douyin-live-voice'
        },
        {
          name: '抖音门卫', nameEn: 'Douyin Chat Guard', nameKo: '더우인 채팅 가드',
          github: 'https://github.com/EytleBB/douyinchat'
        },
        {
          name: 'Android 连点器', nameEn: 'Android Auto Clicker', nameKo: 'Android 자동 클릭기',
          github: 'https://github.com/EytleBB/AndroidAC'
        },
        {
          name: '校园一卡通', nameEn: 'Campus One Card', nameKo: '캠퍼스 원카드',
          github: 'https://github.com/EytleBB/one-card'
        }
      ]
    }
  ],

  tools: [
    {
      name: 'CS-Scout', nameEn: 'CS-Scout', nameKo: 'CS-Scout',
      url: 'https://scout.eytle.cn/', external: true,
      icon: 'images/cs-scout-icon.webp'
    },
    {
      name: 'MC 要塞定位器', nameEn: 'MC Stronghold Finder', nameKo: 'MC 요새 찾기',
      url: '/mc-calc', external: false,
      icon: 'images/Eye_of_Ender.png'   // Eye of Ender — ONLY here
    }
  ],

  gallery: [],   // built from images/gallery/index.json (auto-maintained)
  patchlog: [],  // built from logs/index.json (auto-maintained)

  downloads: [
    {
      name: '抖音直播语音助手', nameEn: 'Douyin Live Voice', nameKo: '더우인 라이브 음성 도우미',
      meta: 'Windows x64 · v0.1.1 · 2026-07-16',
      icon: '🎙️', url: 'https://github.com/EytleBB/douyin-live-voice/releases/latest'
    },
    {
      name: '抖音门卫', nameEn: 'Douyin Chat Guard', nameKo: '더우인 채팅 가드',
      meta: 'Android APK · v0.1.0 · 2026-07-11',
      icon: '🛡️', url: 'https://github.com/EytleBB/douyinchat/releases/latest'
    },
    {
      name: 'Android 连点器', nameEn: 'Android Auto Clicker', nameKo: 'Android 자동 클릭기',
      meta: 'Android APK · v1.0.0 · 2026-07-11',
      icon: '⚙️', url: 'https://github.com/EytleBB/AndroidAC/releases/latest'
    },
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
   form keeps the draft and reports that sending is unavailable.
   ============================================================ */
const MSG_CONFIG = { web3formsKey: '918bb7ac-52b3-4b34-8e20-7bbf4e897e20' };

/* ============================================================
   STATE
   ============================================================ */
let lang  = localStorage.getItem('lang')  || 'zh';     // 'zh' | 'en' | 'ko'
let theme = localStorage.getItem('theme') || 'night';  // 'night' | 'day'
if (!['zh', 'en', 'ko'].includes(lang)) lang = 'zh';
if (!['night', 'day'].includes(theme)) theme = 'night';   // migrate old dark/light
let activeSection = 'about';
let galleryLoaded = false;
let patchlogSelection = { year: null, month: null };
let patchlogLoadError = false;
let logLoadRequest = 0;
let lastReadLog = null;
const GALLERY_BATCH_SIZE = 18;
const GALLERY_CACHE = 'eytle-gallery-v1';
const GALLERY_PREVIEW_INDEX = './images/gallery-preview/index.json';
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

const navMap = ['about', 'projects', 'tools', 'patchlog', 'gallery', 'downloads'];
const sectionPaths = Object.freeze({
  about: '/', projects: '/projects', tools: '/tools',
  patchlog: '/patchlog', gallery: '/gallery', downloads: '/downloads'
});

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
function normalizeLogBody(text) { return text.trimEnd(); }       // preserve intentional leading indentation

/* ============================================================
   DATA LOADERS (auto-maintained indexes)
   ============================================================ */
async function loadGallery() {
  if (galleryLoaded) return true;
  try {
    const [galleryResponse, previewResponse] = await Promise.all([
      fetch('./images/gallery/index.json', { cache: 'no-cache' }),
      fetch(GALLERY_PREVIEW_INDEX, { cache: 'no-cache' }).catch(() => null),
    ]);
    if (!galleryResponse.ok) throw new Error(`gallery index ${galleryResponse.status}`);
    const files = await galleryResponse.json();
    let previewItems = {};
    if (previewResponse?.ok) {
      const manifest = await previewResponse.json();
      if (manifest && typeof manifest.items === 'object') previewItems = manifest.items;
    }
    if (!Array.isArray(files)) throw new Error('Invalid gallery index');
    DATA.gallery = files.map((f) => {
      const baseSrc = `images/gallery/${encodeURIComponent(f)}`;
      const previewMeta = previewItems[f];
      if (!previewMeta || typeof previewMeta.preview !== 'string') {
        return { src: baseSrc, preview: baseSrc, width: 1, height: 1, bytes: 0 };
      }
      const version = typeof previewMeta.sourceHash === 'string'
        ? `?v=${encodeURIComponent(previewMeta.sourceHash.slice(0, 12))}`
        : '';
      return {
        src: `${baseSrc}${version}`,
        preview: `images/gallery-preview/${encodeURIComponent(previewMeta.preview)}${version}`,
        width: Number(previewMeta.width) || 1,
        height: Number(previewMeta.height) || 1,
        bytes: Number(previewMeta.sourceBytes) || 0,
      };
    });
    galleryLoaded = true;
    return true;
  } catch { return false; }
}

function selectHomeGallery() {
  const available = Array.from(DATA.gallery.keys());
  const selected = [];
  while (available.length && selected.length < 3) {
    const choice = Math.floor(Math.random() * available.length);
    selected.push({ index: available.splice(choice, 1)[0] });
  }
  return selected;
}

async function cacheGalleryImages(images) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(GALLERY_CACHE);
    await Promise.all(images.map(async ({ src, preview }) => {
      const resource = preview || src;
      if (await cache.match(resource)) return;
      const response = await fetch(resource);
      if (response.ok) await cache.put(resource, response);
    }));
  } catch {}
}

function wireGalleryImages(root) {
  root.querySelectorAll('[data-idx]').forEach(item =>
    item.addEventListener('click', () => openLightbox(Number(item.dataset.idx))));
}
async function loadLogs() {
  const request = ++logLoadRequest;
  try {
    const res = await fetch('./logs/index.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`log index ${res.status}`);
    const dates = await res.json();
    if (!Array.isArray(dates)) throw new Error('Invalid log index');
    if (request !== logLoadRequest) return false;
    DATA.patchlog = getLogDates(dates);
    patchlogLoadError = false;
    return true;
  } catch {
    if (request === logLoadRequest) patchlogLoadError = true;
    return false;
  }
}

/* ============================================================
   RENDER — about / home
   ============================================================ */
async function renderAbout() {
  const epoch = stageRenderEpoch;
  stage.innerHTML = `
    <header class="hero">
      <div class="hero-topline"><span class="hero-status"><i></i>${t('Eytle 的个人网站','Eytle’s personal website','Eytle의 개인 웹사이트')}</span></div>
      <div class="hero-copy">
        <h1><span>This is</span><em>Eytle<span class="hero-period">.</span></em></h1>
        <p class="hero-description">${t('这里放我的项目、工具、日志和图片。','My projects, tools, logs and pictures.','제 프로젝트, 도구, 일지와 이미지를 모아 둔 곳입니다.')}</p>
        <button class="hero-link" id="home-explore"><span>${t('查看内容','View content','내용 보기')}</span>${siteIcon('chevron-down', '', 'arrow-down')}</button>
      </div>
      <div class="hero-bottom"><span class="hero-scroll">${t('向下浏览','Scroll down','아래로 스크롤')} <i>↓</i></span></div>
    </header>
    <div class="home-body" id="home-content">
    <div class="home-section-heading"><h2>${t('日志与图片','Logs and pictures','일지와 이미지')}</h2></div>
    <section class="grid2">
      <div class="col-left">
        <div class="panel plog-card" id="home-plog">
          <div class="eyebrow">${t('最新日志', 'Latest entry', '최신 일지')}</div>
          <div class="r-loading placeholder-text">${t('加载中…','Loading…','로딩 중…')}</div>
        </div>
        <button class="home-archive-link" data-home-section="patchlog">${t('所有日志','All entries','모든 일지')} ${siteIcon('arrow-up-right')}</button>
        <div class="panel message-card">
          <div class="message-heading"><label for="msg-text" class="message-title">${t('给 Eytle 留言', 'Message Eytle', 'Eytle에게 메시지')}</label></div>
          <textarea id="msg-text" class="msg-text" maxlength="140"
            aria-describedby="msg-count msg-hint"
            placeholder="${t('输入留言…','Enter your message…','메시지를 입력하세요…')}"></textarea>
          <input type="text" id="msg-hp" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true" />
          <div class="msg-row">
            <span class="msg-count" id="msg-count">0 / 140</span>
            <button class="msg-send" id="msg-send">
              <span class="msg-send-label">${t('发送','Send','보내기')}</span>
              ${siteIcon('plane', 'msg-plane')}
            </button>
          </div>
          <div class="msg-hint" id="msg-hint" aria-live="polite"></div>
        </div>
      </div>
      <div class="col-right">
        <div class="gallery-heading"><h2>${t('图画展览会','Pictures At An Exhibition','전람회의 그림')}</h2></div>
        <div class="gal" id="home-gal" aria-busy="true">
          <span class="gal-placeholder" aria-hidden="true"></span><span class="gal-placeholder" aria-hidden="true"></span><span class="gal-placeholder" aria-hidden="true"></span>
          <span class="gallery-loading-label" role="status">${t('正在加载图片…','Loading pictures…','이미지를 불러오는 중…')}</span>
        </div>
        <div class="gallery-foot"><span id="home-gallery-count"></span><button id="home-exhibition">${t('查看展览','View exhibition','전시 보기')} ${siteIcon('arrow-right', '', 'arrow-up-right')}</button></div>
      </div>
    </section>
    </div>
  `;

  // Apply the hidden animation start state before the first async wait/paint.
  enhanceMotion(stage);
  wireMessageForm();
  document.getElementById('home-explore').addEventListener('click', () => {
    document.getElementById('home-content').scrollIntoView({ behavior: REDUCED_MOTION.matches ? 'instant' : 'smooth', block: 'start' });
  });
  document.getElementById('home-exhibition').addEventListener('click', () => {
    document.querySelector('.nav-i[data-section="gallery"]').click();
  });
  stage.querySelectorAll('[data-home-section]').forEach(button => {
    button.addEventListener('click', () => go(button.dataset.homeSection));
  });

  await Promise.all([renderHomeLog(epoch), renderHomeGallery(epoch)]);
}

async function renderHomeLog(epoch) {
  // Latest patch log (real content, no fabrication), independent of the gallery.
  const loaded = await loadLogs();
  if (epoch !== stageRenderEpoch) return;
  const card = document.getElementById('home-plog');
  if (!loaded) {
    card.querySelector('.r-loading').textContent = t('日志暂时无法加载，请稍后再试。','Entries could not be loaded. Please try again later.','일지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    return;
  }
  if (DATA.patchlog.length) {
    const latest = DATA.patchlog[0];               // index.json is newest-first
    let body = null;
    try {
      const r = await fetch(`./logs/${latest}.txt`, { cache: 'no-store' });
      if (r.ok) body = normalizeLogBody(await r.text());
    } catch {}
    if (epoch !== stageRenderEpoch) return;
    card.innerHTML = `
      <div class="eyebrow">${t('最新日志', 'Latest entry', '최신 일지')}</div>
      <div class="date">${fmtDot(latest)}</div>
      ${body === null
        ? `<p class="placeholder-text">${t('暂时无法读取摘要，可打开全文重试。','The preview is unavailable. Open the entry to try again.','미리보기를 불러오지 못했습니다. 전문을 열어 다시 시도해 주세요.')}</p>`
        : `<p class="txt">${escapeHtml(body)}</p>`}
      <button class="more" id="home-plog-more">${t('读全文','Read more','전문 읽기')}${siteIcon('chevron-right', '', 'arrow-right')}</button>
    `;
    document.getElementById('home-plog-more').addEventListener('click', () => openReader(latest));
  } else {
    card.querySelector('.r-loading').textContent = t('暂无日志','No entries yet','아직 일지가 없습니다');
  }
}

async function renderHomeGallery(epoch) {
  const loaded = await loadGallery();
  if (epoch !== stageRenderEpoch) return;
  const gal = document.getElementById('home-gal');
  gal.setAttribute('aria-busy', 'false');
  if (loaded === false) {
    gal.innerHTML = `<p class="placeholder-text" role="status">${t('图像暂时无法加载，请稍后再试。','Pictures could not be loaded. Please try again later.','이미지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')}</p>`;
    return;
  }
  document.getElementById('home-gallery-count').textContent = t(`共 ${DATA.gallery.length} 张图片`, `${DATA.gallery.length} pictures`, `이미지 ${DATA.gallery.length}장`);
  if (DATA.gallery.length) {
    gal.innerHTML = selectHomeGallery().map(({ index }) => {
      const image = DATA.gallery[index];
      const label = t(`查看图片 ${index + 1}`, `View picture ${index + 1}`, `이미지 ${index + 1} 보기`);
      return `<button class="gal-item" type="button" data-idx="${index}" aria-label="${escapeHtml(label)}">
        <img src="${escapeHtml(image.preview || image.src)}" alt="" width="${image.width || 1}" height="${image.height || 1}" loading="lazy" decoding="async" />
      </button>`;
    }).join('');
    wireGalleryImages(gal);
  } else {
    gal.innerHTML = `<p class="placeholder-text">${t('暂无图片','No images yet','이미지 없음')}</p>`;
  }
}

/* ============================================================
   RENDER — projects (with inline sub-projects)
   ============================================================ */
function sectionHeading(title, description = '') {
  return `<header class="section-heading"><h1>${escapeHtml(title)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ''}</header>`;
}

function renderProjects() {
  const items = DATA.projects.map(p => {
    const hasSub = p.sub && p.sub.length;
    return `
      <div class="project-group" data-proj-group="${p.id}">
        <button class="list-item" data-proj="${p.id}"${hasSub ? ' aria-expanded="false"' : ''}>
          <span class="label">${escapeHtml(pick(p, 'name'))}</span>
          <span class="right">
            ${hasSub ? `<span class="badge">${p.sub.length} ${t('子项目','sub','하위')}</span>` : ''}
            ${hasSub ? chev(false) : extIcon()}
          </span>
        </button>
        <div class="project-sub-slot" data-proj-sub="${p.id}"></div>
      </div>`;
  }).join('');

  stage.innerHTML = `
    <div class="collection-page">${sectionHeading(t('项目','Projects','프로젝트'), t('查看项目及 GitHub 源码。','View projects and their source code on GitHub.','프로젝트와 GitHub 소스 코드를 확인할 수 있습니다.'))}
    <div class="list">${items || placeholder(t('暂无项目','No projects yet','프로젝트 없음'))}</div></div>`;

  stage.querySelectorAll('.list-item[data-proj]').forEach(btn =>
    btn.addEventListener('click', () => handleProjectClick(btn.dataset.proj)));
}

function handleProjectClick(id) {
  const proj = DATA.projects.find(p => p.id === id);
  if (!proj) return;
  const button = [...stage.querySelectorAll('.list-item[data-proj]')]
    .find(b => b.dataset.proj === id);
  if (!button) return;

  if (proj.sub && proj.sub.length) {
    const shouldOpen = !button.classList.contains('on');
    stage.querySelectorAll('.list-item[data-proj]').forEach(b => {
      if (!b.hasAttribute('aria-expanded')) return;
      const open = shouldOpen && b === button;
      b.classList.toggle('on', open);
      b.setAttribute('aria-expanded', String(open));
      EytleIcons.set(b.querySelector('.chev'), open ? 'chevron-down' : 'chevron-right');
    });
    stage.querySelectorAll('.project-sub-slot').forEach(slot => { slot.innerHTML = ''; });
    if (!shouldOpen) return;

    const sub = button.closest('.project-group').querySelector('.project-sub-slot');
    sub.innerHTML = `
      <div class="list-sub">
        <div class="eyebrow">${escapeHtml(pick(proj, 'name'))} · ${t('子项目','Sub-projects','하위 프로젝트')}</div>
        <div class="list">${proj.sub.map(s => `
          <a class="list-item" href="${s.github}" target="_blank" rel="noopener">
            <span class="label">${escapeHtml(pick(s, 'name'))}</span>
            <span class="right">${extIcon()}</span>
          </a>`).join('')}</div>
      </div>`;
    enhanceMotion(sub);
  } else {
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
    <div class="collection-page">${sectionHeading(t('工具','Tools','도구'), t('在线工具，点击即可使用。','Click a tool to open it.','도구를 클릭하면 사용할 수 있습니다.'))}
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
      ${siteIcon('download', 'arrow')}
    </a>`).join('');

  stage.innerHTML = `<div class="collection-page">${sectionHeading(t('下载','Downloads','다운로드'), t('软件安装包和其他文件。','Software downloads and other files.','프로그램 설치 파일과 기타 파일입니다.'))}${items}</div>`;
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
  const epoch = stageRenderEpoch;
  renderPatchlogLevel({ loading: true });
  await loadLogs();
  if (epoch !== stageRenderEpoch) return;
  renderPatchlogLevel();
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getLogDates(dates = DATA.patchlog) {
  return [...new Set(dates.filter(date => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T12:00:00`);
    return !Number.isNaN(parsed.getTime()) && fmtDate(parsed) === date;
  }))].sort().reverse();
}

function buildPatchlogIndex() {
  const years = new Map();
  getLogDates().forEach(date => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) return;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    if (month < 0 || month > 11) return;
    if (!years.has(year)) years.set(year, new Map());
    const months = years.get(year);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(date);
  });

  return [...years.entries()]
    .sort(([left], [right]) => right - left)
    .map(([year, months]) => ({
      year,
      count: [...months.values()].reduce((total, dates) => total + dates.length, 0),
      months: [...months.entries()]
        .sort(([left], [right]) => right - left)
        .map(([month, dates]) => ({ month, dates: [...dates].sort().reverse() }))
    }));
}

function patchlogCount(count) {
  if (lang === 'zh') return `${count} 篇`;
  if (lang === 'ko') return `${count}개`;
  return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

function patchlogMonthLabel(year, month, includeYear = false) {
  if (lang === 'zh') return includeYear ? `${year}年 ${MONTH_ZH[month]}` : MONTH_ZH[month];
  if (lang === 'ko') return includeYear ? `${year}년 ${MONTH_KO[month]}` : MONTH_KO[month];
  return includeYear ? `${MONTH_EN[month]} ${year}` : MONTH_EN[month];
}

function patchlogBreadcrumb() {
  const { year, month } = patchlogSelection;
  const allYears = t('全部年份','All years','전체 연도');
  let html = year === null
    ? `<span class="patch-crumb-current">${allYears}</span>`
    : `<button class="patch-crumb" data-log-years>${allYears}</button>`;
  if (year !== null && month === null) {
    html += `<span class="patch-crumb-sep" aria-hidden="true">›</span>
      <span class="patch-crumb-current">${year}</span>`;
  } else if (month !== null) {
    html += `<span class="patch-crumb-sep" aria-hidden="true">›</span>
      <button class="patch-crumb" data-log-year-crumb>${year}</button>
      <span class="patch-crumb-sep" aria-hidden="true">›</span>
      <span class="patch-crumb-current">${patchlogMonthLabel(year, month)}</span>`;
  }
  return `<nav class="patch-breadcrumb" aria-label="${t('日志层级','Log hierarchy','로그 계층')}">${html}</nav>`;
}

function renderPatchlogLevel({ loading = false, focusSelector = null } = {}) {
  const index = buildPatchlogIndex();
  const selectedYear = index.find(item => item.year === patchlogSelection.year);
  if (patchlogSelection.year !== null && !selectedYear) {
    patchlogSelection = { year: null, month: null };
  } else if (selectedYear && patchlogSelection.month !== null
      && !selectedYear.months.some(item => item.month === patchlogSelection.month)) {
    patchlogSelection.month = null;
  }

  const totalCount = index.reduce((total, item) => total + item.count, 0);
  const latest = getLogDates()[0];
  const months = index.flatMap(item => item.months.map(month => ({ year: item.year, month: month.month })));
  let title = '';
  let content = '';
  if (loading) {
    content = `<p class="patch-status" role="status">${t('加载中…','Loading…','로딩 중…')}</p>`;
  } else if (!index.length && patchlogLoadError) {
    content = `<div class="patch-status" role="status">
      <p>${t('日志列表加载失败','Could not load the log list','로그 목록을 불러오지 못했습니다')}</p>
      <button class="patch-action" data-log-retry>${t('重试','Retry','다시 시도')}</button>
    </div>`;
  } else if (!index.length) {
    content = placeholder(t('暂无日志','No entries yet','아직 로그가 없습니다'));
  } else if (patchlogSelection.year === null) {
    content = `
      <div class="patch-level-title">
        <span>${t('年份','Years','연도')}</span>
        <span>${patchlogCount(totalCount)}</span>
      </div>
      <div class="patch-index-grid">${index.map(item => `
        <button class="patch-index-card" data-log-year="${item.year}">
          <span class="patch-index-copy">
            <span class="patch-index-main">${item.year}</span>
            <span class="patch-index-meta">${patchlogCount(item.count)}</span>
          </span>
          <span class="patch-index-arrow">${chev()}</span>
        </button>`).join('')}</div>`;
  } else if (patchlogSelection.month === null) {
    title = `${selectedYear.year}`;
    content = `
      <div class="patch-level-title">
        <span>${t('月份','Months','월')}</span>
        <span>${patchlogCount(selectedYear.count)}</span>
      </div>
      <div class="patch-index-grid">${selectedYear.months.map(item => `
        <button class="patch-index-card" data-log-month="${item.month}">
          <span class="patch-index-copy">
            <span class="patch-index-main">${patchlogMonthLabel(selectedYear.year, item.month)}</span>
            <span class="patch-index-meta">${patchlogCount(item.dates.length)}</span>
          </span>
          <span class="patch-index-arrow">${chev()}</span>
        </button>`).join('')}</div>`;
  } else {
    const selectedMonth = selectedYear.months.find(item => item.month === patchlogSelection.month);
    const monthIndex = months.findIndex(item => item.year === selectedYear.year && item.month === selectedMonth.month);
    const monthButton = (offset, symbol) => {
      const target = months[monthIndex + offset];
      const label = target
        ? t(`查看 ${patchlogMonthLabel(target.year, target.month, true)}`, `View ${patchlogMonthLabel(target.year, target.month, true)}`, `${patchlogMonthLabel(target.year, target.month, true)} 보기`)
        : offset > 0 ? t('没有更早的月份','No earlier month','이전 달 없음') : t('没有更新的月份','No later month','다음 달 없음');
      return `<button class="patch-month-step" data-log-step="${offset}" ${target ? '' : 'disabled'} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><span aria-hidden="true">${symbol}</span></button>`;
    };
    title = patchlogMonthLabel(selectedYear.year, selectedMonth.month, true);
    content = `
      <section class="patch-calendar-card" aria-label="${t('月历','Monthly calendar','월간 달력')}">
        <div class="patch-calendar-bar">
          ${monthButton(1, '←')}
          <span class="patch-calendar-legend"><i aria-hidden="true"></i>${patchlogCount(selectedMonth.dates.length)}</span>
          ${monthButton(-1, '→')}
        </div>
        <div class="cal-wrap">${buildMonth(
          selectedYear.year,
          selectedMonth.month,
          fmtDate(new Date()),
          new Set(selectedMonth.dates)
        )}</div>
      </section>`;
  }

  stage.innerHTML = `
    <div class="patchlog-shell">
      <header class="patchlog-header">
        <h1 class="patchlog-title" tabindex="-1">${title || t('斑驳日志','Patch Log','패치 로그')}</h1>
        <p class="section-description">${t('按年份、月份和日期查看日志。','Browse logs by year, month and date.','연도, 월, 날짜별로 일지를 볼 수 있습니다.')}</p>
      </header>
      <div class="patchlog-surface${patchlogSelection.month !== null ? ' patchlog-surface-calendar' : ''}">
        <div class="patch-toolbar">
          ${patchlogBreadcrumb()}
          ${latest && !loading ? `<button class="patch-latest" data-log-latest>${t('最新日志','Latest entry','최신 로그')} <time datetime="${latest}">${fmtDot(latest)}</time><span aria-hidden="true">↗</span></button>` : ''}
        </div>
        ${patchlogLoadError && index.length && !loading ? `<div class="patch-load-warning" role="status">${t('更新失败，当前显示上次加载的列表。','Refresh failed. Showing the last loaded list.','새로고침에 실패하여 이전 목록을 표시합니다.')} <button class="patch-action" data-log-retry>${t('重试','Retry','다시 시도')}</button></div>` : ''}
        <div class="patch-level">${content}</div>
      </div>
    </div>`;

  stage.querySelector('[data-log-years]')?.addEventListener('click', () => {
    const year = patchlogSelection.year;
    patchlogSelection = { year: null, month: null };
    renderPatchlogLevel({ focusSelector: `[data-log-year="${year}"]` });
  });
  stage.querySelector('[data-log-year-crumb]')?.addEventListener('click', () => {
    const month = patchlogSelection.month;
    patchlogSelection.month = null;
    renderPatchlogLevel({ focusSelector: `[data-log-month="${month}"]` });
  });
  stage.querySelectorAll('[data-log-year]').forEach(button =>
    button.addEventListener('click', () => {
      patchlogSelection = { year: Number(button.dataset.logYear), month: null };
      renderPatchlogLevel({ focusSelector: '.patchlog-title' });
    }));
  stage.querySelectorAll('[data-log-month]').forEach(button =>
    button.addEventListener('click', () => {
      patchlogSelection.month = Number(button.dataset.logMonth);
      renderPatchlogLevel({ focusSelector: '.patchlog-title' });
    }));
  stage.querySelectorAll('[data-log-step]').forEach(button =>
    button.addEventListener('click', () => {
      const current = months.findIndex(item => item.year === patchlogSelection.year && item.month === patchlogSelection.month);
      const target = months[current + Number(button.dataset.logStep)];
      if (!target) return;
      patchlogSelection = { ...target };
      renderPatchlogLevel({ focusSelector: `[data-log-step="${button.dataset.logStep}"]:not(:disabled)` });
    }));
  stage.querySelector('[data-log-latest]')?.addEventListener('click', () => openReader(latest));
  stage.querySelector('[data-log-retry]')?.addEventListener('click', async () => {
    const epoch = stageRenderEpoch;
    await renderPatchlog();
    if (epoch === stageRenderEpoch) stage.querySelector('[data-log-retry], .patchlog-title')?.focus({ preventScroll: true });
  });
  stage.querySelectorAll('.cal-day-entry').forEach(button =>
    button.addEventListener('click', () => openReader(button.dataset.date)));
  enhanceMotion(stage);
  if (focusSelector) {
    const target = stage.querySelector(focusSelector) || stage.querySelector('.patchlog-title');
    target?.focus({ preventScroll: true });
    if (target?.matches('.patchlog-title')) window.scrollTo({ top: 0, behavior: 'instant' });
    else target?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }
}

function buildMonth(year, month, todayStr, logDates) {
  const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7;   // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const nowTime = new Date(); nowTime.setHours(0, 0, 0, 0);

  const heads = (lang === 'zh' ? DAY_ZH : lang === 'ko' ? DAY_KO : DAY_EN)
    .map(h => `<div class="cal-head">${h}</div>`).join('');

  let cells = '';
  for (let i = 0; i < firstOffset; i++) cells += '<div class="cal-day cal-blank"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const hasLog = logDates.has(ds);
    const isToday = ds === todayStr;
    const future = new Date(year, month, d) > nowTime;
    let cls = 'cal-day';
    if (hasLog) cls += ' cal-day-entry';
    if (ds === lastReadLog) cls += ' cal-day-active';
    if (isToday) cls += ' cal-day-today';
    if (future) cls += ' cal-day-future';
    cells += hasLog
      ? `<button class="${cls}" data-date="${ds}" aria-label="${ds}"${isToday ? ' aria-current="date"' : ''}>${d}</button>`
      : `<div class="${cls}">${d}</div>`;
  }
  return `<div class="cal-month"><div class="cal-grid">${heads}${cells}</div></div>`;
}

/* ============================================================
   RENDER — gallery grid
   ============================================================ */
async function renderGallery() {
  const epoch = stageRenderEpoch;
  const loaded = await loadGallery();
  if (epoch !== stageRenderEpoch) return;
  const heading = sectionHeading(t('图画展览会','Pictures At An Exhibition','전람회의 그림'));
  if (loaded === false) {
    stage.innerHTML = `<div>${heading}<p class="placeholder-text" role="status">${t('图片加载失败，请重新打开此栏目重试。','Pictures could not be loaded. Reopen this section to try again.','이미지를 불러오지 못했습니다. 이 메뉴를 다시 열어 주세요.')}</p></div>`;
    return;
  }
  if (!DATA.gallery.length) {
    stage.innerHTML = `<div>${heading}
      ${placeholder(t('暂无图片','No images yet','이미지 없음'))}</div>`;
    return;
  }
  stage.innerHTML = `
    <div>${heading}
    <div class="gallery-grid gallery-masonry" id="gallery-grid"></div>
    <div class="gallery-sentinel" id="gallery-sentinel" aria-hidden="true"></div></div>`;
  const grid = document.getElementById('gallery-grid');
  const sentinel = document.getElementById('gallery-sentinel');
  let shown = 0;
  let observer;
  const appendBatch = () => {
    const batch = DATA.gallery.slice(shown, shown + GALLERY_BATCH_SIZE);
    if (!batch.length) { observer?.disconnect(); sentinel.remove(); return; }
    grid.insertAdjacentHTML('beforeend', batch.map((img, offset) =>
      `<img src="${img.preview || img.src}" alt="" loading="lazy" data-idx="${shown + offset}"
        role="button" tabindex="0" aria-label="${t('查看展览图片','View exhibition picture','전시 이미지 보기')} ${shown + offset + 1}" />`).join(''));
    const newImages = [...grid.querySelectorAll('img[data-idx]')].slice(-batch.length);
    newImages.forEach(im => {
      im.addEventListener('click', () => openLightbox(Number(im.dataset.idx)));
      im.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        im.click();
      });
    });
    cacheGalleryImages(batch);
    shown += batch.length;
    enhanceMotion(grid);
  };
  appendBatch();
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) appendBatch();
  }, { rootMargin: '700px 0px' });
  observer.observe(sentinel);
}

/* ============================================================
   OVERLAYS — patch reader + gallery lightbox
   ============================================================ */
let closeActiveOverlay = null;
function mountOverlay(inner, extraClass, onClose, label) {
  closeActiveOverlay?.();
  const opener = document.activeElement;
  const app = document.querySelector('.app');
  const wasInert = app.inert;
  const previousOverflow = document.documentElement.style.overflow;
  overlayRoot.innerHTML = `
    <div class="overlay ${extraClass || ''}" id="ov" role="dialog" aria-modal="true" aria-label="${escapeHtml(label)}">
      <button class="ov-close" id="ov-close" type="button">${siteIcon('close')}${t('关闭','Close','닫기')}</button>
      ${inner}
    </div>`;
  const ov = document.getElementById('ov');
  const closeButton = document.getElementById('ov-close');
  app.inert = true;
  document.documentElement.style.overflow = 'hidden';
  let closed = false;
  const close = (restoreFocus = true) => {
    if (closed) return;
    closed = true;
    const returnTarget = onClose?.(restoreFocus);
    overlayRoot.innerHTML = '';
    document.removeEventListener('keydown', onKeyDown);
    app.inert = wasInert;
    document.documentElement.style.overflow = previousOverflow;
    closeActiveOverlay = null;
    const focusTarget = returnTarget || opener;
    if (restoreFocus && focusTarget?.isConnected) {
      focusTarget.focus({ preventScroll: true });
      if (returnTarget) focusTarget.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  };
  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...ov.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.disabled && element.getClientRects().length);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!ov.contains(document.activeElement)
        || (event.shiftKey && document.activeElement === first)
        || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus({ preventScroll: true });
    }
  }
  closeActiveOverlay = close;
  closeButton.addEventListener('click', () => close());
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  document.addEventListener('keydown', onKeyDown);
  enhanceMotion(overlayRoot);
  closeButton.focus({ preventScroll: true });
  return close;
}

async function openReader(dateStr) {
  const dates = getLogDates();
  if (!dates.includes(dateStr)) return;
  let controller;
  let requestId = 0;
  let closed = false;
  let readDate = null;
  const opener = document.activeElement;
  mountOverlay(`
    <div class="reader">
      <header class="r-header">
        <time class="r-date" id="r-date" datetime="${dateStr}" aria-live="polite">${fmtDot(dateStr)}</time>
        <span class="r-position" id="r-position" aria-label="${t('篇数位置','Entry position','글 순서')}"></span>
      </header>
      <div class="r-scroll" tabindex="0" role="region" aria-label="${t('日志正文','Log content','로그 본문')}">
        <div class="r-status" id="r-status" role="status"></div>
        <div class="r-body" id="r-body"></div>
        <button class="patch-action r-retry" id="r-retry" hidden>${t('重新加载','Reload','다시 불러오기')}</button>
      </div>
      <nav class="r-nav" aria-label="${t('切换日志','Browse entries','로그 탐색')}">
        <button class="r-step" id="r-older"><span>← ${t('较早一篇','Older entry','이전 글')}</span><time></time></button>
        <button class="r-step" id="r-newer"><span>${t('较新一篇','Newer entry','다음 글')} →</span><time></time></button>
      </nav>
    </div>`, 'reader-ov', restoreFocus => {
      closed = true;
      controller?.abort();
      // The calendar stays in place while reading; returning restores the last entry.
      if (restoreFocus && activeSection === 'patchlog' && readDate && stage.querySelector('.patch-calendar-card')) {
        const [year, month] = readDate.split('-').map(Number);
        patchlogSelection = { year, month: month - 1 };
        renderPatchlogLevel();
        return opener?.matches('.cal-day-entry')
          ? stage.querySelector(`[data-date="${readDate}"]`)
          : stage.querySelector('[data-log-latest]');
      }
    }, `${t('日志','Patch Log','패치 로그')} · ${fmtDot(dateStr)}`);
  const overlay = document.getElementById('ov');
  let body = document.getElementById('r-body');
  let scroll = overlay.querySelector('.r-scroll');
  const date = document.getElementById('r-date');
  let status = document.getElementById('r-status');
  let retry = document.getElementById('r-retry');
  const older = document.getElementById('r-older');
  const newer = document.getElementById('r-newer');

  async function loadEntry(dateStr) {
    if (closed || !dates.includes(dateStr)) return;
    controller?.abort();
    controller = new AbortController();
    const currentRequest = ++requestId;
    // Each entry gets its own scroll container, stopping any keyboard/touch momentum
    // from the previous entry while keeping the header and navigation in place.
    const contentHadFocus = scroll.contains(document.activeElement);
    const nextScroll = scroll.cloneNode(true);
    scroll.replaceWith(nextScroll);
    scroll = nextScroll;
    body = scroll.querySelector('#r-body');
    status = scroll.querySelector('#r-status');
    retry = scroll.querySelector('#r-retry');
    retry.addEventListener('click', () => loadEntry(dateStr));
    const index = dates.indexOf(dateStr);
    date.textContent = fmtDot(dateStr);
    date.setAttribute('datetime', dateStr);
    document.getElementById('r-position').textContent = `${dates.length - index} / ${dates.length}`;
    overlay.setAttribute('aria-label', `${t('日志','Patch Log','패치 로그')} · ${fmtDot(dateStr)}`);
    [[older, dates[index + 1]], [newer, dates[index - 1]]].forEach(([button, target]) => {
      button.disabled = !target;
      button.dataset.date = target || '';
      const time = button.querySelector('time');
      time.textContent = target ? fmtDot(target) : t('没有了','No more entries','더 없음');
      if (target) time.setAttribute('datetime', target);
      else time.removeAttribute('datetime');
    });
    // A boundary button becoming disabled must not leave keyboard focus behind.
    if (document.activeElement?.disabled || contentHadFocus) scroll.focus({ preventScroll: true });
    retry.hidden = true;
    body.textContent = '';
    body.setAttribute('aria-busy', 'true');
    status.textContent = t('加载中…','Loading…','로딩 중…');
    scroll.scrollTo({ top: 0, behavior: 'instant' });
    try {
      const r = await fetch(`./logs/${dateStr}.txt`, { cache: 'no-store', signal: controller.signal });
      if (!r.ok) throw new Error(r.status);
      const text = normalizeLogBody(await r.text());
      if (closed || currentRequest !== requestId) return;
      body.textContent = text;
      status.textContent = text ? '' : t('这篇日志没有正文','This entry is empty','본문이 없습니다');
      lastReadLog = dateStr;
      readDate = dateStr;
    } catch {
      if (closed || currentRequest !== requestId) return;
      status.textContent = t('日志加载失败，请重试。','Could not load this entry. Please try again.','로그를 불러오지 못했습니다. 다시 시도해 주세요.');
      retry.hidden = false;
    } finally {
      if (!closed && currentRequest === requestId) {
        scroll.scrollTo({ top: 0, behavior: 'instant' });
        body.setAttribute('aria-busy', 'false');
      }
    }
  }
  older.addEventListener('click', () => loadEntry(older.dataset.date));
  newer.addEventListener('click', () => loadEntry(newer.dataset.date));
  await loadEntry(dateStr);
}

async function developLightboxImage(img, loading) {
  const lightbox = document.querySelector('.lightbox-developing');
  const photo = lightbox?.querySelector('.lightbox-photo');
  const original = lightbox?.querySelector('.lightbox-original');
  const status = lightbox?.querySelector('.lightbox-status');
  const statusText = lightbox?.querySelector('.lightbox-status-text');
  const progressText = lightbox?.querySelector('.lightbox-progress');
  if (!lightbox || !photo || !original || !status || !statusText || !progressText) return;

  let target = .025;
  let current = 0;
  let frame = 0;
  let finishing = false;
  let resolveFinish;
  const finished = new Promise(resolve => { resolveFinish = resolve; });

  const renderProgress = () => {
    if (!lightbox.isConnected || loading.controller.signal.aborted) {
      resolveFinish();
      return;
    }
    const ease = REDUCED_MOTION.matches ? 1 : (finishing ? .16 : .095);
    current += (target - current) * ease;
    if (finishing && current > .997) current = 1;
    lightbox.style.setProperty('--develop-progress', `${(current * 100).toFixed(3)}%`);
    if (finishing && current === 1) {
      resolveFinish();
      return;
    }
    frame = requestAnimationFrame(renderProgress);
  };
  frame = requestAnimationFrame(renderProgress);

  const setDownloadProgress = (loaded, total) => {
    const ratio = total
      ? Math.min(1, loaded / total)
      : Math.min(.96, Math.log2(1 + loaded / 262144) / 8);
    target = .035 + ratio * .91;
    const percent = Math.max(1, Math.round(ratio * 100));
    progressText.textContent = `${percent}%`;
    status.setAttribute('aria-valuenow', String(percent));
  };

  try {
    const response = await fetch(img.src, { signal: loading.controller.signal });
    if (!response.ok) throw new Error(`image ${response.status}`);
    const headerBytes = Number(response.headers.get('content-length')) || 0;
    const total = headerBytes || img.bytes || 0;
    let blob;

    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        setDownloadProgress(loaded, total);
      }
      blob = new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
    } else {
      blob = await response.blob();
      setDownloadProgress(blob.size, total || blob.size);
    }

    loading.objectUrl = URL.createObjectURL(blob);
    original.src = loading.objectUrl;
    if (original.decode) await original.decode();
    else await new Promise((resolve, reject) => {
      original.addEventListener('load', resolve, { once: true });
      original.addEventListener('error', reject, { once: true });
    });

    target = 1;
    finishing = true;
    progressText.textContent = '100%';
    status.setAttribute('aria-valuenow', '100');
    await finished;
    if (!lightbox.isConnected || loading.controller.signal.aborted) return;
    lightbox.classList.add('is-developed');
    statusText.textContent = t('加载完成', 'Loaded', '로딩 완료');
    window.setTimeout(() => {
      if (lightbox.isConnected) lightbox.classList.add('is-settled');
    }, 900);
  } catch (error) {
    cancelAnimationFrame(frame);
    if (error?.name === 'AbortError') return;
    if (loading.objectUrl) {
      URL.revokeObjectURL(loading.objectUrl);
      loading.objectUrl = '';
    }
    lightbox.style.setProperty('--develop-progress', '100%');
    lightbox.classList.add('is-preview-only');
    status.removeAttribute('role');
    status.removeAttribute('aria-valuenow');
    statusText.textContent = t('原图加载失败，展示预览', 'Original unavailable — showing preview', '원본을 불러오지 못해 미리보기를 표시합니다');
    progressText.textContent = '';
  }
}

function openLightbox(idx) {
  const img = DATA.gallery[idx];
  if (!img) return;
  const width = Math.max(1, Number(img.width) || 1);
  const height = Math.max(1, Number(img.height) || 1);
  const loading = { controller: new AbortController(), objectUrl: '' };
  mountOverlay(`
    <div class="lightbox lightbox-developing">
      <div class="lightbox-photo" style="--photo-ratio:${width / height}">
        <div class="lightbox-unexposed" aria-hidden="true"></div>
        <img class="lightbox-preview" src="${img.preview || img.src}" alt="" />
        <img class="lightbox-original" alt="" />
        <div class="lightbox-developer-line" aria-hidden="true"></div>
      </div>
      <div class="lightbox-status" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <span class="lightbox-status-text">${t('加载原图','Loading original','원본 로딩 중')}</span>
        <span class="lightbox-progress">0%</span>
      </div>
    </div>`, 'lightbox-ov', () => {
      loading.controller.abort();
      if (loading.objectUrl) URL.revokeObjectURL(loading.objectUrl);
    }, t('查看展览图片','View exhibition image','전시 이미지 보기'));
  developLightboxImage(img, loading);
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

  const feedback = state => {
    btn.dataset.state = state;
    btn.classList.remove('is-launching');
    btn.querySelector('.msg-send-label').textContent = state === 'sent'
      ? t('已发送','Sent','전송됨')
      : state === 'error' ? t('重试','Retry','재시도') : t('发送','Send','보내기');
    EytleIcons.set(btn.querySelector('.msg-plane'), state === 'sent' ? 'check' : state === 'error' ? 'retry' : 'plane');
  };
  const upd = () => { cnt.textContent = `${box.value.length} / 140`; };
  box.addEventListener('input', () => {
    upd();
    if (!btn.disabled && ['sent', 'error'].includes(btn.dataset.state)) {
      feedback('idle');
      hint.textContent = '';
    }
    if (box.getAttribute('aria-invalid') === 'true') {
      box.removeAttribute('aria-invalid');
      hint.textContent = '';
    }
  });
  upd();

  const launchPlane = () => {
    feedback('idle');
    btn.classList.remove('is-launching');
    void btn.offsetWidth;
    btn.classList.add('is-launching');
    window.setTimeout(() => btn.classList.remove('is-launching'), 850);
  };

  btn.addEventListener('click', async () => {
    const submittedValue = box.value;
    const text = submittedValue.trim();
    if (!text) { hint.textContent = t('请输入留言','Enter a message','메시지를 입력하세요'); box.setAttribute('aria-invalid', 'true'); box.focus(); return; }
    if (hp.value) return;   // honeypot tripped → silently drop

    if (!MSG_CONFIG.web3formsKey) {
      hint.textContent = t('留言暂时无法发送，请通过邮箱联系。','Messages are unavailable. Please use email.','메시지를 보낼 수 없습니다. 이메일로 연락해 주세요.');
      feedback('error');
      return;
    }

    launchPlane();
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
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
      if (res.ok && data.success) {
        hint.textContent = t('留言已发送','Message sent','메시지를 보냈습니다');
        // Preserve any new note typed while the previous one was in flight.
        if (box.value === submittedValue) box.value = '';
        upd();
        feedback(box.value ? 'idle' : 'sent');
      }
      else throw new Error(data.message || 'failed');
    } catch {
      hint.textContent = t('发送失败，请稍后再试','Send failed, try again later','전송 실패, 나중에 다시 시도');
      feedback('error');
    } finally {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  });
}

/* ============================================================
   SMALL HTML HELPERS
   ============================================================ */
function siteIcon(name, className = '', hover = '') {
  return EytleIcons.markup(name, className, hover);
}
function chev(hover = true) {
  return siteIcon('chevron-right', 'chev', hover ? 'arrow-right' : '');
}
function extIcon() {
  return siteIcon('external', 'chev');
}
function placeholder(txt) { return `<p class="placeholder-text">${escapeHtml(txt)}</p>`; }
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ============================================================
   MOTION — forest ambience, content reveals, interactive light
   ============================================================ */
function enhanceMotion(root = stage) {
  if (!root) return;

  const revealSelector = [
    '.hero', '.col-left > .panel', '.col-right', '.list > .list-item', '.dl-item',
    '.patchlog-header', '.patchlog-surface', '.gallery-grid > img', '.reader', '.lightbox'
  ].join(',');
  const surfaceSelector = [
    '.panel', '.col-right', '.list-item', '.dl-item', '.patchlog-surface',
    '.patch-index-card', '.cal-wrap', '.reader'
  ].join(',');

  const reveals = [...root.querySelectorAll(revealSelector)]
    .filter(element => !element.classList.contains('motion-reveal'));
  reveals.forEach((element, index) => {
    element.style.setProperty('--reveal-delay', `${Math.min(index, 8) * 54}ms`);
    element.classList.add('motion-reveal');
  });
  root.querySelectorAll(surfaceSelector).forEach(element => element.classList.add('motion-surface'));
}

function initSurfaceLight() {
  let frame = 0;
  let pending = null;
  stage.addEventListener('pointermove', (event) => {
    const surface = event.target.closest?.('.motion-surface');
    if (!surface || !stage.contains(surface)) return;
    pending = { surface, x: event.clientX, y: event.clientY };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!pending) return;
      const rect = pending.surface.getBoundingClientRect();
      pending.surface.style.setProperty('--surface-x', `${pending.x - rect.left}px`);
      pending.surface.style.setProperty('--surface-y', `${pending.y - rect.top}px`);
      pending = null;
    });
  }, { passive: true });
}

function initAmbientMotion() {
  if (!('IntersectionObserver' in window)) return;
  const canvas = document.getElementById('ambient-motes');
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;
  let width = 1;
  let height = 1;
  let motes = [];
  let animationFrame = 0;
  let lastTime = 0;
  let hero = null;
  let heroVisible = false;
  const pointer = { x: -1000, y: -1000, active: false };
  const finePointer = window.matchMedia('(pointer: fine)');
  const canAnimate = () => heroVisible && activeSection === 'about' && !REDUCED_MOTION.matches && !document.hidden;
  const makeMote = () => ({
    x: Math.random() * width, y: Math.random() * height,
    radius: .5 + Math.random(), speed: .1 + Math.random() * .18,
    phase: Math.random() * Math.PI * 2
  });
  function resizeAmbient() {
    width = document.documentElement.clientWidth;
    height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, width < 760 ? 1 : 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    motes = Array.from({ length: width < 760 ? 10 : 22 }, makeMote);
  }
  function drawAmbient(now) {
    animationFrame = 0;
    if (!canAnimate()) return;
    if (lastTime && now - lastTime < 32) {
      animationFrame = requestAnimationFrame(drawAmbient);
      return;
    }
    const step = lastTime ? Math.min(3, (now - lastTime) / 16.67) : 1;
    lastTime = now;
    context.clearRect(0, 0, width, height);
    const day = document.documentElement.dataset.theme === 'day';
    motes.forEach(mote => {
      mote.y -= mote.speed * step;
      mote.x += Math.sin(now * .0002 + mote.phase) * .2 * step;
      if (pointer.active && finePointer.matches) {
        const dx = mote.x - pointer.x;
        const dy = mote.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < 100) {
          const breeze = (1 - distance / 100) * .7 * step;
          mote.x += dx / distance * breeze;
          mote.y += dy / distance * breeze;
        }
      }
      if (mote.y < -5) mote.y = height + 5;
      if (mote.x < -5) mote.x = width + 5;
      if (mote.x > width + 5) mote.x = -5;
      const alpha = .12 + Math.sin(now * .0008 + mote.phase) * .09;
      context.beginPath();
      context.fillStyle = `rgba(${day ? '115,97,64' : '222,197,155'},${alpha})`;
      context.arc(mote.x, mote.y, mote.radius, 0, Math.PI * 2);
      context.fill();
    });
    animationFrame = requestAnimationFrame(drawAmbient);
  }
  function syncAmbient() {
    if (!canAnimate()) {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      canvas.hidden = true;
      lastTime = 0;
    } else if (!animationFrame) {
      canvas.hidden = false;
      animationFrame = requestAnimationFrame(drawAmbient);
    }
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.target === hero) heroVisible = entry.isIntersecting;
    syncAmbient();
  });
  function trackHero() {
    const next = stage.querySelector('.hero');
    if (next === hero) return;
    if (hero) observer.unobserve(hero);
    hero = next;
    heroVisible = false;
    if (hero) observer.observe(hero);
    syncAmbient();
  }
  window.addEventListener('pointermove', event => {
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.active = false; });
  window.addEventListener('resize', resizeAmbient, { passive: true });
  document.addEventListener('visibilitychange', syncAmbient);
  REDUCED_MOTION.addEventListener?.('change', syncAmbient);
  new MutationObserver(trackHero).observe(stage, { childList: true });
  resizeAmbient();
  trackHero();
}

function preloadThemeArtwork() {
  if (!window.matchMedia('(pointer: fine)').matches) return;
  const preload = () => {
    ['images/forest-night.webp', 'images/forest-day.webp'].forEach((src) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
    });
  };
  if ('requestIdleCallback' in window) requestIdleCallback(preload, { timeout: 2400 });
  else setTimeout(preload, 900);
}

let themeSwitching = false;
async function fallbackThemeWipe(update, nextTheme, x, y, radius) {
  const wipe = document.createElement('div');
  wipe.className = `theme-wipe to-${nextTheme}`;
  wipe.style.setProperty('--theme-x', `${x}px`);
  wipe.style.setProperty('--theme-y', `${y}px`);
  document.body.appendChild(wipe);
  let updated = false;

  try {
    const cover = wipe.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 460, easing: 'cubic-bezier(.2,.78,.2,1)', fill: 'forwards' }
    );
    await cover.finished;
    update();
    updated = true;
    const dissolve = wipe.animate(
      { opacity: [1, 0] },
      { duration: 340, easing: 'ease-out', fill: 'forwards' }
    );
    await dissolve.finished;
  } finally {
    if (!updated) update();
    wipe.remove();
  }
}

async function toggleThemeWithMotion() {
  if (themeSwitching) return;
  const nextTheme = theme === 'night' ? 'day' : 'night';
  const update = () => {
    theme = nextTheme;
    localStorage.setItem('theme', theme);
    applyTheme();
  };

  if (REDUCED_MOTION.matches) {
    update();
    return;
  }
  const lamp = document.getElementById('lamp');
  const rect = lamp.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  if (!document.startViewTransition) {
    themeSwitching = true;
    try {
      await fallbackThemeWipe(update, nextTheme, x, y, radius);
    } finally {
      themeSwitching = false;
    }
    return;
  }

  themeSwitching = true;
  document.documentElement.classList.add('theme-changing');

  try {
    const transition = document.startViewTransition(update);
    await transition.ready;
    const reveal = document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      {
        duration: 780,
        easing: 'cubic-bezier(.2,.78,.2,1)',
        pseudoElement: '::view-transition-new(root)',
      }
    );
    await Promise.allSettled([reveal.finished, transition.finished]);
  } catch {
    update();
  } finally {
    document.documentElement.classList.remove('theme-changing');
    themeSwitching = false;
  }
}

/* ============================================================
   NAVIGATION
   ============================================================ */
let stageRenderEpoch = 0;
function revealActiveNav() {
  const nav = document.getElementById('nav');
  const current = nav.querySelector('.nav-i.on');
  if (!current || nav.scrollWidth <= nav.clientWidth) return;
  const bounds = nav.getBoundingClientRect();
  const item = current.getBoundingClientRect();
  const inset = 12;
  if (item.left < bounds.left + inset) {
    nav.scrollLeft += item.left - bounds.left - inset;
  } else if (item.right > bounds.right - inset) {
    nav.scrollLeft += item.right - bounds.right + inset;
  }
}
function sectionFromLocation() {
  const legacy = location.hash.slice(1);
  if (navMap.includes(legacy)) return legacy;
  const path = location.pathname.replace(/\/+$/, '') || '/';
  return navMap.find(section => sectionPaths[section] === path) || 'about';
}
function updateSectionUrl(section, replace = false) {
  const target = sectionPaths[section] + location.search;
  if (location.pathname + location.search + location.hash !== target) {
    history[replace ? 'replaceState' : 'pushState'](null, '', target);
  }
}
function restoreLocationSection() {
  go(sectionFromLocation(), { replace: true });
}
function go(section, { replace = false } = {}) {
  if (!navMap.includes(section)) section = 'about';
  const renderEpoch = ++stageRenderEpoch;
  closeActiveOverlay?.(false);
  if (section !== activeSection) window.scrollTo({ top: 0, behavior: 'instant' });
  activeSection = section;
  document.documentElement.dataset.section = section;
  updateSectionUrl(section, replace);
  document.querySelectorAll('.nav-i').forEach(b => {
    const selected = b.dataset.section === section;
    b.classList.toggle('on', selected);
    if (selected) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  revealActiveNav();
  let renderTask;
  switch (section) {
    case 'about':     renderTask = renderAbout();     break;
    case 'projects':  renderTask = renderProjects();  break;
    case 'tools':     renderTask = renderTools();     break;
    case 'patchlog':  renderTask = renderPatchlog();  break;
    case 'gallery':   renderTask = renderGallery();   break;
    case 'downloads': renderTask = renderDownloads(); break;
    default:          renderTask = renderAbout();
  }
  Promise.resolve(renderTask).then(() => {
    if (renderEpoch === stageRenderEpoch) enhanceMotion(stage);
  });
}

/* ============================================================
   LANGUAGE
   ============================================================ */
function applyLang() {
  const messageBox = document.getElementById('msg-text');
  const draft = messageBox ? {
    value: messageBox.value,
    start: messageBox.selectionStart,
    end: messageBox.selectionEnd,
    scroll: messageBox.scrollTop,
  } : null;
  document.querySelectorAll('.nav-i').forEach((b, i) => {
    b.querySelector('span').textContent =
      lang === 'zh' ? b.dataset.zh : lang === 'ko' ? (b.dataset.ko || b.dataset.en) : b.dataset.en;
  });
  document.querySelectorAll('[data-copy]').forEach(element => {
    element.textContent = t(element.dataset.zh, element.dataset.en, element.dataset.ko);
  });
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('on', b.dataset.lang === lang);
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  });
  document.getElementById('nav').setAttribute('aria-label', t('主导航','Main navigation','주 탐색'));
  document.documentElement.lang = lang === 'zh' ? 'zh' : lang;
  lampLabel();
  go(activeSection, { replace: true });   // language changes do not add history entries
  const translatedBox = document.getElementById('msg-text');
  if (draft && translatedBox) {
    translatedBox.value = draft.value;
    translatedBox.setSelectionRange(draft.start, draft.end);
    translatedBox.scrollTop = draft.scroll;
    translatedBox.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/* ============================================================
   THEME — "lights on / off"
   ============================================================ */
function lampLabel() {
  const night = document.documentElement.getAttribute('data-theme') === 'night';
  const icon = document.getElementById('lamp-ico');
  const name = night ? 'sun' : 'moon';
  if (!icon.querySelector('svg')) icon.innerHTML = siteIcon(name);
  else EytleIcons.set(icon.querySelector('svg'), name);
  document.getElementById('lamp-tx').textContent =
    { zh: night ? '开灯' : '关灯', en: night ? 'Lights on' : 'Lights off', ko: night ? '불 켜기' : '불 끄기' }[lang];
}
function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]').content = theme === 'day' ? '#eeeee5' : '#080f14';
  lampLabel();
}

/* ============================================================
   INIT
   ============================================================ */
document.querySelectorAll('.nav-i').forEach(b => b.addEventListener('click', () => {
  const section = b.dataset.section;
  if (section === 'gallery' && isMuseumCapable()) { location.href = '/museum'; return; }
  if (section !== activeSection) go(section);
  window.scrollTo({ top: 0, behavior: 'instant' });
}));
document.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.lang === lang) return;
  lang = b.dataset.lang; localStorage.setItem('lang', lang); applyLang();
}));
document.getElementById('lamp').addEventListener('click', toggleThemeWithMotion);
function returnHome(event) {
  event.preventDefault();
  if (activeSection !== 'about') go('about');
  window.scrollTo({ top: 0, behavior: 'instant' });
}
document.getElementById('home-btn').addEventListener('click', returnHome);
document.querySelector('.footer-brand').addEventListener('click', returnHome);
window.addEventListener('hashchange', restoreLocationSection);
window.addEventListener('popstate', restoreLocationSection);
window.addEventListener('resize', revealActiveNav, { passive: true });
document.fonts?.ready.then(revealActiveNav);

// Boot
activeSection = sectionFromLocation();
applyTheme();
applyLang();   // sets nav labels + renders the active section
initSurfaceLight();
initAmbientMotion();
preloadThemeArtwork();
