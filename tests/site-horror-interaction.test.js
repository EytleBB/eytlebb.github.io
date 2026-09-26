const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(new URL('../js/site-horror-interaction.js', `file://${__filename}`), 'utf8');

class Element {
  constructor(tag, attributes = {}, children = []) {
    this.nodeType = 1; this.tagName = tag.toLowerCase(); this.attributes = new Map(Object.entries(attributes));
    this.children = []; this.parentElement = null; this.writes = 0; this.value = '';
    const classes = new Set((attributes.class || '').split(/\s+/).filter(Boolean));
    this.classList = {
      add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value),
      values: () => [...classes],
    };
    children.forEach(child => this.append(child));
  }
  append(child) { child.parentElement = this; this.children.push(child); return child; }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); this.writes++; }
  removeAttribute(name) { if (this.attributes.delete(name)) this.writes++; }
  get form() { return this.closest('form'); }
  matches(selector) {
    return selector.split(',').some(part => {
      let rule = part.trim(), matches = true;
      rule = rule.replace(/:not\(([^)]*)\)/g, (_, negative) => { if (this.matches(negative)) matches = false; return ''; });
      const tag = rule.match(/^[\w-]+/);
      if (tag && tag[0] !== this.tagName) matches = false;
      for (const match of rule.matchAll(/#([\w-]+)/g)) if (this.getAttribute('id') !== match[1]) matches = false;
      for (const match of rule.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(match[1])) matches = false;
      for (const match of rule.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)) {
        if (!this.hasAttribute(match[1]) || (match[2] !== undefined && this.getAttribute(match[1]) !== match[2])) matches = false;
      }
      return matches;
    });
  }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) {
    const result = [];
    for (const child of this.children) {
      if (child.matches(selector)) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function eventTarget() {
  const handlers = new Map();
  return { handlers, addEventListener(type, listener, options) {
    if (!handlers.has(type)) handlers.set(type, []);
    handlers.get(type).push({ listener, options });
  }, emit(type, target, options = {}) {
    const event = { type, target, key: '', defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...options };
    for (const { listener } of handlers.get(type) || []) {
      listener(event); if (event.stopped) break;
    }
    return event;
  } };
}
function harness({ surface = 'site', active = false, focused = false, bodyReady = true, api = true } = {}) {
  let enabled = active, selectionClears = 0;
  const root = new Element('html'); root.dataset = { horrorSurface: surface };
  const body = new Element('body'); root.append(body);
  const link = body.append(new Element('a', { href: '/gallery', title: 'Original navigation', 'aria-label': 'Gallery' }));
  const span = link.append(new Element('span'));
  const image = body.append(new Element('img', { src: '/images/original.webp', title: 'Original artwork' }));
  const canvas = body.append(new Element('canvas'));
  const copy = body.append(new Element('span', { class: 'museum-horror-copy' }));
  const button = body.append(new Element('button', { title: 'Original button' }));
  const close = body.append(new Element('button', { id: 'ov-close' }));
  const exit = body.append(new Element('a', { id: 'exit-btn', href: '/', title: 'Exit museum' }));
  const form = body.append(new Element('form'));
  const input = form.append(new Element('input', { type: 'text', placeholder: 'Original placeholder' })); input.value = 'visitor draft';
  const submitter = form.append(new Element('button', { type: 'submit' }));
  const textarea = body.append(new Element('textarea')); textarea.value = 'more draft';
  const contenteditable = body.append(new Element('div', { contenteditable: 'true' }));
  const noneditable = body.append(new Element('div', { contenteditable: 'false' }));
  const observers = [], timers = new Map();
  const document = Object.assign(eventTarget(), { documentElement: root, body: bodyReady ? body : null, activeElement: focused ? input : body });
  const window = Object.assign(eventTarget(), {
    setTimeout(callback, delay) { const id = timers.size + 1; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    getSelection() { return { removeAllRanges() { selectionClears++; } }; },
  });
  if (api) window.eytleHorror = { isActive: () => enabled };
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.observing = false; this.disconnects = 0; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; this.observing = true; }
    disconnect() { this.observing = false; this.disconnects++; }
  }
  vm.runInNewContext(source, { document, window, MutationObserver });
  return { root, body, document, window, link, span, image, canvas, copy, button, close, exit, form, input, submitter,
    textarea, contenteditable, noneditable, observers, timers,
    get selectionClears() { return selectionClears; },
    activate() { enabled = true; window.emit('eytle:horror', body); },
    ready() { document.body = body; document.emit('DOMContentLoaded', body); },
    dispatch(type, target = button, options) { return window.emit(type, target, options); },
    mutate(records) { for (const observer of observers) if (observer.observing) observer.callback(records); },
    expireFeedback() { const pending = [...timers.values()]; timers.clear(); pending.forEach(item => item.callback()); },
  };
}
function assertAllowed(event) { assert.equal(event.defaultPrevented, false); assert.equal(event.stopped, false); }
function assertBlocked(event) { assert.equal(event.defaultPrevented, true); assert.equal(event.stopped, true); }

const gestures = ['click', 'auxclick', 'submit', 'selectstart', 'copy', 'cut', 'dragstart', 'contextmenu'];

test('normal public and museum pages install only lightweight listeners with no mutations or interception', () => {
  for (const surface of ['site', 'museum']) for (const api of [true, false]) {
    const h = harness({ surface, api });
    assert.equal(h.observers.length, 0);
    assert.equal(h.selectionClears, 0);
    assert.equal(h.timers.size, 0);
    assert.equal(h.body.querySelectorAll('*').reduce((sum, node) => sum + node.writes, 0), 0);
    assert.equal(h.link.getAttribute('href'), '/gallery');
    assert.equal(h.image.hasAttribute('draggable'), false);
    assert.equal(h.body.classList.contains('site-horror-locked'), false);
    assert.equal(h.root.classList.contains('site-horror-covering'), false);
    for (const type of gestures) assertAllowed(h.dispatch(type, h.link));
    for (const key of ['Enter', ' ', 'a']) assertAllowed(h.dispatch('keydown', h.link, { key, ctrlKey: key === 'a' }));
    h.window.emit('pageshow', h.body); h.document.emit('DOMContentLoaded', h.body);
    assert.equal(h.observers.length, 0);
  }
});

test('administration pages are untouched even when the global latch is active', () => {
  const h = harness({ surface: 'admin', active: true });
  assert.equal(h.window.handlers.size, 0);
  assert.equal(h.document.handlers.size, 0);
  assert.equal(h.observers.length, 0);
  assert.equal(h.selectionClears, 0);
  assert.equal(h.link.getAttribute('title'), 'Original navigation');
  for (const type of gestures) assertAllowed(h.dispatch(type, h.link));
  assertAllowed(h.dispatch('keydown', h.button, { key: 'Enter' }));
});

test('active public controls reject clicks, auxiliary clicks and activation keys with one short feedback timer', () => {
  const h = harness({ active: true });
  for (const target of [h.button, h.span, { nodeType: 3, parentElement: h.span }]) {
    assertBlocked(h.dispatch('click', target));
    assertBlocked(h.dispatch('auxclick', target, { button: 1 }));
    assertBlocked(h.dispatch('keydown', target, { key: 'Enter' }));
    assertBlocked(h.dispatch('keydown', target, { key: ' ' }));
  }
  assert.equal(h.button.classList.contains('site-horror-denied'), true);
  assert.equal(h.link.classList.contains('site-horror-denied'), true);
  assert.equal(h.timers.size, 2, 'repeated gestures cannot stack duplicate feedback timers');
  assert.ok([...h.timers.values()].every(timer => timer.delay > 0 && timer.delay <= 300));
  h.expireFeedback();
  assert.equal(h.button.classList.contains('site-horror-denied'), false);
  assert.equal(h.link.classList.contains('site-horror-denied'), false);
  for (const key of ['Escape', 'Tab', 'ArrowDown']) assertAllowed(h.dispatch('keydown', h.button, { key }));
  assertAllowed(h.dispatch('keydown', h.button, { key: 'Enter', ctrlKey: true }));
  assertAllowed(h.dispatch('click', h.close));
  assertAllowed(h.dispatch('keydown', h.close, { key: 'Enter' }));
});

test('public form submission and implicit Enter submission are rejected without modifying the typed draft', () => {
  const h = harness({ active: true, focused: true });
  assert.equal(h.selectionClears, 0, 'activation preserves a focused input selection');
  assertBlocked(h.dispatch('submit', h.form, { submitter: h.submitter }));
  assert.equal(h.submitter.classList.contains('site-horror-denied'), true);
  h.expireFeedback();
  assertBlocked(h.dispatch('submit', h.form));
  assert.equal(h.submitter.classList.contains('site-horror-denied'), true);
  assertBlocked(h.dispatch('keydown', h.input, { key: 'Enter' }));
  assert.equal(h.input.value, 'visitor draft');
  assertAllowed(h.dispatch('keydown', h.input, { key: ' ' }));
  assertAllowed(h.dispatch('keydown', h.textarea, { key: 'Enter' }));
});

test('activation removes browser tooltip/link escapes and disables dragging every image, including late additions', () => {
  const h = harness(); h.activate();
  assert.equal(h.selectionClears, 1);
  assert.equal(h.body.classList.contains('site-horror-locked'), true);
  assert.equal(h.link.hasAttribute('href'), false);
  assert.equal(h.link.hasAttribute('title'), false);
  assert.equal(h.link.getAttribute('role'), 'link');
  assert.equal(h.link.getAttribute('tabindex'), '0');
  assert.equal(h.link.getAttribute('aria-disabled'), 'true');
  assert.equal(h.link.getAttribute('aria-label'), 'Gallery');
  assert.equal(h.image.getAttribute('draggable'), 'false');
  assert.equal(h.input.hasAttribute('placeholder'), false);
  assert.equal(h.input.value, 'visitor draft');
  assert.equal(h.observers.length, 1);
  const added = h.body.append(new Element('div', { title: 'New text' }, [
    new Element('a', { href: 'https://example.test', title: 'New link', role: 'button', tabindex: '3' }),
    new Element('img', { src: '/new-original.webp' }),
  ]));
  h.mutate([{ type: 'childList', addedNodes: [added] }]);
  assert.equal(added.hasAttribute('title'), false);
  assert.equal(added.children[0].hasAttribute('href'), false);
  assert.equal(added.children[0].getAttribute('role'), 'button');
  assert.equal(added.children[0].getAttribute('tabindex'), '3');
  assert.equal(added.children[1].getAttribute('draggable'), 'false');
  h.link.setAttribute('href', '/rebound'); h.link.setAttribute('title', 'Rebound tooltip');
  h.mutate([{ type: 'attributes', target: h.link }]);
  assert.equal(h.link.hasAttribute('href'), false);
  assert.equal(h.link.hasAttribute('title'), false);
  h.input.setAttribute('placeholder', 'Rebound placeholder');
  h.mutate([{ type: 'attributes', target: h.input }]);
  assert.equal(h.input.hasAttribute('placeholder'), false);
  const observer = h.observers[0];
  assert.ok(observer.disconnects >= 3 && observer.observing, 'self mutations are isolated before observation resumes');
  assert.ok(observer.options.attributeFilter.includes('placeholder'));
  h.window.emit('pageshow', h.body); h.activate();
  assert.equal(h.observers.length, 1, 'repeat activation reuses the same observer');
});

test('copy, selection, dragging and context menus are blocked for source-bearing content but preserved in editables', () => {
  for (const surface of ['site', 'museum']) {
    const h = harness({ surface, active: true });
    for (const target of [h.image, h.canvas, h.link, h.copy]) {
      assertBlocked(h.dispatch('selectstart', target));
      const clipboard = [];
      assertBlocked(h.dispatch('copy', target, { clipboardData: { setData: (...args) => clipboard.push(args) } }));
      assert.deepEqual(clipboard, [['text/plain', '']]);
      assertBlocked(h.dispatch('cut', target));
      let cleared = false;
      assertBlocked(h.dispatch('dragstart', target, { dataTransfer: { clearData: () => { cleared = true; } } }));
      assert.equal(cleared, true);
      assertBlocked(h.dispatch('contextmenu', target));
    }
    assertBlocked(h.dispatch('keydown', h.body, { key: 'a', ctrlKey: true }));
    assertBlocked(h.dispatch('keydown', h.noneditable, { key: 'A', metaKey: true }));
    for (const target of [h.input, h.textarea, h.contenteditable]) {
      for (const type of ['copy', 'cut', 'selectstart', 'dragstart', 'contextmenu']) assertAllowed(h.dispatch(type, target));
      assertAllowed(h.dispatch('keydown', target, { key: 'a', ctrlKey: true }));
    }
  }
});

test('active museum retains navigation, exit, knife controls, movement and form submission', () => {
  const h = harness({ surface: 'museum', active: true });
  assert.equal(h.body.classList.contains('site-horror-locked'), false);
  assert.equal(h.exit.getAttribute('href'), '/');
  assert.equal(h.link.getAttribute('href'), '/gallery');
  assert.equal(h.exit.hasAttribute('title'), false);
  assert.equal(h.image.getAttribute('draggable'), 'false');
  assert.equal(h.input.getAttribute('placeholder'), 'Original placeholder');
  for (const type of ['click', 'auxclick']) for (const target of [h.canvas, h.button, h.exit]) assertAllowed(h.dispatch(type, target));
  for (const key of ['w', 'a', 's', 'd', 'q', 'f', 'e', '1', '3', 'Escape', ' ', 'Enter']) {
    assertAllowed(h.dispatch('keydown', h.canvas, { key }));
  }
  assertAllowed(h.dispatch('submit', h.form, { submitter: h.submitter }));
});

test('a head script waits for the body before scrubbing an already active page', () => {
  const h = harness({ active: true, bodyReady: false });
  assert.equal(h.observers.length, 0);
  assert.equal(h.root.classList.contains('site-horror-covering'), true, 'initial active head blocks the original-text first paint');
  assert.equal(h.link.getAttribute('href'), '/gallery');
  h.ready();
  assert.equal(h.link.hasAttribute('href'), false);
  assert.equal(h.observers.length, 1);
});


test('pagehide clears temporary fault feedback and timers before a BFcache return', () => {
  const h = harness({ active: true });
  assertBlocked(h.dispatch('click', h.button));
  assert.equal(h.timers.size, 1);
  h.window.emit('pagehide', h.body);
  assert.equal(h.timers.size, 0);
  assert.equal(h.button.classList.contains('site-horror-denied'), false);
  h.window.emit('pageshow', h.body);
  assertBlocked(h.dispatch('click', h.button));
  assert.equal(h.timers.size, 1);
});
