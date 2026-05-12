# Add Korean Language Support

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the site from bilingual (zh/en) to trilingual (zh/en/ko), keeping the existing `t()` pattern and `data-*` attribute approach.

**Architecture:** Extend `t(zh, en)` → `t(zh, en, ko)` so every call site gains a Korean third argument. Add `nameKo` fields to DATA entries that carry `nameEn`. Add `MONTH_KO` / `DAY_KO` arrays. Extend `applyLang()` to read `data-ko`. Add a third language button in the HTML. No refactoring of the existing pattern — just widen it from 2-way to 3-way.

**Tech Stack:** Plain HTML/CSS/JS, no build step.

---

### Task 1: Extend `t()` helper and `lang` state

**Files:**
- Modify: `js/main.js:62` (state), `js/main.js:79-81` (t function)

- [ ] **Step 1: Add `'ko'` to the `lang` type comment and extend `t()` to accept Korean**

  In `js/main.js`, change line 62:
  ```js
  let lang = 'zh';    // 'zh' | 'en'
  ```
  to:
  ```js
  let lang = 'zh';    // 'zh' | 'en' | 'ko'
  ```

  Change lines 79-81:
  ```js
  function t(zhText, enText) {
    return lang === 'zh' ? zhText : (enText || zhText);
  }
  ```
  to:
  ```js
  function t(zhText, enText, koText) {
    if (lang === 'zh') return zhText;
    if (lang === 'ko') return koText || enText || zhText;
    return enText || zhText;
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add js/main.js
  git commit -m "feat: extend t() helper and lang state for Korean support"
  ```

---

### Task 2: Add Korean month/day arrays and wire into calendar

**Files:**
- Modify: `js/main.js:296-299` (arrays), `js/main.js:347-349` (buildMonth label), `js/main.js:357` (day heads), `js/main.js:393-396` (patchlog click date label)

- [ ] **Step 1: Add `MONTH_KO` and `DAY_KO` arrays**

  After line 299, add:
  ```js
  const MONTH_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const DAY_KO   = ['월','화','수','목','금','토','일'];
  ```

- [ ] **Step 2: Update `buildMonth()` date label (lines 347-349)**

  Replace:
  ```js
  const label = lang === 'zh'
    ? `${year}年 ${MONTH_ZH[month]}`
    : `${MONTH_EN[month]} ${year}`;
  ```
  with:
  ```js
  const label = lang === 'zh'
    ? `${year}年 ${MONTH_ZH[month]}`
    : lang === 'ko'
      ? `${year}년 ${MONTH_KO[month]}`
      : `${MONTH_EN[month]} ${year}`;
  ```

- [ ] **Step 3: Update day-name heads (line 357)**

  Replace:
  ```js
  const heads = (lang === 'zh' ? DAY_ZH : DAY_EN)
  ```
  with:
  ```js
  const heads = lang === 'zh' ? DAY_ZH : lang === 'ko' ? DAY_KO : DAY_EN
  ```

- [ ] **Step 4: Update patchlog click date label (lines 393-396)**

  Replace:
  ```js
  const dateLabel = lang === 'zh'
    ? `${dp[0]}.${parseInt(dp[1])}.${parseInt(dp[2])}`
    : `${MONTH_EN[parseInt(dp[1])-1]} ${parseInt(dp[2])}, ${dp[0]}`;
  ```
  with:
  ```js
  const dateLabel = lang === 'zh'
    ? `${dp[0]}.${parseInt(dp[1])}.${parseInt(dp[2])}`
    : lang === 'ko'
      ? `${dp[0]}년 ${parseInt(dp[1])}월 ${parseInt(dp[2])}일`
      : `${MONTH_EN[parseInt(dp[1])-1]} ${parseInt(dp[2])}, ${dp[0]}`;
  ```

- [ ] **Step 5: Commit**
  ```bash
  git add js/main.js
  git commit -m "feat: add Korean month/day arrays and calendar formatting"
  ```

---

### Task 3: Add Korean strings to all `t()` calls in renderers

**Files:**
- Modify: `js/main.js` (16 `t()` call sites)

- [ ] **Step 1: Update every `t()` call to include Korean**

  | Line(s) | Old | New |
  |---------|-----|-----|
  | 104 | `t('概况', 'Overview')` | `t('概况', 'Overview', '개요')` |
  | 129 | `t('子项目','sub')` | `t('子项目','sub', '하위')` |
  | 139 | `t('项目', 'Projects')` | `t('项目', 'Projects', '프로젝트')` |
  | 140 | `t('暂无项目','No projects yet')` | `t('暂无项目','No projects yet', '프로젝트 없음')` |
  | 161 | `t('工具', 'Tools')` | `t('工具', 'Tools', '도구')` |
  | 183 | `t('下载', 'Downloads')` | `t('下载', 'Downloads', '다운로드')` |
  | 202 | `t('画廊', 'Gallery')` | `t('画廊', 'Gallery', '갤러리')` |
  | 205 | `t('暂无图片', 'No images yet')` | `t('暂无图片', 'No images yet', '이미지 없음')` |
  | 219 | `t('画廊', 'Gallery')` | `t('画廊', 'Gallery', '갤러리')` |
  | 237 | `t('返回','Back')` | `t('返回','Back', '뒤로')` |
  | 239 | `t('子项目', 'Sub-projects')` | `t('子项目', 'Sub-projects', '하위 프로젝트')` |
  | 275 | `t('暂无图片','No image')` | `t('暂无图片','No image', '이미지 없음')` |
  | 279 | `t('关闭','Close')` | `t('关闭','Close', '닫기')` |
  | 312 | `t('斑驳日志', 'Patch Log')` | `t('斑驳日志', 'Patch Log', '패치 로그')` |
  | 404 | `t('加载中…','Loading…')` | `t('加载中…','Loading…', '로딩 중…')` |
  | 414 | `t('日志加载失败', 'Failed to load log')` | `t('日志加载失败', 'Failed to load log', '로그 로드 실패')` |

