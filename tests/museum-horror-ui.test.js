const test = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../js/museum-horror-ui.js');

test('visual gibberish preserves whitespace and Unicode character count', async () => {
  const { scrambleMuseumText } = await modulePromise;
  const source = 'Museum / 展览会\n A\t이름 👁';
  const corrupted = scrambleMuseumText(source, () => 0.42);
  assert.equal(Array.from(corrupted).length, Array.from(source).length);
  assert.deepEqual(Array.from(corrupted).filter(character => /\s/u.test(character)), Array.from(source).filter(character => /\s/u.test(character)));
  assert.ok(!corrupted.includes('Museum'));
  assert.ok(!corrupted.includes('展览会'));
  assert.equal(scrambleMuseumText('', () => 0), '');
});

test('constructing an inactive horror UI performs no DOM mutations or observer setup', async () => {
  const { createMuseumHorrorUI } = await modulePromise;
  const root = { ownerDocument: { body: {} } };
  const ui = createMuseumHorrorUI({ root });
  assert.doesNotThrow(() => {
    ui.update(1);
    ui.update(Number.NaN);
    ui.dispose();
  });
  assert.deepEqual(root, { ownerDocument: { body: {} } });
});

// Minimal DOM surface for testing real wrapping, observation and form ownership.
function uiDocument() {
  const mutationObservers = [], resizeObservers = [], intersections = [], canvases = [];
  let ranges = 0;
  const document = { hidden: false };
  class Node {
    constructor(tagName = '', data) {
      this.ownerDocument = document;
      this.tagName = tagName.toLowerCase();
      this.nodeType = data === undefined ? 1 : 3;
      this.data = data;
      this.childNodes = [];
      this.parentNode = null;
      this.className = '';
      this.attributes = new Map();
      const properties = new Map();
      this.style = { setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name),
        getPropertyValue: name => properties.get(name) || '', getPropertyPriority: () => '' };
      this.classList = {
        contains: name => this.className.split(' ').includes(name),
        add: name => { if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim(); },
        remove: name => { this.className = this.className.split(' ').filter(value => value !== name).join(' '); },
      };
    }
    get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
    get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.map(node => node.textContent).join(''); }
    append(...nodes) { for (const node of nodes) { node.remove(); this.childNodes.push(node); node.parentNode = this; } }
    remove() { if (this.parentNode) { const siblings = this.parentNode.childNodes; siblings.splice(siblings.indexOf(this), 1); this.parentNode = null; } }
    replaceWith(...nodes) {
      const parent = this.parentNode;
      if (!parent) return;
      const index = parent.childNodes.indexOf(this);
      for (const node of nodes) node.remove();
      parent.childNodes.splice(index, 1, ...nodes);
      this.parentNode = null;
      for (const node of nodes) node.parentNode = parent;
    }
    after(node) {
      const parent = this.parentNode;
      if (!parent) return;
      node.remove();
      parent.childNodes.splice(parent.childNodes.indexOf(this) + 1, 0, node);
      node.parentNode = parent;
    }
    contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    matches(selector) {
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      if (/^[a-z]+\.[\w-]+$/.test(selector)) {
        const [tag, className] = selector.split('.');
        return this.tagName === tag && this.classList.contains(className);
      }
      if (selector.startsWith('[contenteditable]')) return this.hasAttribute('contenteditable') && this.getAttribute('contenteditable') !== 'false';
      if (selector === '[hidden]') return this.hasAttribute('hidden');
      if (selector.includes('[placeholder]')) return this.tagName === selector.split('[')[0] && this.hasAttribute('placeholder');
      return selector === this.tagName;
    }
    closest(selectors) {
      for (let current = this; current; current = current.parentElement) {
        if (selectors.split(',').some(selector => current.matches(selector))) return current;
      }
      return null;
    }
    querySelectorAll(selectors) {
      const result = [];
      const visit = node => {
        for (const child of node.childNodes) {
          if (child.nodeType === 1 && selectors.split(',').some(selector => child.matches(selector))) result.push(child);
          visit(child);
        }
      };
      visit(this); return result;
    }
    getBoundingClientRect() {
      return this.bounds || this.parentElement?.getBoundingClientRect() || { left: 0, top: 0, width: 240, height: 16 };
    }
  }
  document.createElement = tagName => {
    const node = new Node(tagName);
    if (tagName === 'canvas') {
      node.width = 300; node.height = 150;
      const context = { draws: 0, pixels: 0, imageDraws: 0,
        clearRect() { this.draws++; }, fillRect() { this.pixels++; }, drawImage() { this.imageDraws++; } };
      node.getContext = () => context;
      canvases.push(node);
    }
    return node;
  };
  document.createTextNode = data => new Node('', data);
  document.createTreeWalker = root => {
    const texts = [];
    const walk = node => { for (const child of node.childNodes) { if (child.nodeType === 3) texts.push(child); else walk(child); } };
    walk(root);
    let index = -1;
    return { nextNode() { index++; this.currentNode = texts[index]; return Boolean(this.currentNode); } };
  };
  document.createRange = () => {
    ranges++;
    let node, start, end;
    return { setStart(value, offset) { node = value; start = offset; }, setEnd(value, offset) { end = offset; },
      getBoundingClientRect() { const bounds = node.parentElement.getBoundingClientRect(); return { left: bounds.left + start * 8, top: bounds.top, width: (end - start) * 8, height: 16 }; }, detach() {} };
  };
  class Observer {
    constructor(callback, list) { this.callback = callback; this.observed = new Set(); this.removed = []; this.disconnects = 0; list.push(this); }
    observe(node) { this.observed.add(node); }
    unobserve(node) { this.observed.delete(node); this.removed.push(node); }
    disconnect() { this.disconnects++; this.observed.clear(); }
    takeRecords() { return []; }
  }
  document.defaultView = {
    devicePixelRatio: 1,
    getComputedStyle: () => ({ fontSize: '14px' }),
    addEventListener() {}, removeEventListener() {},
    MutationObserver: class extends Observer { constructor(callback) { super(callback, mutationObservers); } },
    ResizeObserver: class extends Observer { constructor(callback) { super(callback, resizeObservers); } },
    IntersectionObserver: class extends Observer { constructor(callback) { super(callback, intersections); } },
  };
  const root = document.body = document.createElement('body');
  function element(tag, text, parent = root) {
    const node = document.createElement(tag);
    if (text !== undefined) node.append(document.createTextNode(text));
    parent.append(node); return node;
  }
  return { document, root, element, canvases, mutationObservers, resizeObservers, intersections,
    get ranges() { return ranges; },
    intersect(wrapper, isIntersecting) { intersections[0].callback([{ target: wrapper, isIntersecting }]); },
    mutate() { mutationObservers[0].callback([]); } };
}

