/* ============================================================
   DATA
   ============================================================ */
const DATA = {
  about: {
    email: '3035986089@qq.com',
    github: 'https://github.com/EytleBB'
  },

  projects: [
    {
      id: 'csai',
      name: 'CSAI',
      github: '',
      // sub: []  -- no sub-projects yet; clicking goes straight to GitHub
      sub: [
        { name: 'CS Scout', github: 'https://github.com/EytleBB/CS-Scout' },
        { name: 'CS Prophet', github: 'https://github.com/EytleBB/CS-Prophet' },
      ]
    }
  ],

  tools: [
    {
      name: 'MC 要塞定位器',
      nameEn: 'MC Stronghold Finder',
      url: './mc-calc.html',
      external: false
    }
  ],

  // Gallery: add entries as { src: 'images/gallery/xxx.jpg', title: '...' }
  // Leave src empty/null to show placeholder box
  gallery: [
    // { src: 'images/gallery/1.jpg', title: '截图 1' },
  ],

  // 由 GitHub Actions 自动维护，无需手动修改
  patchlog: [],

  downloads: [
    {
      name: '730',
      meta: 'Updated: 2025-12-20',
      icon: '📦',
      url: './files/730.zip'
    },
    {
      name: 'Minecraft 1.21.8 生存存档',
      nameEn: 'Minecraft 1.21.8 Survival World',
      meta: '夸克网盘',
      icon: '⛏️',
      url: 'https://pan.quark.cn/s/364c986a6e70'
    }
  ]
};

/* ============================================================
   STATE
   ============================================================ */
let lang = 'zh';    // 'zh' | 'en'
let theme = 'dark'; // 'dark' | 'light'
let activeSection = null;

/* ============================================================
   DOM REFS
   ============================================================ */
const colPrimary   = document.getElementById('col-primary');
const colSecondary = document.getElementById('col-secondary');
const themeToggle  = document.getElementById('theme-toggle');
const themeLabel   = themeToggle.querySelector('.theme-label');
const iconMoon     = document.getElementById('icon-moon');
const iconSun      = document.getElementById('icon-sun');

/* ============================================================
   HELPERS
   ============================================================ */
function t(zhText, enText) {
  return lang === 'zh' ? zhText : (enText || zhText);
}

function isMobile() { return window.innerWidth <= 768; }

function clearSecondary() {
  colSecondary.innerHTML = '';
  colSecondary.classList.remove('mobile-open');
}

function setActiveNav(section) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === section);
  });
  activeSection = section;
  document.querySelector('.layout').classList.remove('gallery-expanded', 'patchlog-expanded');
  clearSecondary();
}

/* ============================================================
   RENDERERS — Primary panel
   ============================================================ */
function renderAbout() {
  colPrimary.innerHTML = `
    <p class="panel-label">${t('概况', 'Overview')}</p>
    <div class="about-list">
      <div class="about-row">
        <span class="about-key">Email</span>
        <span class="about-val">
          <a href="mailto:${DATA.about.email}">${DATA.about.email}</a>
        </span>
      </div>
      <div class="about-row">
        <span class="about-key">GitHub</span>
        <span class="about-val">
          <a href="${DATA.about.github}" target="_blank" rel="noopener">${DATA.about.github}</a>
        </span>
      </div>
    </div>
  `;
}

function renderProjects() {
  const items = DATA.projects.map(proj => {
    const hasSub = proj.sub && proj.sub.length > 0;
    return `
      <button class="panel-item" data-proj="${proj.id}">
        <span>${proj.name}</span>
        <span class="panel-item-right">
          ${hasSub ? `<span class="item-badge">${proj.sub.length} ${t('子项目','sub')}</span>` : ''}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </span>
      </button>
    `;
  }).join('');

  colPrimary.innerHTML = `
    <p class="panel-label">${t('项目', 'Projects')}</p>
    <div class="panel-list">${items || `<p class="placeholder-text">${t('暂无项目','No projects yet')}</p>`}</div>
  `;

  colPrimary.querySelectorAll('.panel-item[data-proj]').forEach(btn => {
    btn.addEventListener('click', () => handleProjectClick(btn.dataset.proj));
  });
}