- [ ] **Step 2: Commit**
  ```bash
  git add js/main.js
  git commit -m "feat: add Korean strings to all t() renderer calls"
  ```

---

### Task 4: Add Korean to tools, downloads, and projects in DATA

**Files:**
- Modify: `js/main.js:4-57` (DATA object)

- [ ] **Step 1: Add `nameKo` to the tool entry (line 28)**

  ```js
  nameKo: 'MC 요새 찾기',
  ```

- [ ] **Step 2: Update `renderTools()` language ternary (line 151)**

  Replace:
  ```js
  ${lang === 'zh' ? tool.name : (tool.nameEn || tool.name)}
  ```
  with:
  ```js
  ${lang === 'zh' ? tool.name : lang === 'ko' ? (tool.nameKo || tool.nameEn || tool.name) : (tool.nameEn || tool.name)}
  ```

- [ ] **Step 3: Add `nameKo` to download entries (lines 50-55)**

  Add `nameKo` to the Minecraft download entry. No change needed for `730` (name is language-neutral).

  ```js
  nameKo: 'Minecraft 1.21.8 서바이벌 월드',
  ```

- [ ] **Step 4: Update `renderDownloads()` language ternary (line 171)**

  Replace:
  ```js
  ${lang === 'zh' ? dl.name : (dl.nameEn || dl.name)}
  ```
  with:
  ```js
  ${lang === 'zh' ? dl.name : lang === 'ko' ? (dl.nameKo || dl.nameEn || dl.name) : (dl.nameEn || dl.name)}
  ```

- [ ] **Step 5: Add `nameEn` and `nameKo` to project entries (lines 11-21)**

  ```js
  {
    id: 'csai',
    name: 'CSAI',
    nameEn: 'CSAI',
    nameKo: 'CSAI',
    github: '',
    sub: [
      { name: 'CS Scout', nameKo: 'CS 스카우트', github: 'https://github.com/EytleBB/CS-Scout' },
      { name: 'CS Prophet', nameKo: 'CS 프로핏', github: 'https://github.com/EytleBB/CS-Prophet' },
      { name: 'CS HLTV Downloader', nameKo: 'CS HLTV 다운로더', github: 'https://github.com/EytleBB/CS-HLTV_Downloader' }
    ]
  }
  ```

- [ ] **Step 6: Update `renderProjects()` to use translated name (line 127)**

  Replace:
  ```js
  <span>${proj.name}</span>
  ```
  with:
  ```js
  <span>${lang === 'zh' ? proj.name : lang === 'ko' ? (proj.nameKo || proj.nameEn || proj.name) : (proj.nameEn || proj.name)}</span>
  ```

- [ ] **Step 7: Update `renderSubProjects()` to use translated name (line 243)**

  Replace:
  ```js
  <span>${sub.name}</span>
  ```
  with:
  ```js
  <span>${lang === 'zh' ? sub.name : lang === 'ko' ? (sub.nameKo || sub.name) : (sub.nameEn || sub.name)}</span>
  ```

- [ ] **Step 8: Commit**
  ```bash
  git add js/main.js
  git commit -m "feat: add Korean name fields to DATA entries"
  ```

---

### Task 5: Extend `applyLang()` and `applyTheme()` for Korean

**Files:**
- Modify: `js/main.js:469-492` (applyLang), `js/main.js:497-508` (applyTheme)

- [ ] **Step 1: Update `applyLang()` to handle `data-ko` attribute**

  Replace the entire `applyLang` function (lines 469-492) with:
  ```js
  function applyLang() {
    document.querySelectorAll('[data-zh]').forEach(el => {
      if (!el.classList.contains('nav-item')) {
        el.textContent = lang === 'zh'
          ? el.dataset.zh
          : lang === 'ko'
            ? (el.dataset.ko || el.dataset.en || el.dataset.zh)
            : (el.dataset.en || el.dataset.zh);
      }
    });

    document.querySelectorAll('.nav-item[data-zh]').forEach(btn => {
      btn.textContent = lang === 'zh'
        ? btn.dataset.zh
        : lang === 'ko'
          ? (btn.dataset.ko || btn.dataset.en || btn.dataset.zh)
          : (btn.dataset.en || btn.dataset.zh);
    });

    if (theme === 'dark') {
      themeLabel.textContent = lang === 'zh' ? '暗色模式' : lang === 'ko' ? '다크 모드' : 'Dark Mode';
    } else {
      themeLabel.textContent = lang === 'zh' ? '亮色模式' : lang === 'ko' ? '라이트 모드' : 'Light Mode';
    }

    if (activeSection) handleSection(activeSection);
  }
  ```

