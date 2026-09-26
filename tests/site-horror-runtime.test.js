const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/site-horror.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function target() {
  const handlers = new Map();
  return {
    addEventListener(type, callback) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(callback);
    },
    emit(type) { for (const callback of handlers.get(type) || []) callback({ type }); },
  };
}
function runtime({ active = false, wait = false, reject = false } = {}) {
  const imports = [], presentations = [], pending = [];
  const document = { ...target(), hidden: false,
    documentElement: { className: active ? 'site-horror' : '' },
    createElement() { assert.fail('the idle runtime must not create DOM or canvases'); } };
  const window = { ...target(), eytleHorror: { isActive: () => active } };
  const code = source.replace(/\bimport\(([^)]+)\)/g, 'loadModule($1)')
    .replace('presentation = createSiteHorrorPresentation(', 'presentation = makePresentation(');
  vm.runInNewContext(code, {
    window, document,
    loadModule(url) {
      imports.push(url);
      if (reject) return Promise.reject(new Error('offline optional module'));
      const module = url.includes('glyphs') ? { createPixelGlyphPainter() {} } : { createMuseumHorrorUI() {} };
      return wait ? new Promise(resolve => pending.push(() => resolve(module))) : Promise.resolve(module);
    },
    makePresentation() {
      const presentation = { resumes: 0, pauses: 0, running: false,
        resume() { this.resumes++; this.running = !document.hidden; },
        pause() { this.pauses++; this.running = false; } };
      presentations.push(presentation); return presentation;
    },
  });
  return { window, document, imports, presentations,
    activate() { active = true; document.documentElement.className = 'site-horror'; window.emit('eytle:horror'); },
    resolveImports() { pending.splice(0).forEach(resolve => resolve()); } };
}

test('ordinary pages stay inert across normal visibility and navigation events', async () => {
  const h = runtime();
  h.window.emit('eytle:horror'); h.window.emit('pageshow');
  h.document.hidden = true; h.document.emit('visibilitychange');
  h.document.hidden = false; h.document.emit('visibilitychange');
  h.window.emit('pagehide'); h.window.emit('pageshow');
  await settle();
  assert.deepEqual(h.imports, []);
  assert.equal(h.presentations.length, 0);
  assert.equal(h.document.documentElement.className, '');
});

test('activation loads optional drawing modules once and coalesces repeated events while loading or running', async () => {
  const h = runtime({ wait: true });
  h.activate(); h.activate(); h.window.emit('pageshow');
  assert.equal(h.imports.length, 2);
  assert.equal(h.presentations.length, 0);
  h.resolveImports(); await settle();
  assert.equal(h.presentations.length, 1);
  assert.equal(h.presentations[0].resumes, 1);
  h.activate(); h.activate(); await settle();
  assert.equal(h.imports.length, 2);
  assert.equal(h.presentations.length, 1);
  assert.equal(h.presentations[0].resumes, 1);
});

test('hidden and BFCache-away pages pause, only foreground return resumes, and late imports never resume an away page', async () => {
  const h = runtime({ active: true });
  await settle();
  const presentation = h.presentations[0];
  assert.equal(presentation.running, true);
  h.document.hidden = true; h.document.emit('visibilitychange');
  assert.equal(presentation.running, false);
  h.document.hidden = false; h.document.emit('visibilitychange');
  assert.equal(presentation.running, true);
  h.window.emit('pagehide');
  assert.equal(presentation.running, false);
  const resumes = presentation.resumes;
  h.document.emit('visibilitychange');
  assert.equal(presentation.resumes, resumes, 'visibility alone cannot resume a page held away in BFCache');
  h.window.emit('pageshow');
  assert.equal(presentation.running, true);
  assert.equal(h.presentations.length, 1);
  const delayed = runtime({ active: true, wait: true });
  delayed.window.emit('pagehide');
  delayed.resolveImports(); await settle();
  assert.equal(delayed.presentations.length, 1);
  assert.equal(delayed.presentations[0].resumes, 0);
  delayed.window.emit('pageshow');
  assert.equal(delayed.presentations[0].resumes, 1);
});

test('optional renderer import failure leaves the synchronous CSS theme and native page intact', async () => {
  const h = runtime({ active: true, reject: true });
  await settle();
  assert.equal(h.document.documentElement.className, 'site-horror');
  assert.equal(h.window.eytleHorror.isActive(), true);
  assert.equal(h.presentations.length, 0);
  assert.equal(h.imports.length, 2);
  h.window.emit('pageshow'); await settle();
  assert.equal(h.imports.length, 4, 'a later page restoration may retry transient network failure');
  assert.equal(h.document.documentElement.className, 'site-horror');
});

