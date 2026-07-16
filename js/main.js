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
      name: 'MC 要塞定位器', nameEn: 'MC Stronghold Finder', nameKo: 'MC 요새 찾기',
      url: './mc-calc.html', external: false,
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
   form simply acknowledges locally without sending.
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
let logsLoaded = false;
let patchlogSelection = { year: null, month: null };
const GALLERY_BATCH_SIZE = 18;
const GALLERY_HOME_COUNT = 12;
const GALLERY_CACHE = 'eytle-gallery-v1';
const GALLERY_PREVIEW_KEY = 'eytle-gallery-preview-v2';

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
    const files = await (await fetch('./images/gallery/index.json', { cache: 'no-cache' })).json();
    if (Array.isArray(files)) {
      DATA.gallery = files.map(f => ({ src: `images/gallery/${encodeURIComponent(f)}` }));
    }
  } catch {}
  galleryLoaded = true;
}

function randomGalleryPreview() {
  const order = DATA.gallery.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  // Avoid showing the identical layout again after returning home or refreshing.
  const preview = order.slice(0, GALLERY_HOME_COUNT);
  let previous = '';
  try { previous = sessionStorage.getItem(GALLERY_PREVIEW_KEY) || ''; } catch {}
  let signature = JSON.stringify(preview.map(i => DATA.gallery[i].src));
  if (preview.length > 1 && previous === signature) {
    [preview[0], preview[1]] = [preview[1], preview[0]];
    signature = JSON.stringify(preview.map(i => DATA.gallery[i].src));
  }
  try { sessionStorage.setItem(GALLERY_PREVIEW_KEY, signature); } catch {}
  return preview;
}

async function cacheGalleryImages(images) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(GALLERY_CACHE);
    await Promise.all(images.map(async ({ src }) => {
      if (await cache.match(src)) return;
      const response = await fetch(src);
      if (response.ok) await cache.put(src, response);
    }));
  } catch {}
}