function renderTools() {
  const items = DATA.tools.map(tool => `
    <a class="panel-item" href="${tool.url}" ${tool.external === false ? '' : 'target="_blank" rel="noopener"'}>
      <span>${lang === 'zh' ? tool.name : (tool.nameEn || tool.name)}</span>
      <span class="panel-item-right">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </span>
    </a>
  `).join('');

  colPrimary.innerHTML = `
    <p class="panel-label">${t('工具', 'Tools')}</p>
    <div class="panel-list">${items}</div>
  `;
}

function renderDownloads() {
  const items = DATA.downloads.map(dl => `
    <a class="dl-item" href="${dl.url}" target="_blank" rel="noopener">
      <span class="dl-icon">${dl.icon}</span>
      <span class="dl-info">
        <p class="dl-name">${lang === 'zh' ? dl.name : (dl.nameEn || dl.name)}</p>
        <p class="dl-meta">${dl.meta}</p>
      </span>
      <svg class="dl-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    </a>
  `).join('');

  colPrimary.innerHTML = `
    <p class="panel-label">${t('下载', 'Downloads')}</p>
    ${items}
  `;
}

async function renderGallery() {
  colGalleryExpanded(false); // reset merged state

  // 从 index.json 加载图片列表（GitHub Actions 自动维护）
  try {
    const res = await fetch('./images/gallery/index.json');
    if (res.ok) {
      const files = await res.json();
      DATA.gallery = files.map(f => ({ src: `images/gallery/${encodeURIComponent(f)}`, title: '' }));
    }
  } catch {}

  if (DATA.gallery.length === 0) {
    colPrimary.innerHTML = `
      <p class="panel-label">${t('画廊', 'Gallery')}</p>
      <div class="panel-placeholder" style="height:auto;padding:3rem 0;">
        <div class="placeholder-icon" style="opacity:0.3;font-size:2rem;">🖼</div>
        <p class="placeholder-text">${t('暂无图片', 'No images yet')}</p>
      </div>
    `;
    return;
  }

  const thumbs = DATA.gallery.map((img, i) => {
    const inner = img.src
      ? `<img src="${img.src}" alt="${img.title || ''}" loading="lazy" />`
      : `<div class="gallery-thumb-placeholder">🖼</div>`;
    return `<div class="gallery-thumb" data-idx="${i}">${inner}</div>`;
  }).join('');

  colPrimary.innerHTML = `
    <p class="panel-label">${t('画廊', 'Gallery')}</p>
    <div class="gallery-grid">${thumbs}</div>
  `;

  colPrimary.querySelectorAll('.gallery-thumb').forEach(el => {
    el.addEventListener('click', () => handleGalleryClick(Number(el.dataset.idx)));
  });
}

function renderEmpty() {
  colPrimary.innerHTML = '';
}

/* ============================================================
   RENDERERS — Secondary panel
   ============================================================ */
function renderSubProjects(proj) {
  const backBtn = isMobile()
    ? `<button class="mobile-back" id="mobile-back">‹ ${t('返回','Back')}</button>` : '';
  colSecondary.innerHTML = backBtn + `
    <p class="panel-label" style="padding:1.75rem 1.4rem 0">${proj.name} · ${t('子项目', 'Sub-projects')}</p>
    <div class="panel-list" style="padding:0 1.4rem">
      ${proj.sub.map(sub => `
        <a class="panel-item" href="${sub.github}" target="_blank" rel="noopener">
          <span>${sub.name}</span>
          <span class="panel-item-right">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
        </a>
      `).join('')}
    </div>
  `;
  if (isMobile()) {
    colSecondary.classList.add('mobile-open');
    document.getElementById('mobile-back').addEventListener('click', clearSecondary);
  }
}

/* ---- expand helpers ---- */
function colGalleryExpanded(on) {
  document.querySelector('.layout').classList.toggle('gallery-expanded', on);
  if (!on) { colSecondary.innerHTML = ''; colSecondary.classList.remove('mobile-open'); }
}

function colPatchlogExpanded(on) {
  document.querySelector('.layout').classList.toggle('patchlog-expanded', on);
  if (!on) { colSecondary.innerHTML = ''; colSecondary.classList.remove('mobile-open'); }
}

