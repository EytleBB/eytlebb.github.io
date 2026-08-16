const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('forest motion suite is local, interactive, and motion-safe', () => {
  const html = read('index.html');
  const main = read('js/main.js');
  const style = read('css/style.css');

  assert.match(html, /<canvas class="ambient-motes" id="ambient-motes" aria-hidden="true"><\/canvas>/);
  assert.match(main, /document\.startViewTransition\(update\)/);
  assert.match(main, /pseudoElement: '::view-transition-new\(root\)'/);
  assert.match(main, /fallbackThemeWipe\(update, nextTheme, x, y, radius\)/);
  assert.match(main, /className = `theme-wipe to-\$\{nextTheme\}`/);
  assert.match(main, /requestAnimationFrame\(drawAmbient\)/);
  assert.match(main, /classList\.add\('motion-reveal'\)/);
  assert.match(main, /--surface-x/);
  assert.match(style, /@keyframes forest-content-in/);
  assert.match(style, /html\.theme-changing::view-transition-new\(root\)/);
  assert.match(style, /@media \(prefers-reduced-motion:reduce\)[\s\S]*\.motion-reveal \{ opacity:1 !important;/);
  assert.doesNotMatch(html, /tsparticles|gsap|motion\.dev|rellax/i);
});
