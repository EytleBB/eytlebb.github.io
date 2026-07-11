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
  assert.match(museum, /exhibitionTitle\.textContent = exhibitionName/);
  assert.match(museum, /const exhibitionName = T\('图画展览会', 'Pictures At An Exhibition', '전람회의 그림'\)/);
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