function renderGalleryViewer(idx) {
  const img = DATA.gallery[idx];
  colGalleryExpanded(true);

  const imageEl = img && img.src
    ? `<img class="gallery-viewer-img" src="${img.src}" alt="${img.title || ''}" />`
    : `<div class="gallery-viewer-placeholder"><span>🖼</span><p>${t('暂无图片','No image')}</p></div>`;

  colSecondary.innerHTML = `
    <div class="gallery-viewer">
      <button class="gallery-close" id="gallery-close">✕ ${t('关闭','Close')}</button>
      ${imageEl}
      ${img && img.title ? `<p class="gallery-viewer-caption">${img.title}</p>` : ''}
    </div>
  `;
  if (isMobile()) colSecondary.classList.add('mobile-open');

  document.getElementById('gallery-close').addEventListener('click', () => {
    colGalleryExpanded(false);
    colPrimary.querySelectorAll('.gallery-thumb').forEach(el => el.classList.remove('active'));
  });
}

/* ============================================================
   PATCH LOG — calendar renderer
   ============================================================ */
const MONTH_ZH = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
const MONTH_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_ZH   = ['一','二','三','四','五','六','日'];
const DAY_EN   = ['Mo','Tu','We','Th','Fr','Sa','Su'];

async function renderPatchlog() {
  // 从 index.json 加载日志日期列表
  try {
    const res = await fetch('./logs/index.json');
    if (res.ok) DATA.patchlog = await res.json();
  } catch {}

  const now      = new Date();
  const todayStr = fmtDate(now);

  // ── 第3列：日历 ──
  let html = `<p class="panel-label">${t('斑驳日志', 'Patch Log')}</p>`;
  let y = 2026, m = 2;
  const endY = now.getFullYear(), endM = now.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    html += buildMonth(y, m, todayStr);
    m++;
    if (m > 11) { m = 0; y++; }
  }
  colPrimary.innerHTML = html;

  colPrimary.querySelectorAll('.cal-day-entry').forEach(el => {
    el.addEventListener('click', () => handlePatchlogClick(el.dataset.date, el));
  });

  // ── 第4+5列：立即展开，只显示背景 ──
  colPatchlogExpanded(true);
  colSecondary.innerHTML = `
    <div class="patchlog-viewer" id="patchlog-viewer">
      <div class="patchlog-bg"></div>
      <div class="patchlog-overlay" id="patchlog-overlay" aria-hidden="true">
        <button class="plog-close" id="patchlog-close">✕</button>
        <p class="plog-date" id="plog-date"></p>
        <div class="plog-body" id="plog-body"></div>
      </div>
    </div>
  `;

  document.getElementById('patchlog-close').addEventListener('click', closeLogOverlay);
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function buildMonth(year, month, todayStr) {
  const label = lang === 'zh'
    ? `${year}年 ${MONTH_ZH[month]}`
    : `${MONTH_EN[month]} ${year}`;

  // Monday-first: offset = (getDay()+6)%7
  const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const nowTime     = new Date();
  nowTime.setHours(0,0,0,0);

  const heads = (lang === 'zh' ? DAY_ZH : DAY_EN)
    .map(h => `<div class="cal-head">${h}</div>`).join('');

  let cells = '';
  for (let i = 0; i < firstOffset; i++) cells += '<div class="cal-day cal-blank"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const ds      = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const hasLog  = DATA.patchlog.includes(ds);
    const isToday = ds === todayStr;
    const future  = new Date(year, month, d) > nowTime;

    let cls = 'cal-day';
    if (hasLog)   cls += ' cal-day-entry';
    if (isToday)  cls += ' cal-day-today';
    if (future)   cls += ' cal-day-future';

    cells += hasLog
      ? `<div class="${cls}" data-date="${ds}">${d}</div>`
      : `<div class="${cls}">${d}</div>`;
  }

  return `
    <div class="cal-month">
      <p class="cal-month-label">${label}</p>
      <div class="cal-grid">${heads}${cells}</div>
    </div>
  `;
}

