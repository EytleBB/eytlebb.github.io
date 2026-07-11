# Pictures At An Exhibition Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the public Gallery/Museum feature to the exact trilingual Pictures At An Exhibition names and keep the longer title readable at every supported viewport.

**Architecture:** Preserve all existing `gallery` and `museum` implementation identifiers, routes, paths, caches, and repository URLs. Change only localized display data and visitor-facing copy, then add narrowly scoped CSS rules for rail, list-row, entry-overlay, and in-world title wrapping.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js built-in test runner/assertions.

## Global Constraints

- Chinese display name is exactly `图画展览会`.
- English display name is exactly `Pictures At An Exhibition`.
- Korean display name is exactly `전람회의 그림`.
- Keep `gallery`, `images/gallery/`, `museum.html`, gallery function/class/cache names, and `https://github.com/EytleBB/Eytle-Museum` unchanged.
- Do not edit generated `images/gallery/index.json` or historical specs/plans.
- Mobile navigation remains a single-line, horizontally scrollable row.

---

### Task 1: Add the rename contract and update the main site

**Files:**
- Create: `tests/pictures-at-an-exhibition.test.js`
- Modify: `index.html:41`
- Modify: `js/main.js:31-33,207,403-409`
- Modify: `css/style.css:98-107,220-239,364-373`

**Interfaces:**
- Consumes: the current `data-zh` / `data-en` / `data-ko`, `t()`, and `pick()` localization conventions.
- Produces: exact canonical labels in navigation, home/grid headings, and the localized `This is Eytle` sub-project.

- [ ] **Step 1: Write the failing Node contract test**

Create `tests/pictures-at-an-exhibition.test.js` using only Node built-ins. Read `index.html`, `js/main.js`, `museum.html`, `js/museum.js`, `css/style.css`, and `css/museum.css`; assert the exact three navigation attributes, localized sub-project object, main-site heading calls, museum title hook, canonical museum runtime title/error text, unchanged `data-section="gallery"`, unchanged `museum.html` route, unchanged repository URL, and the CSS hooks `.nav-i`, `.list-item .label`, `#enter h1`, and `#title`.

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('canonical exhibition names are wired through every visitor-facing surface', () => {
  const index = read('index.html');
  const main = read('js/main.js');
  const museumHtml = read('museum.html');
  const museum = read('js/museum.js');

  assert.match(index, /data-section="gallery"[^>]+data-zh="图画展览会"[^>]+data-en="Pictures At An Exhibition"[^>]+data-ko="전람회의 그림"/);
  assert.match(main, /name: '图画展览会',\s+nameEn: 'Pictures At An Exhibition',\s+nameKo: '전람회의 그림',\s+github: 'https:\/\/github\.com\/EytleBB\/Eytle-Museum'/);
  assert.equal((main.match(/t\('图画展览会','Pictures At An Exhibition','전람회의 그림'\)/g) || []).length, 3);
  assert.match(museumHtml, /<h1 id="exhibition-title"><\/h1>/);
  assert.match(museum, /exhibitionTitle\.textContent = T\('图画展览会', 'Pictures At An Exhibition', '전람회의 그림'\)/);
  assert.match(museum, /fail\(\s*'图画展览会暂无图片或加载失败。',\s*'Pictures At An Exhibition is empty or failed to load\.',\s*'전람회의 그림을 불러오지 못했습니다\.'\s*\)/s);
  assert.match(main, /location\.href = 'museum\.html'/);
});

