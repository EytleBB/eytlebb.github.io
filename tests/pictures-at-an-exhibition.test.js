const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('canonical exhibition names are wired through every visitor-facing surface', () => {
  const index = read('index.html');
  const main = read('js/main.js');
  const museumHtml = read('museum.html');
  const museum = read('js/museum.js');

  assert.match(index, /data-section="gallery"[^>]+data-zh="图画展览会"[^>]+data-en="Pictures At An Exhibition"[^>]+data-ko="전람회의 그림"/);
  assert.match(main, /name: '图画展览会',\s+nameEn: 'Pictures At An Exhibition',\s+nameKo: '전람회의 그림',\s+github: 'https:\/\/github\.com\/EytleBB\/Eytle-Museum'/);
  const home = main.slice(main.indexOf('async function renderAbout()'), main.indexOf('function renderProjects()'));
  assert.match(home, /<h2>\$\{t\('图画展览会','Pictures At An Exhibition','전람회의 그림'\)\}<\/h2>/);
  assert.match(museumHtml, /<h1 id="exhibition-title"><\/h1>/);
  assert.match(museum, /exhibitionTitle\.textContent = exhibitionName/);
  assert.match(museum, /const exhibitionName = T\('图画展览会', 'Pictures At An Exhibition', '전람회의 그림'\)/);
  assert.match(museum, /fail\(\s*'暂无图片，或图片加载失败。请刷新重试。',\s*'No images are available, or the images failed to load\. Please reload and try again\.',\s*'이미지가 없거나 불러오지 못했습니다\. 새로고침 후 다시 시도하세요\.'\s*\)/s);
  assert.match(main, /location\.href = 'museum\.html'/);
});

test('failed, empty and populated web exhibitions retain their localized heading and distinct states', async () => {
  const main = read('js/main.js');
  const sources = [
    main.match(/function sectionHeading\([^\n]+\) \{[\s\S]*?\n\}/)[0],
    main.match(/async function renderGallery\(\) \{[\s\S]*?\n\}/)[0]
  ].join('\n');
  for (const [language, title] of ['图画展览会', 'Pictures At An Exhibition', '전람회의 그림'].entries()) {
    for (const state of ['failed', 'empty', 'populated']) {
      const populated = state === 'populated';
      const stage = { innerHTML: '' };
      const context = vm.createContext({
        stage,
        stageRenderEpoch: 1,
        DATA: { gallery: populated ? [{ src: 'photo.jpg', preview: 'preview.webp' }] : [] },
        GALLERY_BATCH_SIZE: 24,
        t: (...labels) => labels[language],
        escapeHtml: text => text,
        placeholder: text => `<p>${text}</p>`,
        loadGallery: async () => state !== 'failed',
        enhanceMotion() {},
        cacheGalleryImages() {},
        document: { getElementById: () => ({ insertAdjacentHTML() {}, querySelectorAll: () => [] }) },
        IntersectionObserver: class { observe() {} }
      });
      vm.runInContext(sources, context);
      await context.renderGallery();
      assert.ok(stage.innerHTML.includes(`<h1>${title}</h1>`), `${title}: ${state}`);
      assert.equal(stage.innerHTML.includes('id="gallery-grid"'), populated);
      if (state === 'failed') {
        assert.match(stage.innerHTML, /role="status"/);
        assert.doesNotMatch(stage.innerHTML, /暂无图片|No images yet|이미지 없음/);
      }
    }
  }
});

test('long-title layout hooks remain present', () => {
  const style = read('css/style.css');
  const museumStyle = read('css/museum.css');

  assert.match(style, /\.nav-i\s*\{[^}]*line-height:/s);
  assert.match(style, /\.list-item \.label\s*\{[^}]*overflow-wrap:/s);
  assert.match(museumStyle, /#enter h1\s*\{[^}]*max-width:/s);
  assert.match(museumStyle, /#title\s*\{[^}]*max-width:/s);
});

test('entry button stays hidden until the museum is ready', () => {
  const museumStyle = read('css/museum.css');
  const museum = read('js/museum.js');

  assert.match(museumStyle, /#enter \.go\[disabled\]\s*\{[^}]*display:\s*none/s);
  assert.match(museum, /enterGo\.textContent = T\('进入展馆', 'Enter exhibition', '전시장 입장'\);\s*enterGo\.disabled = false;/s);
});

test('retired visitor-facing labels are absent', () => {
  const publicSources = [
    read('index.html'),
    read('js/main.js'),
    read('museum.html'),
    read('js/museum.js')
  ].join('\n');

  assert.doesNotMatch(publicSources, /data-zh="画廊"|data-en="Gallery"|data-ko="갤러리"/);
  assert.doesNotMatch(publicSources, /t\('画廊','Gallery','갤러리'\)/);
  assert.doesNotMatch(publicSources, /<h1>画廊|Gallery — This is Eytle|갤러리 — This is Eytle/);
  assert.doesNotMatch(publicSources, /Museum music is unavailable/);
});