- [ ] **Step 2: Update `applyTheme()` theme labels (lines 500-507)**

  Replace the label assignments inside `applyTheme()`:
  ```js
  if (theme === 'dark') {
    iconMoon.style.display = '';
    iconSun.style.display  = 'none';
    themeLabel.textContent = lang === 'zh' ? '暗色模式' : lang === 'ko' ? '다크 모드' : 'Dark Mode';
  } else {
    iconMoon.style.display = 'none';
    iconSun.style.display  = '';
    themeLabel.textContent = lang === 'zh' ? '亮色模式' : lang === 'ko' ? '라이트 모드' : 'Light Mode';
  }
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add js/main.js
  git commit -m "feat: extend applyLang and applyTheme for Korean"
  ```

---

### Task 6: Add Korean button to HTML and `data-ko` attributes

**Files:**
- Modify: `index.html:28-30` (lang buttons), `index.html:49` (theme label), `index.html:57-62` (nav items)

- [ ] **Step 1: Add Korean language button**

  Replace lines 28-30:
  ```html
          <button class="lang-btn active" data-lang="zh">中文</button>
          <span class="lang-sep">/</span>
          <button class="lang-btn" data-lang="en">Eng</button>
  ```
  with:
  ```html
          <button class="lang-btn active" data-lang="zh">中文</button>
          <span class="lang-sep">/</span>
          <button class="lang-btn" data-lang="en">Eng</button>
          <span class="lang-sep">/</span>
          <button class="lang-btn" data-lang="ko">한글</button>
  ```

- [ ] **Step 2: Add `data-ko` to theme label (line 49)**

  ```html
  <span class="theme-label" data-zh="暗色模式" data-en="Dark Mode" data-ko="다크 모드">暗色模式</span>
  ```

- [ ] **Step 3: Add `data-ko` to nav items (lines 57-62)**

  ```html
          <button class="nav-item" data-section="about" data-zh="概况" data-en="Overview" data-ko="개요">概况</button>
          <button class="nav-item" data-section="projects" data-zh="项目" data-en="Projects" data-ko="프로젝트">项目</button>
          <button class="nav-item" data-section="tools" data-zh="工具" data-en="Tools" data-ko="도구">工具</button>
          <button class="nav-item" data-section="patchlog" data-ko="패치 로그">Patch Log</button>
          <button class="nav-item" data-section="gallery" data-zh="画廊" data-en="Gallery" data-ko="갤러리">画廊</button>
          <button class="nav-item" data-section="downloads" data-zh="下载" data-en="Downloads" data-ko="다운로드">下载</button>
  ```

- [ ] **Step 4: Commit**
  ```bash
  git add index.html
  git commit -m "feat: add Korean language button and data-ko attributes to HTML"
  ```

---

### Task 7: Add Korean font fallback to CSS

**Files:**
- Modify: `css/style.css:33` (--font custom property)

- [ ] **Step 1: Add Korean fonts to the font stack**

  Replace line 33:
  ```css
    --font: 'Segoe UI', system-ui, -apple-system, 'PingFang SC', sans-serif;
  ```
  with:
  ```css
    --font: 'Segoe UI', system-ui, -apple-system, 'PingFang SC', 'Malgun Gothic', 'Noto Sans KR', sans-serif;
  ```

  `Malgun Gothic` covers Windows; `Noto Sans KR` covers Android/ChromeOS/Linux.

- [ ] **Step 2: Commit**
  ```bash
  git add css/style.css
  git commit -m "feat: add Korean font fallbacks to CSS font stack"
  ```

---

### Task 8: Manual verification

- [ ] **Step 1: Open `index.html` in browser, click `한글`**
  - Nav items switch to Korean
  - Theme label shows `다크 모드`
  - Toggle theme: label shows `라이트 모드`

- [ ] **Step 2: Click each nav section in Korean mode**
  - **About:** label = `개요`
  - **Projects:** label = `프로젝트`, badge = `하위`, back button = `뒤로`, sub-project title = `하위 프로젝트`
  - **Tools:** label = `도구`, tool name = `MC 요새 찾기`
  - **Gallery:** label = `갤러리`, close = `닫기`, empty state = `이미지 없음`
  - **Patch Log:** label = `패치 로그`, month = `2026년 5월`, day heads = `월화수목금토일`, loading = `로딩 중…`, date = `2026년 5월 6일`
  - **Downloads:** label = `다운로드`, Minecraft = `Minecraft 1.21.8 서바이벌 월드`

- [ ] **Step 3: Switch back to 中文 and Eng, verify everything still works correctly**