test('visibleOnly observes text but allocates and draws pixels only for visible records', async () => {
  const { createMuseumHorrorUI } = await modulePromise;
  const h = uiDocument();
  const paragraphs = Array.from({ length: 80 }, (_, i) => h.element('p', `Log ${i}`));
  const ui = createMuseumHorrorUI({ root: h.root, visibleOnly: true });
  ui.enable();
  assert.equal(h.intersections.length, 1);
  const io = h.intersections[0];
  assert.equal(io.observed.size, 80);
  assert.equal(h.ranges, 0, 'offscreen text performs no character layout');
  assert.ok(h.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
  for (let i = 0; i < 24; i++) ui.update(1 / 24);
  assert.ok(h.canvases.every(canvas => canvas.getContext().draws === 0));
  const firstWrapper = paragraphs[0].childNodes[0];
  const secondWrapper = paragraphs[1].childNodes[0];
  h.intersect(firstWrapper, true); h.intersect(secondWrapper, true);
  ui.update(1 / 24);
  assert.equal(h.ranges, 2);
  assert.equal(h.canvases.filter(canvas => canvas.getContext().draws > 0).length, 2);
  const firstCanvas = firstWrapper.childNodes[1], secondCanvas = secondWrapper.childNodes[1];
  h.intersect(firstWrapper, false);
  for (let i = 0; i < 6; i++) ui.update(1 / 24);
  assert.equal(firstCanvas.getContext().draws, 1, 'leaving the viewport stops all animated drawing');
  assert.equal(secondCanvas.getContext().draws, 7);
  assert.equal(h.ranges, 2, 'visible animation reuses measured character cells');
  h.intersect(firstWrapper, true); ui.update(1 / 24);
  assert.equal(firstCanvas.getContext().draws, 2);
  assert.equal(h.ranges, 3, 're-entry rechecks the layout');
  ui.dispose();
  assert.equal(io.disconnects, 1);
  assert.equal(io.observed.size, 0);
  assert.ok(h.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
  assert.ok(paragraphs.every(paragraph => paragraph.childNodes[0].nodeType === 3));
});

test('dynamic log removal unobserves text and new records wait for intersection; default museum drawing is unchanged', async () => {
  const { createMuseumHorrorUI } = await modulePromise;
  const h = uiDocument();
  const old = h.element('p', 'Old log');
  const ui = createMuseumHorrorUI({ root: h.root, visibleOnly: true });
  ui.enable();
  const wrapper = old.childNodes[0], canvas = wrapper.childNodes[1];
  h.intersect(wrapper, true); ui.update(1 / 24);
  old.remove();
  const next = h.element('p', 'Next log');
  h.mutate(); ui.update(1 / 24);
  assert.ok(h.intersections[0].removed.includes(wrapper));
  assert.equal(canvas.width, 0);
  assert.equal(canvas.getContext().draws, 1);
  const nextWrapper = next.childNodes[0], nextCanvas = nextWrapper.childNodes[1];
  assert.ok(h.intersections[0].observed.has(nextWrapper));
  assert.equal(nextCanvas.getContext().draws, 0);
  h.intersect(nextWrapper, true); ui.update(1 / 24);
  assert.equal(nextCanvas.getContext().draws, 1);
  ui.dispose();
  h.intersect(nextWrapper, true); ui.update(1);
  assert.equal(nextCanvas.getContext().draws, 1, 'late observer callbacks cannot restart disposed work');
  const legacy = uiDocument();
  legacy.element('p', 'Museum title');
  const museum = createMuseumHorrorUI({ root: legacy.root });
  museum.enable();
  assert.equal(legacy.intersections.length, 0, 'the original default adds no viewport observer');
  assert.equal(legacy.canvases[0].getContext().draws, 1);
  museum.update(1 / 24);
  assert.equal(legacy.canvases[0].getContext().draws, 2);
  museum.dispose();
});

test('main-site hidden fields and screen-reader text are ignored and nativeLabels false preserves form display and values', async () => {
  const { createMuseumHorrorUI } = await modulePromise;
  const h = uiDocument();
  const hp = h.element('div', 'Invisible honeypot'); hp.className = 'hp-field';
  const hiddenInput = h.element('input', undefined, hp); hiddenInput.setAttribute('placeholder', 'Never change'); hiddenInput.value = 'bot-value';
  const sr = h.element('span', 'Accessible instructions'); sr.className = 'sr-only';
  const input = h.element('input'); input.setAttribute('placeholder', 'Your message'); input.value = 'Visitor draft';
  const select = h.element('select');
  const option = h.element('option', 'English', select); option.setAttribute('label', 'English label'); option.value = 'en';
  h.element('p', 'Visible title');
  const ui = createMuseumHorrorUI({ root: h.root, nativeLabels: false });
  ui.enable(); ui.update(1 / 24);
  assert.equal(h.canvases.length, 1, 'only the ordinary visible text is wrapped');
  assert.equal(hp.childNodes[0].nodeType, 3); assert.equal(sr.childNodes[0].nodeType, 3);
  assert.equal(input.getAttribute('placeholder'), 'Your message');
  assert.equal(input.hasAttribute('aria-placeholder'), false);
  assert.equal(option.getAttribute('label'), 'English label');
  assert.equal(option.hasAttribute('aria-label'), false);
  assert.equal(input.value, 'Visitor draft'); assert.equal(option.value, 'en');
  assert.equal(hiddenInput.getAttribute('placeholder'), 'Never change');
  assert.equal(hiddenInput.value, 'bot-value');
  ui.dispose();
  assert.equal(input.value, 'Visitor draft'); assert.equal(option.value, 'en');
});

test('default museum native labels still animate and restore without changing typed or selected values', async () => {
  const { createMuseumHorrorUI } = await modulePromise;
  const h = uiDocument();
  const input = h.element('textarea'); input.setAttribute('placeholder', 'Your message'); input.value = 'Actual draft';
  const select = h.element('select'); const option = h.element('option', 'English', select); option.value = 'en';
  const hidden = h.element('div'); hidden.className = 'hp-field';
  const hpInput = h.element('input', undefined, hidden); hpInput.setAttribute('placeholder', 'Leave empty');
  const ui = createMuseumHorrorUI({ root: h.root });
  ui.enable();
  assert.notEqual(input.getAttribute('placeholder'), 'Your message');
  assert.notEqual(option.getAttribute('label'), 'English');
  assert.equal(input.value, 'Actual draft'); assert.equal(option.value, 'en');
  assert.equal(hpInput.getAttribute('placeholder'), 'Leave empty');
  ui.dispose();
  assert.equal(input.getAttribute('placeholder'), 'Your message');
  assert.equal(option.getAttribute('label'), null);
  assert.equal(option.textContent, 'English');
  assert.equal(input.value, 'Actual draft'); assert.equal(option.value, 'en');
});

test('application mutations cover new text and guestbook pictures before the next pixel-animation frame', async () => {
  const { createMuseumHorrorUI } = await modulePromise;
  const h = uiDocument();
  const existing = h.element('p', 'Existing label');
  const ui = createMuseumHorrorUI({ root: h.root, artCanvas: { width: 256, height: 256 } });
  ui.enable();
  const existingWrapper = existing.childNodes[0], existingCanvas = existingWrapper.childNodes[1];
  assert.equal(existingCanvas.getContext().draws, 1);
  const added = h.element('p', 'A freshly loaded log');
  const picture = h.element('img'); picture.className = 'guestbook-art';
  h.mutate();
  const addedWrapper = added.childNodes[0], addedCanvas = addedWrapper.childNodes[1];
  assert.equal(addedWrapper.className, 'museum-horror-copy', 'new application text is covered during mutation delivery');
  assert.equal(addedWrapper.childNodes[0].className, 'museum-horror-original');
  assert.equal(picture.classList.contains('museum-horror-art-covered'), true);
  const artCanvas = h.canvases.find(canvas => canvas.className === 'museum-horror-art');
  assert.ok(artCanvas);
  assert.equal(artCanvas.parentNode, picture.parentNode);
  assert.equal(addedCanvas.getContext().draws, 0, 'covering does not draw new glyphs early');
  assert.equal(existingCanvas.getContext().draws, 1, 'covering does not redraw the rest of the page');
  assert.equal(artCanvas.getContext().imageDraws, 0, 'art painting also stays on the existing animation cadence');
  ui.update(1 / 48);
  assert.equal(addedCanvas.getContext().draws, 0);
  ui.update(1 / 48);
  assert.equal(addedCanvas.getContext().draws, 1);
  assert.equal(existingCanvas.getContext().draws, 2);
  assert.equal(artCanvas.getContext().imageDraws, 1);
  addedWrapper.childNodes[0].childNodes[0].data = 'Application updated text';
  h.mutate();
  assert.equal(added.childNodes[0], addedWrapper);
  assert.equal(addedCanvas.getContext().draws, 1, 'a text update only invalidates the next glyph frame');
  ui.dispose();
  assert.equal(added.textContent, 'Application updated text');
  assert.equal(picture.classList.contains('museum-horror-art-covered'), false);
  const after = h.element('p', 'After disposal');
  h.mutate();
  assert.equal(after.childNodes[0].nodeType, 3, 'late queued observer callbacks leave normal content alone');
});