// Run the shipped presentation/tick, not a rewritten timing approximation.
function presentationClock({ reducedMotion = false, admin = false } = {}) {
  const callbacks = new Map();
  const canvases = [];
  let nextId = 1, uiFactories = 0;
  const noop = () => {};
  const document = {
    hidden: false, documentElement: { clientWidth: 1280 },
    getElementById: () => admin ? {} : null,
    querySelector: () => null, querySelectorAll: () => [],
    body: { prepend: noop },
    createElement() {
      const ctx = { fillRect: noop, clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop,
        closePath: noop, fill: noop, drawImage: noop };
      const canvas = { dataset: {}, setAttribute: noop, getContext: () => ctx };
      canvases.push(canvas); return canvas;
    },
  };
  const start = source.indexOf('function createSiteHorrorPresentation(');
  const end = source.indexOf("window.addEventListener('eytle:horror'");
  const createPresentation = vm.runInNewContext(`let away = false;\n${source.slice(start, end)}\ncreateSiteHorrorPresentation;`, {
    document,
    window: { innerHeight: 720, addEventListener: noop, matchMedia: () => ({ matches: reducedMotion, addEventListener: noop }) },
    requestAnimationFrame(callback) { const id = nextId++; callbacks.set(id, callback); return id; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
  });
  const presentation = createPresentation({
    createPixelGlyphPainter: () => ({ line: noop }),
    createMuseumHorrorUI: () => { uiFactories++; return { enable: noop, update: noop, dispose: noop }; },
  });
  return { presentation, canvases, callbacks, get uiFactories() { return uiFactories; },
    tick(now) {
      const entry = callbacks.entries().next().value;
      if (!entry) return;
      callbacks.delete(entry[0]); entry[1](now);
    },
    get frames() { return Number(canvases[0].dataset.frame); } };
}

test('the actual renderer remains at 24 Hz with fractional animation timestamps at common refresh rates', () => {
  for (const fps of [30, 60, 120, 144]) {
    const h = presentationClock();
    h.presentation.resume();
    for (let i = 0; i < fps * 10; i++) h.tick(1000 + i * 1000 / fps);
    assert.ok(h.frames >= 239 && h.frames <= 241, `${fps} Hz screen produced ${h.frames} redraws in 10 seconds`);
    assert.equal(h.callbacks.size, 1, 'exactly one animation loop is scheduled');
    h.presentation.pause();
    assert.equal(h.callbacks.size, 0);
    const frames = h.frames;
    h.tick(30000);
    assert.equal(h.frames, frames);
  }
});

test('reduced motion redraws at two Hz and administration avoids text corruption and an ongoing animation loop', () => {
  const reduced = presentationClock({ reducedMotion: true });
  reduced.presentation.resume();
  for (let i = 0; i < 600; i++) reduced.tick(1000 + i * 1000 / 60);
  assert.ok(reduced.frames >= 19 && reduced.frames <= 21, `${reduced.frames} reduced-motion redraws`);
  reduced.presentation.pause();
  const admin = presentationClock({ admin: true });
  assert.equal(admin.uiFactories, 0);
  admin.presentation.resume(); admin.tick(1000);
  assert.equal(admin.callbacks.size, 0, 'admin remains a static background, preserving functional labels');
});

test('all public HTML entries read tab state synchronously before CSS, with one appropriate renderer', () => {
  for (const filename of ['index.html', 'museum.html', 'mc-calc.html', 'museum-admin.html']) {
    const html = fs.readFileSync(path.join(root, filename), 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*>/gi)];
    const states = scripts.filter(match => /\bsrc=["'](?:\.\/)?js\/site-horror-state\.js(?:\?[^"']*)?["']/i.test(match[0]));
    assert.equal(states.length, 1, `${filename}: one shared tab state bridge`);
    assert.ok(states[0].index > html.indexOf('<head>') && states[0].index < html.indexOf('</head>'));
    assert.ok(!/\b(?:async|defer|type)\s*(?:=|>|\s)/i.test(states[0][0]), `${filename}: head state must be a synchronous classic script`);
    const firstCSS = html.search(/<link\b[^>]*\brel=["']stylesheet["']/i);
    assert.ok(states[0].index < firstCSS, `${filename}: class is set before theme CSS`);
    const runtimeScripts = scripts.filter(match => /\bsrc=["'](?:\.\/)?js\/site-horror\.js(?:\?[^"']*)?["']/i.test(match[0]));
    if (filename === 'museum.html') {
      assert.equal(runtimeScripts.length, 0, 'the museum uses its own 3D renderer');
    } else {
      assert.equal(runtimeScripts.length, 1, `${filename}: one site presentation runtime`);
      assert.match(runtimeScripts[0][0], /\btype=["']module["']/i);
      assert.match(html, /href=["'](?:\.\/)?css\/site-horror\.css(?:\?[^"']*)?["']/i);
    }
  }
});

test('only the museum transition activates persistent horror; ordinary pages only read the state', () => {
  const calls = [];
  const activate = /\beytleHorror\s*(?:\?\.|\.)\s*activate\s*\(/g;
  for (const entry of fs.readdirSync(path.join(root, 'js'), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const code = fs.readFileSync(path.join(root, 'js', entry.name), 'utf8');
    for (const match of code.matchAll(activate)) calls.push({ file: entry.name, index: match.index });
  }
  assert.deepEqual(calls.map(call => call.file), ['museum.js']);
  const museum = fs.readFileSync(path.join(root, 'js/museum.js'), 'utf8');
  assert.match(museum.slice(Math.max(0, calls[0].index - 45), calls[0].index), /onActivate\(\)\s*\{/);
  for (const filename of ['index.html', 'mc-calc.html', 'museum-admin.html']) {
    assert.equal([...fs.readFileSync(path.join(root, filename), 'utf8').matchAll(activate)].length, 0);
  }
});