function wireGalleryImages(root) {
  root.querySelectorAll('img[data-idx]').forEach(im =>
    im.addEventListener('click', () => openLightbox(Number(im.dataset.idx))));
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
        <div class="eyebrow">${t('图画展览会','Pictures At An Exhibition','전람회의 그림')}</div>
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

  // Gallery preview — 3 columns × 4 rows, matching the left-hand stack.
  await loadGallery();
  const gal = document.getElementById('home-gal');
  if (DATA.gallery.length) {
    const idx = randomGalleryPreview();
    gal.innerHTML = idx
      .map(i => `<img src="${DATA.gallery[i].src}" alt="" loading="lazy" data-idx="${i}" />`).join('');
    wireGalleryImages(gal);
    cacheGalleryImages(idx.map(i => DATA.gallery[i]));
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
      <div class="project-group" data-proj-group="${p.id}">
        <button class="list-item" data-proj="${p.id}" aria-expanded="false">
          <span class="label">${escapeHtml(pick(p, 'name'))}</span>
          <span class="right">
            ${hasSub ? `<span class="badge">${p.sub.length} ${t('子项目','sub','하위')}</span>` : ''}
            ${chev()}
          </span>
        </button>
        <div class="project-sub-slot" data-proj-sub="${p.id}"></div>
      </div>`;
  }).join('');

  stage.innerHTML = `
    <div><div class="eyebrow">${t('项目','Projects','프로젝트')}</div>
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
      b.classList.remove('on');
      b.setAttribute('aria-expanded', 'false');
    });
    stage.querySelectorAll('.project-sub-slot').forEach(slot => { slot.innerHTML = ''; });
    if (!shouldOpen) return;

    button.classList.add('on');
    button.setAttribute('aria-expanded', 'true');
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
  renderPatchlogLevel();
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildPatchlogIndex() {
  const years = new Map();
  DATA.patchlog.forEach(date => {
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

function patchlogMonthCount(count) {
  if (lang === 'zh') return `${count} 个月`;
  if (lang === 'ko') return `${count}개월`;
  return `${count} ${count === 1 ? 'month' : 'months'}`;
}

function patchlogDayLabel(date) {
  const [, month, day] = date.split('-').map(Number);
  if (lang === 'zh') return `${month}月${day}日`;
  if (lang === 'ko') return `${month}월 ${day}일`;
  return `${MONTH_EN[month - 1]} ${day}`;
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

function renderPatchlogLevel() {
  const index = buildPatchlogIndex();
  const selectedYear = index.find(item => item.year === patchlogSelection.year);
  if (patchlogSelection.year !== null && !selectedYear) {
    patchlogSelection = { year: null, month: null };
  } else if (patchlogSelection.month !== null
      && !selectedYear.months.some(item => item.month === patchlogSelection.month)) {
    patchlogSelection.month = null;
  }

  const totalCount = index.reduce((total, item) => total + item.count, 0);
  let title = t('日志目录','Log archive','로그 보관함');
  let description = t(
    '按年份、月份和日期逐级浏览。',
    'Browse entries by year, month, and date.',
    '연도, 월, 날짜 순서로 기록을 찾아보세요.'
  );
  let content = '';
  if (!index.length) {
    content = placeholder(t('暂无日志','No entries yet','아직 로그가 없습니다'));
  } else if (patchlogSelection.year === null) {
    content = `
      <div class="patch-level-title">
        <span>${t('年份','Years','연도')}</span>
        <span>${patchlogCount(totalCount)}</span>
      </div>
      <div class="patch-index-grid">${index.map(item => `
        <button class="patch-index-card" data-log-year="${item.year}">
          <span class="patch-index-number">${item.year}</span>
          <span class="patch-index-copy">
            <span class="patch-index-main">${patchlogCount(item.count)}</span>
            <span class="patch-index-meta">${patchlogMonthCount(item.months.length)}</span>
          </span>
          <span class="patch-index-arrow">${chev()}</span>
        </button>`).join('')}</div>`;
  } else if (patchlogSelection.month === null) {
    title = `${selectedYear.year}`;
    description = t(
      `${patchlogMonthCount(selectedYear.months.length)}，共 ${patchlogCount(selectedYear.count)}。选择月份继续。`,
      `${patchlogMonthCount(selectedYear.months.length)} and ${patchlogCount(selectedYear.count)}. Choose a month to continue.`,
      `${patchlogMonthCount(selectedYear.months.length)}, 총 ${patchlogCount(selectedYear.count)}. 월을 선택하세요.`
    );
    content = `
      <div class="patch-level-title">
        <span>${t('月份','Months','월')}</span>
        <span>${patchlogCount(selectedYear.count)}</span>
      </div>
      <div class="patch-index-grid">${selectedYear.months.map(item => `
        <button class="patch-index-card" data-log-month="${item.month}">
          <span class="patch-index-number">${String(item.month + 1).padStart(2, '0')}</span>
          <span class="patch-index-copy">
            <span class="patch-index-main">${patchlogMonthLabel(selectedYear.year, item.month)}</span>
            <span class="patch-index-meta">${patchlogCount(item.dates.length)}</span>
          </span>
          <span class="patch-index-arrow">${chev()}</span>
        </button>`).join('')}</div>`;
  } else {
    const selectedMonth = selectedYear.months.find(item => item.month === patchlogSelection.month);
    title = patchlogMonthLabel(selectedYear.year, selectedMonth.month, true);
    description = t(
      `本月有 ${patchlogCount(selectedMonth.dates.length)}，点击琥珀色日期阅读。`,
      `${patchlogCount(selectedMonth.dates.length)} this month. Select an amber date to read.`,
      `이번 달 ${patchlogCount(selectedMonth.dates.length)}. 호박색 날짜를 선택해 읽어보세요.`
    );
    content = `
      <div class="patch-calendar-layout">
        <section class="patch-calendar-card" aria-label="${t('月历','Monthly calendar','월간 달력')}">
          <div class="patch-calendar-bar">
            <span>${t('月历','Calendar','달력')}</span>
            <span class="patch-calendar-legend"><i aria-hidden="true"></i>${t('有日志','Entry','기록 있음')}</span>
          </div>
          <div class="cal-wrap">${buildMonth(
            selectedYear.year,
            selectedMonth.month,
            fmtDate(new Date()),
            new Set(selectedMonth.dates)
          )}</div>
        </section>
        <aside class="patch-entry-list" aria-label="${t('本月日志','Entries this month','이번 달 기록')}">
          <div class="patch-entry-heading">${t('本月日志','Entries this month','이번 달 기록')}</div>
          ${selectedMonth.dates.map(date => `
            <button class="patch-entry-item" data-log-entry data-date="${date}">
              <span>${patchlogDayLabel(date)}</span>
              <span class="patch-entry-date">${date}</span>
              <span class="patch-index-arrow">${chev()}</span>
            </button>`).join('')}
        </aside>
      </div>`;
  }

  stage.innerHTML = `
    <div class="patchlog-shell">
      <header class="patchlog-header">
        <div class="eyebrow">${t('斑驳日志','Patch Log','Patch Log')}</div>
        <h1 class="patchlog-title">${title}</h1>
        <p class="patchlog-description">${description}</p>
      </header>
      <div class="patchlog-surface">
        ${patchlogBreadcrumb()}
        <div class="patch-level">${content}</div>
      </div>
    </div>`;

  stage.querySelector('[data-log-years]')?.addEventListener('click', () => {
    patchlogSelection = { year: null, month: null };
    renderPatchlogLevel();
  });
  stage.querySelector('[data-log-year-crumb]')?.addEventListener('click', () => {
    patchlogSelection.month = null;
    renderPatchlogLevel();
  });
  stage.querySelectorAll('[data-log-year]').forEach(button =>
    button.addEventListener('click', () => {
      patchlogSelection = { year: Number(button.dataset.logYear), month: null };
      renderPatchlogLevel();
    }));
  stage.querySelectorAll('[data-log-month]').forEach(button =>
    button.addEventListener('click', () => {
      patchlogSelection.month = Number(button.dataset.logMonth);
      renderPatchlogLevel();
    }));
  stage.querySelectorAll('.cal-day-entry, [data-log-entry]').forEach(button =>
    button.addEventListener('click', () => openReader(button.dataset.date)));
}

function buildMonth(year, month, todayStr, logDates) {
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
    const hasLog = logDates.has(ds);
    const isToday = ds === todayStr;
    const future = new Date(year, month, d) > nowTime;
    let cls = 'cal-day';
    if (hasLog) cls += ' cal-day-entry';
    if (isToday) cls += ' cal-day-today';
    if (future) cls += ' cal-day-future';
    cells += hasLog
      ? `<button class="${cls}" data-date="${ds}" aria-label="${ds}">${d}</button>`
      : `<div class="${cls}">${d}</div>`;
  }
  return `<div class="cal-month"><p class="cal-month-label">${label}</p><div class="cal-grid">${heads}${cells}</div></div>`;
}

/* ============================================================
   RENDER — gallery grid
   ============================================================ */
async function renderGallery() {
  await loadGallery();
  if (!DATA.gallery.length) {
    stage.innerHTML = `<div><div class="eyebrow">${t('图画展览会','Pictures At An Exhibition','전람회의 그림')}</div>
      ${placeholder(t('暂无图片','No images yet','이미지 없음'))}</div>`;
    return;
  }
  stage.innerHTML = `
    <div><div class="eyebrow">${t('图画展览会','Pictures At An Exhibition','전람회의 그림')}</div>
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
      `<img src="${img.src}" alt="" loading="lazy" data-idx="${shown + offset}" />`).join(''));
    const newImages = [...grid.querySelectorAll('img[data-idx]')].slice(-batch.length);
    newImages.forEach(im => im.addEventListener('click', () => openLightbox(Number(im.dataset.idx))));
    cacheGalleryImages(batch);
    shown += batch.length;
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