async function handlePatchlogClick(dateStr, el) {
  // highlight selected day
  colPrimary.querySelectorAll('.cal-day-entry').forEach(d => d.classList.remove('cal-day-active'));
  el.classList.add('cal-day-active');

  // format date label
  const dp = dateStr.split('-');
  const dateLabel = lang === 'zh'
    ? `${dp[0]}.${parseInt(dp[1])}.${parseInt(dp[2])}`
    : `${MONTH_EN[parseInt(dp[1])-1]} ${parseInt(dp[2])}, ${dp[0]}`;

  // show overlay immediately with loading state
  const overlay  = document.getElementById('patchlog-overlay');
  const dateEl   = document.getElementById('plog-date');
  const bodyEl   = document.getElementById('plog-body');

  dateEl.textContent = dateLabel;
  bodyEl.textContent = t('加载中…', 'Loading…');
  overlay.classList.add('visible');
  if (isMobile()) colSecondary.classList.add('mobile-open');

  // fetch the log file
  try {
    const res = await fetch(`./logs/${dateStr}.txt`);
    if (!res.ok) throw new Error(res.status);
    bodyEl.textContent = await res.text();
  } catch {
    bodyEl.textContent = t('日志加载失败', 'Failed to load log');
  }
}

function closeLogOverlay() {
  const ov = document.getElementById('patchlog-overlay');
  if (ov) ov.classList.remove('visible');
  colPrimary.querySelectorAll('.cal-day-entry').forEach(d => d.classList.remove('cal-day-active'));
  if (isMobile()) colSecondary.classList.remove('mobile-open');
}

/* ============================================================
   HANDLERS
   ============================================================ */
function handleGalleryClick(idx) {
  colPrimary.querySelectorAll('.gallery-thumb').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
  renderGalleryViewer(idx);
}

function handleProjectClick(projId) {
  const proj = DATA.projects.find(p => p.id === projId);
  if (!proj) return;

  colPrimary.querySelectorAll('.panel-item').forEach(b => {
    b.classList.toggle('active', b.dataset.proj === projId);
  });

  if (proj.sub && proj.sub.length > 0) {
    renderSubProjects(proj);
  } else {
    // No sub-projects: open GitHub directly
    window.open(proj.github, '_blank', 'noopener');
    clearSecondary();
  }
}

function handleSection(section) {
  setActiveNav(section);

  switch (section) {
    case 'about':     renderAbout();     break;
    case 'projects':  renderProjects();  break;
    case 'tools':     renderTools();     break;
    case 'gallery':   renderGallery();   break;
    case 'patchlog':  renderPatchlog();  break;
    case 'downloads': renderDownloads(); break;
    default: renderEmpty();
  }
}

/* ============================================================
   LANGUAGE
   ============================================================ */
function applyLang() {
  // Static elements with data-zh / data-en
  document.querySelectorAll('[data-zh]').forEach(el => {
    // Skip nav items (handled separately to preserve button text)
    if (!el.classList.contains('nav-item')) {
      el.textContent = lang === 'zh' ? el.dataset.zh : (el.dataset.en || el.dataset.zh);
    }
  });

  // Nav items
  document.querySelectorAll('.nav-item[data-zh]').forEach(btn => {
    btn.textContent = lang === 'zh' ? btn.dataset.zh : (btn.dataset.en || btn.dataset.zh);
  });

  // Theme label
  if (theme === 'dark') {
    themeLabel.textContent = lang === 'zh' ? '暗色模式' : 'Dark Mode';
  } else {
    themeLabel.textContent = lang === 'zh' ? '亮色模式' : 'Light Mode';
  }

  // Re-render active section
  if (activeSection) handleSection(activeSection);
}

/* ============================================================
   THEME
   ============================================================ */
function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'dark') {
    iconMoon.style.display = '';
    iconSun.style.display  = 'none';
    themeLabel.textContent = lang === 'zh' ? '暗色模式' : 'Dark Mode';
  } else {
    iconMoon.style.display = 'none';
    iconSun.style.display  = '';
    themeLabel.textContent = lang === 'zh' ? '亮色模式' : 'Light Mode';
  }
}

/* ============================================================
   INIT
   ============================================================ */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => handleSection(btn.dataset.section));
});

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    lang = btn.dataset.lang;
    document.querySelectorAll('.lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
    applyLang();
  });
});

themeToggle.addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  applyTheme();
});

document.getElementById('home-btn').addEventListener('click', () => {
  setActiveNav(null);
  renderEmpty();
});

// Boot
applyTheme();
renderEmpty();