test('long-title layout hooks remain present', () => {
  const style = read('css/style.css');
  const museumStyle = read('css/museum.css');

  assert.match(style, /\.nav-i\s*\{[^}]*line-height:/s);
  assert.match(style, /\.list-item \.label\s*\{[^}]*overflow-wrap:/s);
  assert.match(museumStyle, /#enter h1\s*\{[^}]*max-width:/s);
  assert.match(museumStyle, /#title\s*\{[^}]*max-width:/s);
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `node --test tests/pictures-at-an-exhibition.test.js`

Expected: FAIL because the old `画廊` / `Gallery` / `갤러리` labels and static museum heading are still present.

- [ ] **Step 3: Update the main-site localized labels**

In `index.html`, keep `data-section="gallery"` and replace its language attributes with the three canonical names.

In `js/main.js`, change the former Museum sub-project to:

```js
{
  name: '图画展览会',
  nameEn: 'Pictures At An Exhibition',
  nameKo: '전람회의 그림',
  github: 'https://github.com/EytleBB/Eytle-Museum'
},
```

Replace the three visitor-facing gallery heading calls with:

```js
t('图画展览会','Pictures At An Exhibition','전람회의 그림')
```

- [ ] **Step 4: Add focused main-site long-title CSS**

Add a readable line height and wrapping to desktop `.nav-i`; keep mobile items single-line with `white-space:nowrap`. Add `flex:1 1 auto`, `overflow-wrap:anywhere`, and a suitable line height to `.list-item .label`; add `flex:0 0 auto` to `.list-item .right` so the external icon remains visible.

- [ ] **Step 5: Run the contract test to confirm only museum assertions remain failing**

Run: `node --test tests/pictures-at-an-exhibition.test.js`

Expected: the canonical-name test still FAILS at the museum heading/runtime assertion; the main-site patterns and layout-hook assertions pass.

- [ ] **Step 6: Commit the main-site change and test scaffold**

```powershell
git add -- index.html js/main.js css/style.css tests/pictures-at-an-exhibition.test.js
git commit -m "feat: rename gallery exhibition across main site"
```

---

### Task 2: Update the standalone 3D exhibition

**Files:**
- Modify: `museum.html:6,47`
- Modify: `js/museum.js:15-29,68,1817`
- Modify: `css/museum.css:13-18,35-39`
- Test: `tests/pictures-at-an-exhibition.test.js`

**Interfaces:**
- Consumes: persisted `lang`, existing `T(zh, en, ko)`, and the `#enter`/`#title` chrome.
- Produces: one localized canonical title on the entry/pause overlay and a collision-safe in-world title.

- [ ] **Step 1: Replace static museum title markup with a localization hook**

Use a neutral initial document title and replace the bilingual heading:

```html
<title>This is Eytle</title>
...
<h1 id="exhibition-title"></h1>
```

- [ ] **Step 2: Populate all museum title surfaces from the active language**

Add `exhibitionTitle` to the DOM references and set:

```js
const exhibitionName = T('图画展览会', 'Pictures At An Exhibition', '전람회의 그림');
document.title = `${exhibitionName} · This is Eytle`;
exhibitionTitle.textContent = exhibitionName;
titleEl.textContent = `${exhibitionName} — This is Eytle`;
```

Change the visitor-facing subtitle to avoid the retired Gallery/Museum nouns:

```js
enterSub.textContent = T('灯光下的私人展览', 'A private exhibition under focused light', '조명 아래의 개인 전시');
```

Change the boot failure message to the canonical feature name in all languages:

```js
fail(
  '图画展览会暂无图片或加载失败。',
  'Pictures At An Exhibition is empty or failed to load.',
  '전람회의 그림을 불러오지 못했습니다.'
);
```

- [ ] **Step 3: Fit the entry and in-world long titles**

For `#enter h1`, add centered text, `max-width:min(90vw, 900px)`, responsive `line-height`, `padding-inline`, and `overflow-wrap:anywhere`. Remove the unused `#enter h1 em` rule. For `#title`, add a width bounded away from the exit button, `max-width:calc(100vw - 92px)`, a responsive font size, line height, and wrapping.

- [ ] **Step 4: Run the contract test and JavaScript syntax checks**

Run:

```powershell
node --test tests/pictures-at-an-exhibition.test.js
node --check js/main.js
node --check js/museum.js
```

Expected: all tests PASS and both syntax checks exit 0.

- [ ] **Step 5: Commit the 3D exhibition rename**

```powershell
git add -- museum.html js/museum.js css/museum.css
git commit -m "feat: rename standalone 3d exhibition"
```

---

### Task 3: Refresh current documentation and complete regression checks

**Files:**
- Modify: `维护手册.md:27-47,110,147-151`
- Modify: `README.md:6-25`
- Modify: `CLAUDE.md:17-71`
- Test: `tests/pictures-at-an-exhibition.test.js`

**Interfaces:**
- Consumes: canonical public names and preserved internal `gallery` / `museum` identifiers.
- Produces: maintenance documentation that clearly separates the public feature name from internal paths/scripts.

- [ ] **Step 1: Update current documentation terminology**

Rename public-facing headings and prose to `图画展览会（Pictures At An Exhibition）`. Where commands or paths are discussed, retain literal identifiers such as `scripts/gallery-renamer.js`, `images/gallery/`, `gallery` hash, and `museum.html`. In `CLAUDE.md`, describe the 3D page as the implementation behind Pictures At An Exhibition while retaining the filename and capability function names.

- [ ] **Step 2: Run exact-name, legacy-copy, and compatibility searches**

Run:

```powershell
node --test tests/pictures-at-an-exhibition.test.js
rg -n "图画展览会|Pictures At An Exhibition|전람회의 그림" index.html js/main.js museum.html js/museum.js README.md 维护手册.md CLAUDE.md
rg -n "画廊|Gallery|갤러리|Museum|뮤지엄" index.html js/main.js museum.html js/museum.js
rg -n "data-section=\"gallery\"|images/gallery|museum\.html|Eytle-Museum" index.html js/main.js museum.html js/museum.js
```

Expected: the test passes; canonical names appear on all intended surfaces; legacy public labels are absent except in implementation/repository identifiers; compatibility identifiers remain present.

- [ ] **Step 3: Run final repository checks**

Run:

```powershell
node --check js/main.js
node --check js/museum.js
git diff --check
git status --short
```

Expected: both JavaScript files parse, `git diff --check` emits no errors, and status lists only the intended documentation changes plus the pre-existing untracked `AGENTS.md`.

- [ ] **Step 4: Commit documentation**

```powershell
git add -- README.md 维护手册.md CLAUDE.md
git commit -m "docs: adopt exhibition name in maintenance guides"
```
